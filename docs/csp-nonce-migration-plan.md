# CSP `unsafe-inline` 排除（nonce 化）影響調査と実装プラン

作成日: 2026-06-23 / 対象: `script-src` の `'unsafe-inline'` 排除（セキュリティ監査 #4）

## 決定（2026-06-23・オーナー承認）
**Option C を採用＝`script-src 'unsafe-inline'` は意識的に維持する（追認）。**
公開ページは静的配信で XSS 注入点が現状無く実務リスクが低い一方、nonce 化（Option A）は
全公開ページの動的化を伴い、CDN 配信の速度・Hobby プランの Function コスト・継続運用を失うため。
本ドキュメントは「将来 nonce 化が必要になった場合の実装プラン」として保管する。
再検討のトリガー: 公開面でユーザー入力を HTML として描画する機能が増えたとき。

## 背景・目的
- MDN HTTP Observatory で唯一の減点源（−20, B+）が CSP の `script-src 'unsafe-inline'`。Snyk も同点を警告。
- `'unsafe-inline'` があると XSS 時にインラインスクリプト注入を CSP で防げず、CSP の XSS 防御効果がほぼ無効。
- これを排除できれば Observatory は A+ 圏（100/115 付近）に到達する。
- CSP のその他の項目は既に堅牢: `object-src 'none'` / `base-uri 'self'` / `frame-ancestors 'none'` / `form-action 'self'` / 本番は `'unsafe-eval'` 排除済み。設定は `next.config.ts` の `securityHeaders`。

## 現状調査（事実ベース・2026-06-23 時点）
- Next.js **16.2.6** / App Router / `@next/third-parties ^16.2.7`。
- 公開ページは**静的生成（SSG/プリレンダ）**。
  - `src/app/page.tsx`（トップ）, `src/app/shop/page.tsx`, `src/app/shop/product/[key]/page.tsx`（`generateStaticParams` で SSG）等。
  - 本番レスポンスは `x-vercel-cache: PRERENDER / HIT`（CDN 配信）。
  - 公開ページに `next/headers`(cookies/headers) 使用なし＝動的化要因なし。
- 動的なのは API ルート群と `src/app/shop/order/[id]/page.tsx`（`force-dynamic`）のみ。
- インラインスクリプトの実体（本番トップ HTML を実測）:
  - **実行可能インライン `<script>`（type なし）が 16 個** — Next.js App Router のハイドレーション/RSC ストリーミング（`self.__next_f.push(...)` 等）。**すべて nonce なし**。→ `'unsafe-inline'` が必要な主因。
  - `<script type="application/ld+json">` 1 個（JSON-LD, ブラウザは実行しない＝厳密には script-src の実行制約対象外）。`src/app/layout.tsx:119`, `src/app/shop/product/[key]/page.tsx:50`。
  - GA は `@next/third-parties` の `<GoogleAnalytics>`（`src/app/layout.tsx:132`）。内部で next/script を使い、インライン gtag 初期化を注入する。
- ソース上の生 `<script>` / `dangerouslySetInnerHTML`:
  - `src/app/layout.tsx` JSON-LD
  - `src/app/shop/product/[key]/page.tsx` JSON-LD
  - `src/app/account/AccountClient.tsx:62`, `src/components/auth/UserMenu.tsx:26` は **SVG 文字列の埋め込み**（`<script>` ではない＝CSP script-src 非対象）。

## 核心的制約：nonce 化 ⇒ 動的レンダリング必須
- nonce はリクエストごとに変わる値で、HTML 内のインライン `<script nonce>` と CSP ヘッダーの `'nonce-…'` を一致させる方式。
- **静的プリレンダ済みページには per-request nonce を埋め込めない**。Next.js は middleware の CSP ヘッダーに nonce があれば自前スクリプト（フレームワーク/next/script）へ自動伝播するが、これは**動的レンダリング時のみ**機能する。
- 上記 16 個のフレームワークインラインはストリーミング内容が可変のため **hash 方式（sha256）では現実的に網羅不能**（App Router の宿命）。
- 結論: `script-src` から `'unsafe-inline'` を外すには、公開ページを**動的レンダリング化**して nonce を使うのが唯一の現実解。静的配信（CDN/PRERENDER）の利点を失う。

## 選択肢比較
| 案 | 内容 | セキュリティ | コスト/リスク | 採否 |
|---|---|---|---|---|
| **A. nonce + strict-dynamic（動的化）** | middleware で nonce 生成、全公開ページを動的レンダリング、`script-src 'self' 'nonce-…' 'strict-dynamic'` | ◎ Observatory A+ | 静的配信喪失・関数実行増（Fluid Compute で緩和）・TTFB 増・回帰リスク中 | 候補 |
| B. hash 方式（静的維持） | インラインを sha256 で許可 | ○ | フレームワーク 16 個の可変インラインを網羅できず**不成立** | 却下 |
| C. unsafe-inline 維持＋周辺強化（現状追認） | static のまま、他CSP項目の堅牢性で受容。リスクを文書化 | △（script-src は弱いまま） | 追加コストゼロ・回帰ゼロ | 候補（既定） |
| D. パス別CSP（静的=unsafe-inline / 動的=nonce） | middleware でパスごとに CSP 出し分け | △ | 攻撃面の大半を占める静的ページが unsafe-inline のまま＝便益薄・複雑 | 却下 |

## 推奨
- **既定は C（追認＋文書化）**。本サイトは意図的に静的（性能/コスト/SEO 上の利点があり PRERENDER で実証）で、インラインの実体は (1) フレームワークのハイドレーション (2) GA (3) JSON-LD のみ。ユーザー生成 HTML の注入点が公開面に無く、`object-src/base-uri/form-action/frame-ancestors` も固められているため、`unsafe-inline` 残存の実務リスクは低い。Observatory A+ を「追わない」ことを意識的な判断として記録する。
- **A+ スコアと最大の XSS 耐性を優先する場合は A** を実施。下記に手順を用意。

## Option A 実装手順（採用時）
1. **nonce 生成を middleware に追加**（`src/middleware.ts`）
   - 各リクエストで `crypto.randomUUID()` 等から base64 nonce を生成。
   - レスポンスに CSP ヘッダーを設定（`next.config.ts` の CSP からは `script-src` を外し、middleware 側で動的に組む。HSTS 等の他ヘッダーは `next.config.ts` のまま）。
   - `script-src 'self' 'nonce-{nonce}' 'strict-dynamic' https: 'unsafe-inline'`（後方互換: `strict-dynamic` 対応ブラウザは nonce のみ採用し `unsafe-inline`/`https:` を無視。古いブラウザ向けフォールバック）。
   - `style-src` の `'unsafe-inline'` は別途検討（フォントとインラインスタイルで必要。スコア対象外なので後回し可）。
   - matcher を公開ページにも拡張（現状は `/admin`,`/api/admin` のみ）。静的アセット (`/_next/static`, 画像) は除外。
2. **nonce を描画に伝播**
   - Next.js は CSP ヘッダーの nonce を自動でフレームワーク/next/script に付与する（要動的レンダリング）。
   - JSON-LD の手書き `<script>` には `headers()` から nonce を読んで明示付与（`src/app/layout.tsx`, `src/app/shop/product/[key]/page.tsx`）。または JSON-LD は実行されないため許容するか検証。
   - `@next/third-parties` の `<GoogleAnalytics>` が nonce を受けるか要検証（受けない場合は代替実装）。
3. **動的レンダリング化**
   - middleware で nonce を読む＝動的化のトリガー。各公開ページが SSR になることを確認。PPR(部分プリレンダ) 併用余地も検討。
4. **CSP から不要ソース整理**
   - `strict-dynamic` 採用後は `script-src` の `https://www.googletagmanager.com https://www.google-analytics.com` は nonce 経由ロードに置換可能（明示ホスト列挙を削減）。

## リスクと検証チェックリスト（Option A）
- [ ] 全公開ページが正常描画（ハイドレーション崩れ・コンソールに CSP violation が出ない）
- [ ] GA が発火（`dataLayer`/gtag リクエストが飛ぶ）
- [ ] 構造化データ（JSON-LD）がリッチリザルトテストを通る
- [ ] `x-vercel-cache` の変化（PRERENDER→ 動的）と TTFB/コストの計測
- [ ] Vercel Functions 実行数・課金影響の確認（Fluid Compute 前提）
- [ ] MDN Observatory 再スキャンで CSP 減点解消（A+）
- [ ] Stripe/checkout・パスキー等の既存機能に CSP violation が出ない
- [ ] ロールバック: `next.config.ts` の static CSP に戻す＋ middleware matcher を元に戻すだけで即時復旧

## メモ
- 静的→動的化はアーキテクチャ判断のためオーナー合意が前提。
- 本ドキュメントは調査時点の事実。実装前に再度 `next.config.ts` / `src/middleware.ts` / `src/app/layout.tsx` の最新を確認すること。
