// AWS Signature Version 4 の署名（Pour Over 8）。
//
// **用途はひとつだけ**: cron の中継 Lambda が、IAM 認証（Pour Over 5 の
// `protection: 'oac-with-edge-signing'`）で閉じた **server Lambda の Function URL** を
// 直接叩くために署名する。汎用の SigV4 実装ではない。
//
// 🔑 **なぜ SDK を使わず自前で書いたか**
// ① 依存を増やさないため。この関数は Lambda 実行ロールの一時資格情報を扱うので、
//    バンドルに入る第三者コードは少ないほどよい。
// ② SST の Function ビルド（esbuild）は `@/` の tsconfig paths を解決しない前提で
//    書いており、**node 組み込みモジュール以外を import しない**方針にしてある。
// ③ 署名する対象が極端に狭い（固定ホスト・ASCII のみのパス・クエリなし・GET）ため、
//    SigV4 の難所（S3 の二重エンコード、チャンク転送、presign）が一切出てこない。
//
// 正しさは AWS 公式の SigV4 テストスイート `get-vanilla` のベクタで固定してある
// （`src/__tests__/sigv4.test.ts`）。実装を触ったらそのテストが落ちる。
//
// ⚠️ **`Authorization` ヘッダは SigV4 が占有する。** cron ルートが従来使っていた
// `Authorization: Bearer <CRON_SECRET>` はここに同居できないため、
// 中継経由では `x-cron-secret` ヘッダで渡す（`src/lib/cronAuth.ts`）。

import { createHash, createHmac } from 'crypto';

const ALGORITHM = 'AWS4-HMAC-SHA256';

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  /** Lambda 実行ロールのような一時資格情報でのみ入る。あれば署名対象に含める。 */
  sessionToken?: string;
}

export interface SignRequestInput {
  method: string;
  /** 絶対 URL。パスは ASCII のみを想定する（cron のルートは固定）。 */
  url: string;
  /** 署名対象に含める追加ヘッダ。`host` / `x-amz-date` / `x-amz-security-token` は自動で足す。 */
  headers?: Record<string, string>;
  /** 本文。GET なら空文字。 */
  body?: string;
  region: string;
  /** Function URL の呼び出しは `lambda`。 */
  service: string;
  credentials: SigV4Credentials;
  /** テストのために時刻を注入できるようにしてある。 */
  now?: Date;
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/** `20150830T123600Z` と `20150830` を作る。 */
function formatDate(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/**
 * RFC 3986 のエンコード。`encodeURIComponent` が素通しする `!'()*` まで潰す。
 * クエリ文字列の正規化にだけ使う（本用途ではクエリなしだが、後から付けたときに
 * 黙って署名が壊れないように実装しておく）。
 */
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalQueryString(url: URL): string {
  const pairs: [string, string][] = [];
  url.searchParams.forEach((value, key) => pairs.push([key, value]));
  pairs.sort(([aK, aV], [bK, bV]) => (aK === bK ? (aV < bV ? -1 : 1) : aK < bK ? -1 : 1));
  return pairs.map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`).join('&');
}

/**
 * リクエストに SigV4 署名を施し、**そのまま `fetch` に渡せるヘッダ一式**を返す。
 * 入力の `headers` も含めて返すので、呼び出し側は返り値だけを使えばよい。
 */
export function signRequest(input: SignRequestInput): Record<string, string> {
  const { method, headers = {}, body = '', region, service, credentials } = input;
  const url = new URL(input.url);
  const { amzDate, dateStamp } = formatDate(input.now ?? new Date());

  // 署名対象のヘッダ。host と x-amz-date は必須、一時資格情報なら
  // x-amz-security-token も**署名に含めないと** InvalidSignature になる。
  const signed: Record<string, string> = {
    ...headers,
    host: url.host,
    'x-amz-date': amzDate,
  };
  if (credentials.sessionToken) signed['x-amz-security-token'] = credentials.sessionToken;

  const names = Object.keys(signed)
    .map((n) => n.toLowerCase())
    .sort();
  const lowered = Object.fromEntries(
    Object.entries(signed).map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, ' ')]),
  );

  const signedHeaders = names.join(';');
  const canonicalHeaders = names.map((n) => `${n}:${lowered[n]}\n`).join('');
  const payloadHash = sha256Hex(body);

  const canonicalRequest = [
    method.toUpperCase(),
    url.pathname || '/',
    canonicalQueryString(url),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${credentials.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign).toString('hex');

  return {
    ...signed,
    Authorization:
      `${ALGORITHM} Credential=${credentials.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
