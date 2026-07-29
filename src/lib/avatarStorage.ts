// アバター画像の保管（Pour Over 4: Vercel Blob → S3）。
//
// 🔴 **なぜ presigned PUT なのか（設計の理由。素直に作ると壊れる）**
// Pour Over 5 で Function URL を `oac-with-edge-signing` で保護すると、経路に
// Lambda@Edge が入り **リクエストボディが 1MB 上限**になる。現行のアバターは
// 2MB まで許しているので、サーバ経由アップロードのままだと 5 と衝突する。
// ブラウザから S3 へ直接 PUT すれば大きなボディが CloudFront/Lambda を通らず、
// 衝突そのものが消える。
//
// 🔴 **なぜ2バケットなのか（検閲の順序が逆転するため）**
// Vercel Blob 版は「Rekognition に通してから `put()`」＝ **落ちた画像は保存されない**
// 順序だった。presigned にすると **PUT が先・検閲が後**に逆転するため、
// confirm を呼ばずに放置すれば「未検閲のオブジェクト」が残る。
// そこで置き場を分ける:
//
//   UPLOAD バケット … 非公開。presign の宛先。ライフサイクルで1日後に自動削除
//   PUBLIC バケット … CloudFront(OAC) からのみ読める。**検閲に通ったものだけ**が入る
//
// 同一バケットのプレフィクス分割にしなかったのは、CDN を被せた時点で
// `pending/` も配信対象になり、ビヘイビアで塞ぐ運用に頼ることになるため。
// バケットが違えば「公開される場所に未検閲物が置けない」ことが構造で保証される。
//
// 📌 移送すべき既存データは無い（本番の `avatarUrl` 保持ユーザーは0件・Blob ストアも空）。

import { randomUUID } from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  RekognitionClient,
  DetectModerationLabelsCommand,
} from '@aws-sdk/client-rekognition';

const REGION = 'ap-northeast-1';

export const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

/** 拡張子は MIME から導く。ユーザー入力のファイル名は一切使わない。 */
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const ALLOWED_TYPES = new Set(Object.keys(EXT_BY_TYPE));

/** presigned URL の有効期限。アップロードを始めるまでの猶予でよいので短くする。 */
const PRESIGN_EXPIRES_SEC = 300;

let s3: S3Client | undefined;
function getS3(): S3Client {
  s3 ??= new S3Client({ region: REGION });
  return s3;
}

let rekognition: RekognitionClient | undefined;
function getRekognition(): RekognitionClient {
  rekognition ??= new RekognitionClient({ region: REGION });
  return rekognition;
}

/**
 * 設定済みか。未設定なら呼び出し側は 503 を返す。
 *
 * 🔴 **フェイルクローズ**。バケット名が無いまま動かすと、`undefined` を
 * バケット名として投げるか、最悪「別のバケットを掴む」ことになる。
 */
export function isAvatarStorageConfigured(): boolean {
  return Boolean(process.env.AVATAR_UPLOAD_BUCKET && process.env.AVATAR_BUCKET);
}

function uploadBucket(): string {
  const name = process.env.AVATAR_UPLOAD_BUCKET;
  if (!name) throw new Error('AVATAR_UPLOAD_BUCKET is not set');
  return name;
}

function publicBucket(): string {
  const name = process.env.AVATAR_BUCKET;
  if (!name) throw new Error('AVATAR_BUCKET is not set');
  return name;
}

/**
 * 公開 URL の基点（アバター専用 CloudFront）。末尾のスラッシュは持たない。
 *
 * 📌 サイト本体の CloudFront とは**別のディストリビューション**。切替（Pour Over 13）より
 * 前に本番で使い始めるため、サイト側のディストリビューションにはまだ相乗りできない。
 */
function publicBaseUrl(): string {
  const base = process.env.AVATAR_BASE_URL;
  if (!base) throw new Error('AVATAR_BASE_URL is not set');
  return base.replace(/\/+$/, '');
}

export function extensionFor(contentType: string): string | undefined {
  return EXT_BY_TYPE[contentType];
}

/**
 * アップロード先のキーを作る。
 *
 * 🔴 **userId をキーに含めるのは、confirm で持ち主を検証するため**。
 * ランダムな UUID だけだと「他人が上げた未検閲オブジェクトのキー」を
 * confirm に渡されたときに弾けない。
 */
export function buildUploadKey(userId: string, ext: string): string {
  return `pending/${userId}/${randomUUID()}.${ext}`;
}

/** そのキーが本当にこのユーザーのものか。confirm の入口で必ず通す。 */
export function isOwnUploadKey(key: string, userId: string): boolean {
  return /^pending\/[^/]+\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)
    && key.startsWith(`pending/${userId}/`);
}

/** 検閲を通ったオブジェクトの置き場所。pending と同じ UUID を引き継ぐ。 */
export function publicKeyFor(uploadKey: string): string {
  return uploadKey.replace(/^pending\//, 'avatars/');
}

/** 公開 URL から S3 キーへ戻す。旧アバターの削除に使う。 */
export function keyFromPublicUrl(url: string): string | undefined {
  const base = publicBaseUrl();
  if (!url.startsWith(`${base}/`)) return undefined;
  const key = url.slice(base.length + 1);
  return /^avatars\/[^/]+\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key) ? key : undefined;
}

export function publicUrlFor(key: string): string {
  return `${publicBaseUrl()}/${key}`;
}

/**
 * ブラウザが直接 PUT するための署名付き URL。
 *
 * ⚠️ presigned **PUT** はサイズを署名に縛れない（POST policy と違う）。
 * 宣言サイズを信じずに、confirm 側で `HeadObject` の実測値を見て弾くこと。
 * 放置されたオブジェクトはバケットのライフサイクルが1日で消す。
 */
export async function createUploadUrl(
  key: string,
  contentType: string,
): Promise<string> {
  return getSignedUrl(
    getS3(),
    new PutObjectCommand({
      Bucket: uploadBucket(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: PRESIGN_EXPIRES_SEC },
  );
}

export type UploadedObject = { size: number; contentType: string | undefined };

export async function headUpload(key: string): Promise<UploadedObject | undefined> {
  try {
    const res = await getS3().send(
      new HeadObjectCommand({ Bucket: uploadBucket(), Key: key }),
    );
    return { size: res.ContentLength ?? 0, contentType: res.ContentType };
  } catch {
    // 未アップロード / 期限切れで消えた、のどちらか。呼び出し側は 404 相当で扱う。
    return undefined;
  }
}

/**
 * S3 上のオブジェクトを検閲する。
 *
 * 📌 Blob 版は `Image: { Bytes }`（サーバを通った生バイト）だったが、直 PUT では
 * 画像が Lambda を通らないので `Image: { S3Object }` に変える。Rekognition は
 * **呼び出し元の権限**でオブジェクトを読むため、実行ロールに UPLOAD バケットの
 * `s3:GetObject` が要る（`sst.config.ts` で付与済み）。
 *
 * 🔴 失敗時は `safe: false`。検閲できないものを通さない（Blob 版と同じ方針）。
 */
export async function moderateUpload(
  key: string,
): Promise<{ safe: boolean; reason?: string }> {
  try {
    const res = await getRekognition().send(
      new DetectModerationLabelsCommand({
        Image: { S3Object: { Bucket: uploadBucket(), Name: key } },
        MinConfidence: 70,
      }),
    );
    const labels = res.ModerationLabels ?? [];
    if (labels.length > 0) {
      return { safe: false, reason: labels.map((l) => l.Name).join(', ') };
    }
    return { safe: true };
  } catch {
    return { safe: false, reason: 'moderation_unavailable' };
  }
}

/** 検閲を通ったオブジェクトを公開バケットへ移す。戻り値は公開 URL。 */
export async function publishUpload(
  uploadKey: string,
  contentType: string,
): Promise<string> {
  const key = publicKeyFor(uploadKey);
  await getS3().send(
    new CopyObjectCommand({
      Bucket: publicBucket(),
      Key: key,
      CopySource: `${uploadBucket()}/${uploadKey}`,
      ContentType: contentType,
      MetadataDirective: 'REPLACE',
    }),
  );
  return publicUrlFor(key);
}

/**
 * pending の後始末。**best-effort**。
 *
 * 失敗してもライフサイクルが1日で消すので、ユーザーの操作を止める理由にはならない。
 * ただし黙って消さず、呼び出し側が握り潰した事実を出せるよう真偽を返す。
 */
export async function discardUpload(key: string): Promise<boolean> {
  try {
    await getS3().send(
      new DeleteObjectCommand({ Bucket: uploadBucket(), Key: key }),
    );
    return true;
  } catch {
    return false;
  }
}

/** 旧アバターの削除。**best-effort**（消えなくても新しい URL は有効）。 */
export async function deletePublished(url: string): Promise<boolean> {
  const key = keyFromPublicUrl(url);
  if (!key) return false;
  try {
    await getS3().send(
      new DeleteObjectCommand({ Bucket: publicBucket(), Key: key }),
    );
    return true;
  } catch {
    return false;
  }
}
