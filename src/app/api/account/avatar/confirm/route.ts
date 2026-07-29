import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  canChangeAvatar,
  getAvatarRecord,
  setUploadedAvatar,
} from '@/lib/avatarAccount';
import {
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
  deletePublished,
  discardUpload,
  headUpload,
  isAvatarStorageConfigured,
  isOwnUploadKey,
  moderateUpload,
  publishUpload,
} from '@/lib/avatarStorage';

export const dynamic = 'force-dynamic';
export const preferredRegion = ['hnd1'];

// POST: アップロード済みオブジェクトを検閲し、通ったものだけを公開する（Pour Over 4 の3段目）。
//
// 🔴 **この段が丸ごと「Blob 版で put() の前にあった検閲」の代わり**。
// presigned にしたことで PUT が先・検閲が後に逆転しているので、
// **落ちたオブジェクトはここで必ず消す**（公開バケットへは一切コピーしない）。
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAvatarStorageConfigured()) {
    return NextResponse.json(
      { error: '画像アップロードは現在利用できません' },
      { status: 503 },
    );
  }

  const userId = session.user.id;
  const body = (await req.json().catch(() => null)) as { key?: string } | null;
  const key = body?.key ?? '';

  // 🔴 他人が上げたオブジェクトを公開させないための持ち主検証。
  // キーの形と userId プレフィクスの両方を見る。
  if (!isOwnUploadKey(key, userId)) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
  }

  const record = await getAvatarRecord(userId);
  if (!canChangeAvatar(record)) {
    // 受け取り済みの URL を使い回した連打を、ここでも止める。
    await discardUpload(key);
    return NextResponse.json(
      { error: 'アイコンの変更は1日1回までです' },
      { status: 429 },
    );
  }

  // 実体の検査。presigned PUT は署名でサイズも型も縛れないため、
  // **申告ではなく S3 上の実測値**を見る。
  const object = await headUpload(key);
  if (!object) {
    return NextResponse.json(
      { error: 'アップロードが見つかりません。もう一度お試しください' },
      { status: 404 },
    );
  }
  if (object.size > MAX_FILE_SIZE || !ALLOWED_TYPES.has(object.contentType ?? '')) {
    await discardUpload(key);
    return NextResponse.json(
      { error: 'ファイルサイズは2MB以下・JPEG/PNG/WebPのみ対応です' },
      { status: 400 },
    );
  }

  const moderation = await moderateUpload(key);
  if (!moderation.safe) {
    await discardUpload(key);
    return NextResponse.json(
      { error: 'この画像はアップロードできません', reason: moderation.reason },
      { status: 422 },
    );
  }

  const url = await publishUpload(key, object.contentType!);

  // 公開できた後の後始末はすべて best-effort。ここで失敗しても
  // 新しいアバターは有効で、pending はライフサイクルが1日で消す。
  await discardUpload(key);
  if (record.avatarUrl) {
    await deletePublished(record.avatarUrl);
  }

  await setUploadedAvatar(userId, url);

  return NextResponse.json({ avatarPreset: null, avatarUrl: url });
}
