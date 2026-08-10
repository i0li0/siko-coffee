// オンデマンド再検証（`/api/revalidate`）の認可を1か所に集約する。
//
// 🔴🔴 **なぜ `Authorization` だけでは足りないのか（2026-08-10 に本番で実測して判明）**
// Pour Over 5 で Function URL を `AWS_IAM` にしたため、CloudFront はオリジンへの
// リクエストを OAC で SigV4 署名する。その署名は **`Authorization` ヘッダに入る**。
// KVS の `metadata.origin.originAccessControlConfig.signingBehavior` は **`always`** で、
// これは AWS の仕様上 **ビューワが送った `Authorization` を上書きする**。
// ＝ **CloudFront 経由では `Authorization: Bearer <secret>` はアプリに一切届かない。**
//
// これは `cronAuth.ts` に書かれている「`Authorization` を SigV4 の署名が占有する」と
// **同じ機構**だが、あちらは中継 Lambda → Function URL の経路の話として書かれていた。
// 🔑 **同じ機構がビューワ経路にも効くことが見落とされていた**ため、`/api/revalidate` は
// タスク13（2026-08-02 の DNS 切替）以降、**正しい秘密を送っても常に 401** だった。
// リポジトリ内に呼び出し元が無かったので誰も気づかなかった（＝実害は出ていない）。
//
// 📌 `Authorization` 形式も残す理由: soak 期間（Pour Over 14）は Vercel も本番を担い、
// そちらは CloudFront を通らないので `Authorization` がそのまま届く。
// **Vercel 解約（15〜16）のあとは `Authorization` 分岐を消してよい**
// （`cronAuth.ts` の同じ分岐＝16 の撤去リスト⑧ と足並みを揃える）。

import { safeEqual, verifyBearer } from '@/lib/safeCompare';

/**
 * 再検証の呼び出し元を検証する。`x-revalidate-secret: <secret>`（CloudFront 経由でも
 * 届く）と `Authorization: Bearer <secret>`（Vercel 経路・soak 中のみ意味を持つ）の
 * どちらでも通る。
 *
 * 🔴 `REVALIDATE_SECRET` 未設定なら**常に false**（フェイルクローズ）。
 */
export function isAuthorizedRevalidate(req: Request): boolean {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return false;

  const header = req.headers.get('x-revalidate-secret');
  if (header && safeEqual(header, secret)) return true;

  return verifyBearer(req.headers.get('authorization'), secret);
}
