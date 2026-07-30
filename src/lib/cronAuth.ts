// cron ルートの認可を1か所に集約する（Pour Over 8）。
//
// 🔴 **なぜ2つのヘッダを受けるのか（`Authorization` だけでは足りなくなった）**
// Vercel Cron は `Authorization: Bearer <CRON_SECRET>` を自動付与するので、4本の
// cron ルートはこれを検査していた。ところが AWS 側の経路（EventBridge Scheduler →
// 中継 Lambda → Function URL）では **`Authorization` を SigV4 の署名が占有する**
// （Pour Over 5 で Function URL を `AWS_IAM` にしたため）。同じヘッダに2つの認証情報は
// 載せられないので、中継からは `x-cron-secret` で渡す。
//
// 📌 **両方を受けるのは soak 期間（Pour Over 14）のため**。切替後もしばらくは
// Vercel と AWS の両方が本番を担い、Vercel 側は `Authorization` 形式のままである。
// Vercel 解約（Pour Over 15〜16）のあとは `Authorization` 分岐を消してよい。
//
// 🔑 AWS 経路では `x-cron-secret` は **SigV4 の署名対象**に含まれている
// （`src/functions/cronRelay.ts`）。経路上で足したり差し替えたりすれば署名検証で落ちる。
// つまり CRON_SECRET は IAM 認証に対する**二重化**であって、単独の防御線ではない。

import { safeEqual, verifyBearer } from '@/lib/safeCompare';

/**
 * cron の呼び出し元を検証する。`Authorization: Bearer <secret>`（Vercel Cron）と
 * `x-cron-secret: <secret>`（AWS の中継 Lambda）のどちらでも通る。
 *
 * 🔴 `CRON_SECRET` 未設定なら**常に false**（フェイルクローズ）。
 */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get('x-cron-secret');
  if (header && safeEqual(header, secret)) return true;

  return verifyBearer(req.headers.get('authorization'), secret);
}
