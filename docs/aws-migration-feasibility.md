# AWS 移行 実現可能性調査 — 全項目の現状パリティ検証

作成日: 2026-07-26 / 目的: **AWS 学習**を動機とした Vercel → AWS 移行で、現状の機能・セキュリティ水準を「同等以上」にできるかを項目別に検証する。

> 📒 **実施済みの作業・実測値・教訓は [pour-over-log.md](./pour-over-log.md) に分けてある。**
> 本書は「これから何をどの順でやるか」、ログは「何をして何が分かったか」。
> 覚えておくべき定数（証明書 ARN・**消してはいけない DNS レコード**・期限）もログ側にある。

## 結論

**32項目中31項目が「同等以上」に到達可能。** 唯一 Vercel Analytics / Speed Insights のみ同一製品としては移行不可だが、既存の Sentry + GA4 で機能的な代替は成立する。

セキュリティは**移行によって明確に向上する**（静的 AWS キーの排除、CloudTrail、Secrets Manager、AWS WAF の高機能化）。運用自由度も向上する（cron の日次制限からの解放）。

ただし **2つの地雷**があり、うち1件は現在の設定のままだと**本番が無限リダイレクトループで全停止する**。移行着手前に対処が必須。

---

## 前提（2026-07-26 実測）

| 項目 | 実測値 |
|---|---|
| Next.js | **16.2.11** |
| React | 19.2.4 |
| `@opennextjs/aws` 最新 | **4.1.0**（2026-07-21 リリース） |
| 同 peerDependencies | **`next: ">=15.5.21 <16 \|\| >=16.2.11"`** |
| API ルート | 52本 |
| cron ルート | 4本 |
| `next/image` 利用ファイル | 6 |
| `'use cache'` 利用 | **なし** |
| middleware matcher | `/admin/:path*`, `/api/admin/:path*` |

**重要**: 現行の Next.js 16.2.11 は OpenNext 4.1.0 のサポート下限にちょうど一致する。Next.js 16.0.x / 16.1.x は非対応のため、**ダウングレードは不可**。

---

## 項目別パリティ検証

凡例: ◎ 上回る / ○ 同等 / △ 工数を払えば同等 / ✕ 不可

### A. ホスティング・実行基盤

| # | 項目 | AWS での実現 | 判定 | 備考 |
|---|---|---|---|---|
| 1 | Next.js 16.2.11 実行 | OpenNext 4.1.0 + SST v3 | ○ | 下限ぴったり。項目29の追随リスク参照 |
| 2 | SSG / プリレンダ配信 | CloudFront + S3 | ○ | PoP 数は CloudFront が上 |
| 3 | SSR / RSC ストリーミング | Lambda response streaming | ○ | OpenNext 4.1.0 で API GW streaming wrapper 追加済 |
| 4 | ISR / `revalidatePath` | S3(キャッシュ) + DynamoDB(タグ) + SQS(再検証) | ○ | 自前運用になる分、可視性は上がる |
| 5 | middleware | OpenNext 対応済 | ○ | admin セッション/CSRF ロジックはそのまま動く |
| 6 | 画像最適化 | Image Optimization Lambda (sharp) | ○ | |
| 7 | API ルート 52本 | Lambda | ○ | |
| 8 | リージョン hnd1 | ap-northeast-1 | ◎ | **DynamoDB と同一リージョン内**。VPC エンドポイント経由でインターネットを介さない経路も選べる |

### B. セキュリティ

| # | 項目 | AWS での実現 | 判定 | 備考 |
|---|---|---|---|---|
| 9 | WAF レート制限 30/60s | AWS WAF rate-based rule | ◎ | 集約キー（IP/ヘッダ/Cookie/JA3）が柔軟。Hobby で使えない token bucket 相当も可 |
| 10 | WAF Bot challenge | WAF Challenge / CAPTCHA アクション | ◎ | ネイティブ機能。Bot Control 管理ルールは別料金（$10/月〜） |
| 11 | WAF geo 制限（≠JP deny） | geo match statement | ◎ | 追加料金なし。CloudFront 標準の地域制限も併用可 |
| 12 | **AWS 認証情報** | **Lambda 実行ロール** | ◎◎ | **静的キーが完全に不要になる。今回の移行で最大の改善** |
| 13 | シークレット管理 | SSM Parameter Store / Secrets Manager | ◎ | KMS 暗号化・ローテーション・IAM 制御・CloudTrail 記録 |
| 14 | admin セッション / CSRF / パスキー | アプリ層のまま | ○ | 影響なし |
| 15 | HSTS preload / apex 正規化 | CloudFront Response Headers Policy + Route53 ALIAS | ◎ | 配信層で完結。**ただし地雷1参照** |
| 16 | CSP ヘッダー | CloudFront Response Headers Policy | ◎ | アプリのビルドと独立して変更可能 |
| 17 | DDoS 緩和 | AWS Shield Standard | ○ | 無料・常時有効 |
| 18 | TLS 証明書 | ACM | ○ | 無料・自動更新 |
| 19 | 監査ログ | **CloudTrail** | ◎ | 全 API 呼び出しを記録。Vercel Pro のチーム監査ログより対象が広い |

### C. データ・ストレージ

| # | 項目 | AWS での実現 | 判定 | 備考 |
|---|---|---|---|---|
| 20 | Vercel Blob（アバター画像） | S3 | ◎ | バージョニング・ライフサイクル・KMS・署名 URL。**既存データの移送作業が必要** |
| 21 | DynamoDB / SES / Rekognition | 変更なし | ○ | すでに AWS。移行対象外 |

### D. 運用・可観測性

| # | 項目 | AWS での実現 | 判定 | 備考 |
|---|---|---|---|---|
| 22 | cron 4本 | **EventBridge Scheduler** | ◎◎ | **Hobby の「日次まで」制約が消滅**。分/秒単位可。在庫解放を即時化できる |
| 23 | 実行ログ | CloudWatch Logs | ◎ | 保持期間任意・Logs Insights・メトリクスフィルタ |
| 24 | Sentry | 変更なし | ○ | ホスト非依存 |
| 25 | Vercel Analytics / Speed Insights | **同一製品は移行不可** | ✕→△ | 代替: Sentry Performance（既存）+ GA4（既存）+ CloudWatch RUM。Web Vitals は Sentry で取得可能 |
| 26 | アラート通知 | CloudWatch Alarms + SNS | ◎ | **Vercel には無い機能**。エラー率・レイテンシで自動通知 |

### E. 開発体験・デプロイ

| # | 項目 | AWS での実現 | 判定 | 備考 |
|---|---|---|---|---|
| 27 | push で自動デプロイ | GitHub Actions + SST | ○ | 既存 `ci.yml` を拡張 |
| 28 | PR ごとのプレビュー環境 | SST の stage 機能 | △ | 実現可能。stage ごとに全リソースを作るため工数・コスト増 |
| 29 | `VERCEL_ENV` によるテーブル prefix 切替 | 独自 `STAGE` 環境変数へ書換 | ✅ | **完了（2026-07-29・実行順の 1）**。判定は `src/lib/stage.ts` に集約（`STAGE ?? VERCEL_ENV` の併存＝soak 対応、削除は 16⑥）。`src/lib/db.ts` はフェイルクローズに反転、`sentry.server`／`sentry.edge` を是正、死にコードの `sentry.client.config.ts` は削除。統合テストの `VERCEL_ENV=preview` ガードはフォールバックによりそのまま有効 |
| 30 | 即時ロールバック | Lambda alias + CloudFront 切替を自前構築 | △ | **Vercel のワンクリック復旧には工数を払っても届きにくい**。移行で最も劣化する項目 |
| 31 | プレビューのアクセス保護 | Lambda@Edge Basic 認証 / CloudFront 署名 | △ | 手作り |
| 32 | 環境変数の UI 管理 | SSM / Secrets Manager | ○ | GUI は劣るが IaC で宣言的に管理でき、再現性は上がる |

---

## 発見した地雷

### 🔴 地雷1: apex リダイレクトが無限ループする（本番全停止レベル）

**OpenNext issue [#1202](https://github.com/opennextjs/opennextjs-aws/issues/1202)（open, 2026-07-23 報告）**

OpenNext の `routeHasMatcher` は `next.config` の `has.value` を**アンカーなしの正規表現**として評価する。Next.js 本体は `^value$` でアンカーする。

問題のあった設定（`value` が素の文字列）:

```ts
has: [{ type: 'host', value: 'sikocoffee.com' }]
```

アンカーなしだと `/sikocoffee.com/.test("www.sikocoffee.com")` が **true** になる。つまり正規ホストである `www.sikocoffee.com` へのアクセスが、自分自身へ 308 リダイレクトし続ける = **サイト全停止**。

報告者は Cloudflare 版でこれを踏み、2026-07-23 に本番が完全停止している。

#### ✅ 対処済み（2026-07-27）— 明示アンカーで両エンジン対応

issue #1202 自身が案内している回避策（`value` を手動でアンカーする）を採用し、[next.config.ts](../next.config.ts) を修正した:

```ts
has: [{ type: 'host', value: '^sikocoffee\\.com$' }]
```

**なぜこれで両方正しいか**: Next.js は `new RegExp('^' + value + '$')` と自前で包むため `^^sikocoffee\.com$$` になるが、`^`/`$` はゼロ幅アサーションなので重複しても意味は変わらない。OpenNext は包まないので、明示アンカーがそのまま効く。実測:

| value | Next.js(Vercel) が www に一致 | OpenNext(AWS) が www に一致 |
|---|---|---|
| `sikocoffee.com` | false | **true ← 無限ループ** |
| `^sikocoffee\.com$` | false | false |

**Vercel 上の現在の挙動は一切変わらない**（どちらも false）＝移行前にリスクなしで先行適用できる。ドットもエスケープし、任意1文字として振る舞わないようにした。`siko-coffee.vercel.app` 側の規則にも同じ処置を施している。

この不変条件は [src/\_\_tests\_\_/hostRedirects.test.ts](../src/__tests__/hostRedirects.test.ts) が**両エンジンの意味論を再現して**検証する（`next.config.ts` を直接読むので設定と乖離しない）。再混入は CI で落ちる。

#### 移行時の最終形（Phase 2〜3）

上記はあくまで**移行前の安全化**であり、最終的には `next.config` の `redirects()` に依存せず **apex → www の正規化を CloudFront Function / Route53 側で行う**。AWS ではそちらが本来の作法で、HSTS を配信層（Response Headers Policy）で付与できるため、現在この redirect を使っている理由（リダイレクト応答にも完全な HSTS を乗せる）も同時に解消される。移設が済んだら `redirects()` の2規則と上記テストは削除してよい。

### 🟡 地雷2: Next.js のバージョン追随が Vercel より遅れる

OpenNext 4.1.0 の peer range は `>=16.2.11`。Next.js のマイナーアップデートが出ても、**OpenNext が追随するまで上げられない**期間が発生する。Vercel は本家なので常に即日対応。

現在 16.2.11 ちょうどで動いている＝追随が最新である証拠ではあるが、今後は「Next を上げる前に OpenNext の対応を確認する」手順が恒久的に加わる。

⚠️ **付随して発見（2026-07-27）**: `package.json` と `package-lock.json` は 16.2.11 だが、**ローカルの `node_modules` は 16.2.6 のまま**だった（バージョン上げ後に `npm ci` していない）。CI と Vercel は lockfile から入れるので本番は 16.2.11 で正しい＝ローカル検証だけが実態とズレる。OpenNext の peer 下限は 16.2.11 なので、**ローカルで OpenNext を試す前に必ず `npm ci` すること**（16.2.6 のままだと peer 不一致で誤った結論を出す）。

なお [Next.js 公式の Adapter API](https://nextjs.org/blog/nextjs-across-platforms) が 16.2 で安定化し、公式仕様に基づく AWS アダプタが**2026年内にリリース予定**。これが verified adapter になればこの懸念は解消される見込み。

### 🟢 地雷3（現状は影響なし）

`revalidateTag()` が `'use cache'` + `cacheTag` のエントリを無効化しない [既知バグ](https://github.com/opennextjs/opennextjs-aws/issues)（open, 2026-06-04）。本プロジェクトは `'use cache'` 未使用のため現時点で影響なし。将来 Cache Components を導入する場合は要確認。

---

## 学習教材としての評価

移行で実際に手を動かすことになる AWS サービス:

**配信・実行**: CloudFront / S3 / Lambda / API Gateway (Function URL)
**非同期・スケジュール**: SQS / EventBridge Scheduler
**セキュリティ**: IAM（ロール設計）/ WAF / ACM / Secrets Manager / SSM Parameter Store / CloudTrail
**監視**: CloudWatch Logs / Metrics / Alarms / SNS
**DNS**: Route 53
**IaC**: SST v3（Pulumi ベース）

**これは AWS の中核サービスをほぼ一巡する構成**であり、学習教材としての質は非常に高い。特に IAM ロール設計と IaC は、チュートリアルではなく実物で学べる価値が大きい。

---

## 推奨する進め方（段階移行）

本番リスクを負わずに学習効果を最大化する順序。

**Phase 0: オンライン決済を一時停止する（実装済み 2026-07-26）**
移行完了まで数週間かかる見込み。その間 Stripe ライブ決済を Hobby で運用し続けるのは規約上のリスク（アカウント停止＝サイト全停止）。**取引実績がまだ 1 件も無いため、決済機能そのものを止める**方針を採用（Pro 昇格による回避は不要）。

- `src/lib/payments.ts` の `isPaymentsEnabled()` が単一の判定点。**フェイルクローズ**設計で、`PAYMENTS_ENABLED === 'true'` のときだけ決済を受け付ける。
- ガード位置は `/api/checkout` と `/api/checkout/blend` の POST 冒頭。Stripe セッション作成・在庫確保・発注レコード生成のいずれも走らずに 503 を返す。
- 停止中のレスポンスは `{ error: PAYMENTS_DISABLED_MESSAGE }`。`CatalogClient` / `ShopApp` は既に `data.error` を画面表示するため、UI 側の追加改修なしで利用者に文言が出る。
- **再開手順**: 本番環境に `PAYMENTS_ENABLED=true` を設定して再デプロイする。設定漏れ・消失時は停止側に倒れる。

#### Phase 0 実施チェックリスト

⚠️ **コードを書いた時点では Phase 0 は完了していない。デプロイして初めて成立する。**
2026-07-26 時点の本番は `POST /api/checkout` が 400（バリデーションエラー）を返す＝**ガード未反映でライブ決済を受け付ける状態**だった。

| # | 作業 | 担当 | 状態 |
|---|---|---|---|
| 1 | `feat/payments-kill-switch` でコミット | Claude | ✅ |
| 2 | PR 作成・CI 通過確認 | Claude | ✅ |
| 3 | **PR のマージ**（#75 squash → main `ef96ef9`） | オーナー | ✅ |
| 4 | Vercel 自動デプロイ | 自動 | ✅ |
| 5 | 本番の `/api/checkout` が **503** を返すことを確認 | Claude | ✅ |
| 6 | Vercel に `PAYMENTS_ENABLED` が**存在しない**ことを確認 | オーナー | ✅ |
| 7 | Stripe ダッシュボードでライブキーを無効化／ロール | オーナー | ✅ |
| 8 | 販売停止バナーを出すか判断（出す場合の実装は Claude） | オーナー | ✅ |
| 9 | 停止表示の実装・マージ（#77 squash → main `8c2e53e`） | Claude / オーナー | ✅ |
| 10 | 停止表示が**本番に出ている**ことを実測確認 | Claude | ✅ |

**Phase 0 完了（2026-07-26）。** 10 項目すべて消化し、本番実測まで確認済み。

#### 停止表示の方針（2026-07-26 決定）

**出す。ただしサイト全体バナーではなく、ショップ導線内に限定する。**

決め手は「API を 503 にしただけでは、画面には価格付きの商品と購入ボタンが並んだままで、外から見ると営業中に見える」こと。Hobby プランの商用利用制限を避けるという Phase 0 の目的は、外形が営業中のままでは達成しきれない。加えて、売れない状態で購入ボタンを置き続けるのは表示と実態の乖離そのもの。

| 項目 | 決めたこと |
|---|---|
| 範囲 | `/shop`（全画面）・`/shop/catalog`・`/shop/product/[key]`。**トップページには出さない**（止まっているのはオンライン販売だけで、ブランドサイトの顔まで塗る必要がない） |
| トーン | 警告色ではなく告知。豆えらび・ブレンドづくりは引き続き試せることを明記する |
| 購入ボタン | `disabled` + 「販売停止中」表記。押して 503 に落とす挙動をやめる |
| 制御 | 新しいフラグを作らず `isPaymentsEnabled()` に一本化。サーバーコンポーネントで評価し props で各クライアントへ渡す |
| 構造化データ | 商品詳細の `availability` を停止中は `OutOfStock` に切り替える（検索結果に在庫ありと出ないように） |

**フラグを一本化した理由**: `NEXT_PUBLIC_PAYMENTS_ENABLED` を別途足すと、再開時に片方だけ更新して「買えるのにバナーが出たまま」になる。単一フラグなら再開手順は下記のまま変わらず、表示も自動で戻る。

⚠️ `/shop` と `/shop/product/[key]` は静的生成されるため、フラグはビルド時に焼き込まれる。再開手順に「再デプロイ」が入っているのはこのためで、env を変えるだけでは表示は戻らない（API 側の判定は実行時なので、そちらは即座に効く）。

実装: `src/components/shop/SalesSuspendedNotice.tsx`（告知の共通コンポーネント）、`src/lib/payments.ts`（文言の定数）。

#### 本番実測（2026-07-26, main `8c2e53e` デプロイ後）

| 対象 | 結果 |
|---|---|
| `https://www.sikocoffee.com/shop` | 停止告知あり |
| `/shop/catalog` | 停止告知あり |
| `/shop/product/brazil` | 停止告知あり・構造化データ `availability: OutOfStock`・CTA「ショップを見る」 |
| `POST /api/checkout` | **503**（キルスイッチは従来どおり生きている） |
| トップページ `/` | 告知**なし**（方針どおり） |

停止表示はキルスイッチの代わりではなく**その外側の層**である点に注意。API の 503 は実行時判定で常に効くが、表示はビルド時に焼き込まれる。両方を確認して初めて「止まっていて、かつ止まって見える」状態が成立する。

⚠️ プレビュー環境はデプロイ保護で 302 を返すため、匿名では確認できない。停止表示の検証はローカル（`PAYMENTS_ENABLED` の有無を切り替えて両状態）と本番の2箇所で行う。

#### Phase 0 完了時の多層防御（2026-07-26）

| 層 | 状態 |
|---|---|
| アプリ | `PAYMENTS_ENABLED` 未設定 → checkout は **503 + 停止文言**（本番実測・画面表示も確認済）。同じフラグでショップ導線に停止表示を出し、購入ボタンを `disabled` にする |
| Vercel env | `STRIPE_SECRET_KEY` は**失効済みの旧キー** `sk_live_...J04e` を保持 |
| Stripe | Secret key を Rotate（旧キーは **"Now" で即時失効**）。新キー `sk_live_...Nk7B` は**パスワードマネージャにのみ保管**し Vercel には未投入。未使用の Restricted key（Jun 7 作成・一度も未使用）も Expire 済み |

**取引実績ゼロの裏取り**: Stripe 側 Gross volume ¥0 / JPY balance ¥0、DynamoDB `siko-coffee-orders` 0 件、Payment links・Invoices・Subscriptions すべて未設定。サブスク実装なし（両 checkout とも `mode: 'payment'`）。

**副作用なし**: 旧キー失効後も `/`・`/shop`・`/shop/catalog`・`/api/health`・`/api/menu`・`/api/instagram` はすべて 200。Stripe Webhook 受信は 400（署名なしで正常）＝**受信側は意図的に生かしている**。ガードが Stripe より手前にあるため、そもそも Stripe を呼びに行かない。

#### 🔑 販売再開の手順（順番が重要）

1. パスワードマネージャから `sk_live_...Nk7B` を取り出し、Vercel 本番の `STRIPE_SECRET_KEY` を**更新**
2. `PAYMENTS_ENABLED=true` を追加
3. 再デプロイ（**静的生成される `/shop`・`/shop/product/[key]` の停止表示はこれをしないと消えない**）
4. `POST /api/checkout` が 503 を返さなくなることを確認
5. `/shop` に停止表示が出ておらず、カートの購入ボタンが押せることを確認

**1 を飛ばすと Stripe 認証エラーになる。**

**判断済み**: 決済を止めるため **Vercel Pro への昇格は不要**。Hobby のまま進める。

**Phase 1: AWS 側にプレビュー環境だけを構築（本番は Vercel のまま）**
SST で stage を立て、既存のプレビュー用テーブル `siko-coffee-preview-*` に接続する。ここで OpenNext の挙動・ISR・画像最適化・middleware をすべて検証する。**本番への影響ゼロで学習できる期間**。

#### Phase 1 の準備状況（2026-07-27・**デプロイ手前まで完了**）

AWS リソースはまだ1つも作っていない。ローカルで確かめられることだけを済ませた段階。

| 確認事項 | 結果 |
|---|---|
| **SST の版** | 「SST v3」は古い呼称で、現行は **4.17.1**（v4 系）。本リポジトリに devDependency として導入済み |
| **OpenNext 4.1.0 が Next 16.2.11 でビルドできるか** | ✅ **成功**。`npx @opennextjs/aws build` が server / image-optimization / revalidation / warmer の各 Lambda と assets・cache を生成 |
| 生成物のサイズ | server 37MB / image-optimization 31MB＝**Lambda の 250MB 上限内** |
| **SST の既定 OpenNext 版** | ⚠️ **3.9.14**（Next 15 想定）。Next 16 はビルドできないため `openNextVersion: "4.1.0"` の**ピン留めが必須** |
| **SST 4.17.1 が OpenNext 4.1.0 の出力を読めるか** | ✅ 実物で照合。SST が参照する `origins.default` / `origins.imageOptimizer` / `origins.s3` / `edgeFunctions` / `additionalProps.revalidationFunction` は**すべて存在**する |
| `open-next.output.json` に `buildId` が無い件 | 問題なし。SST は `loadBuildId()` で **`.next/BUILD_ID` から読む**（生成済みを確認） |
| `additionalProps.initializationFunction` の値 | 問題なし。SST は `.open-next/dynamodb-provider` へ**上書きする**実装で、OpenNext 4.1.0 が出す値と**一致** |

作成したファイル: [open-next.config.ts](../open-next.config.ts)（生成物の内訳をコメントで明示・値は型で検証済み）／[sst.config.ts](../sst.config.ts)（未デプロイ）。

`sst.config.ts` に入れた要点:
- **`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` を置かない** — `permissions` で Lambda 実行ロールに DynamoDB / SES / Rekognition を許可する。これが項目12「今回の移行で最大の改善」の実体。
- ⚠️ **`AWS_REGION` は Lambda の予約環境変数**で IaC から設定できない（関数のリージョンが自動で入る）。ap-northeast-1 に置く限りアプリ側の `process.env.AWS_REGION` はそのまま動く。
- 非本番ステージの DynamoDB 権限は **`siko-coffee-preview-*` だけに限定**（本番テーブルに触らせない）。
- `PAYMENTS_ENABLED` は**意図的に未設定**＝決済は停止のまま（Phase 0 を維持）。

**デプロイ前に必須の残作業**（`sst.config.ts` 末尾にも列挙）: ①シークレット投入（`sst secret set`）②Vercel Blob → S3 の置き換え ③cron → EventBridge ④WAF 3ルール ⑤apex 正規化の CloudFront Function 移設。

#### 🚀 初回デプロイ実施（2026-07-27・stage `dev`）

**`npx sst deploy --stage dev` が成功。** URL: `https://d3ejmruzea0u7a.cloudfront.net`

作成されたもの: CloudFront Distribution / CloudFront Function(request) / KeyValueStore / Lambda 3本（server・image-optimizer・revalidation subscriber）＋各 LogGroup・IAM Role / S3(assets) / SQS / DynamoDB(ISR) / Lambda Function URL。所要は約5分（KeyValueStore 82秒・CDN 伝播待ち 145秒が大半）。

**認証情報の罠**: `aws sts get-caller-identity` は通るのに `sst deploy` が「AWS credentials are not configured」で落ちた。原因は `~/.aws/config` の **`login_session`（`aws login` 独自のセッション認証）は aws CLI しか解釈できず、SST(Pulumi の Go SDK) からは解決できない**こと。回避策＝`eval "$(aws configure export-credentials --profile default --format env)"` で環境変数に展開してから `sst deploy` を実行する。

##### ✅ 検証できたこと

| 項目 | 結果 |
|---|---|
| `/` `/shop` `/shop/catalog` `/api/health` `/api/menu` `/api/beans` `/api/blends` | **すべて 200** |
| **静的 AWS キー無しで DynamoDB に到達できるか** | ✅ **実証済み**。preview テーブルにテスト用の焙煎者＋豆を投入したところ `/api/beans` が正しく返した（GSI `list-index` の Query ＋ `roasters` の BatchGet が実行ロールだけで成功）。同時に本番 Vercel は `[]` を返し、**preview と本番のテーブル分離も確認**（検証後にテストデータは削除済み） |
| `isDbConfigured()` が Lambda で真になるか | ✅ なる。**Lambda は実行ロールの資格情報を `AWS_ACCESS_KEY_ID` 等の同名環境変数として自動注入する**ため。この挙動に依存している点は要記憶 |
| canonical | ✅ `https://www.sikocoffee.com` を指しており、重複インデックスは実質的に抑止されている |

##### ✅ 解決済み: `next/image` が最適化していなかった（2026-07-28）

**症状（2026-07-27）— AWS 側は変換せず原本をそのまま返していた。**

| | `/_next/image?url=/images/logo/logo_siko8.png&w=256&q=75` |
|---|---|
| Vercel | **4,182 B** / `image/webp` |
| AWS（修正前） | **222,510 B** / `image/png`（＝原本と同一バイト数） |
| AWS（修正後） | **4,182 B** / `image/webp`（＝**Vercel とバイト単位で一致**） |

- `w` を 64 / 256 / 1080 と変えても**応答サイズが変わらない**＝リサイズが効いていない。`Accept: image/webp` を送っても WebP にならない。
- 一方 `w=16` は 400（`width is not allowed`）を返すので、**最適化 Lambda 自体は起動しパラメータ検証も動いている**。CloudWatch にも例外は無く、実行時間は 40〜57ms と変換にしては短すぎる＝**変換をスキップして原本を返している**。
- **影響**: 当該ロゴで約 **53倍**の転送量。本プロジェクトは Lighthouse Performance が 49 と元々弱く、**本番切替前に必ず解消が必要**だった。

###### 根本原因（3段の無言failure が重なっていた）

デプロイ済み Lambda のコードを実際に取り出して確定させた
（`aws lambda get-function` → `Code.Location` の zip を展開）。

1. **同梱された sharp が macOS バイナリだった。**
   zip の中身は `node_modules/sharp/build/Release/sharp-darwin-arm64v8.node` ただ1つ
   ＝ **Linux arm64 の Lambda に macOS 用バイナリ**が入っていた。
   OpenNext 4.1.0 の既定 sharp は **0.32.6** で、0.32 系はネイティブバイナリを
   インストール時に prebuild-install が取得する方式。その判定材料は `npm_config_platform`
   だが、OpenNext が渡すのは `--os=linux`（npm の optional 依存フィルタ用の別物）。
   結果ビルドマシン（macOS）向けが選ばれる。`--platform=linux` を足しても解消しないことを実測。
2. **sharp 0.35 系に上げるだけでは足りない。**
   0.33 以降は `@img/sharp-<os>-<cpu>` の optional 依存で解決されるが、これらは
   `libc: glibc` を宣言している。**npm 10 は `--libc` を解釈しない**ため macOS からは選べず、
   黙って `@img/sharp-wasm32` にフォールバックする。`--libc` が効くのは **npm 11 以降**。
   実測: npm 10.9.2 → `sharp-wasm32` / npm 11.18.0 → `sharp-linux-arm64` + `sharp-libvips-linux-arm64`。
3. **Next.js が失敗を握りつぶしていたので、どこにもログが出なかった。**
   `next/dist/server/image-optimizer.js` の変換部は `catch` で
   「If we fail to optimize, fallback to the original image」として**原本をそのまま返す**（ログ出力なし）。
   そのため sharp が require できなくても CloudWatch には何も残らず、パラメータ検証だけは
   正常に動くため「Lambda は動いている」ように見えていた。
   なお失敗経路は `maxAge` に `minimumCacheTTL` を使う。修正前の応答が
   `cache-control: max-age=14400`（Next 16 の既定値そのもの）で、修正後は `max-age=86400` に
   変わったことが、フォールバックしていた確かな指紋になっている。

※ 当初 SST [#6867](https://github.com/sst/sst/issues/6867) と症状が一致すると見ていたが、
   実際の原因は上記のとおり **sharp のクロスプラットフォーム install 条件**であり、Next のバージョンとは無関係。

###### 対処

- `open-next.config.ts` の `imageOptimization.install` で sharp のインストール条件を明示上書き
  （`sharp@^0.35.3` / `os: linux` / `arch: arm64` / `libc: glibc` / `nodeVersion: 24`）。
- 🔴 **ビルドに使う npm は 11 以降が必須**。10 系だと wasm32 に落ちたまま**デプロイは成功してしまう**
  （OpenNext の `installDependencies` は npm install の失敗をログに出すだけでビルドを止めない）。
- そのため `npm run verify:image-optimizer`（`scripts/check-image-optimizer.mjs`）を追加した。
  ビルド成果物に `@img/sharp-linux-arm64` があるか、wasm32 フォールバックや非 Linux バイナリが
  混ざっていないかを機械的に検査する。**`sst deploy` の直後に必ず実行する**。

###### 検証結果（stage dev・2026-07-28）

| w | 修正前 | 修正後 |
|---|---|---|
| 64 | 222,510 B / png | 632 B / webp |
| 256 | 222,510 B / png | 4,182 B / webp（Vercel と一致） |
| 640 | 222,510 B / png | 17,076 B / webp（Vercel と一致） |
| 1080 | 222,510 B / png | 41,624 B / webp |

`Accept` に webp を含めない場合は png のまま 2,153 B にリサイズされる（＝正しい挙動）。
ブラウザから取得して `createImageBitmap` で復号し、96×96 に実際にリサイズされていることも確認済み。

もう1つの既知 issue [#6894](https://github.com/sst/sst/issues/6894)（CloudFront KeyValueStore が初回デプロイ後に空になり CFF が 503）は、**今回は再現しなかった**（全ルート 200）。

##### Phase 2 へ持ち越す課題（今回の実デプロイで判明）

- **`X-Robots-Tag: noindex` を非本番ステージに付ける**。`robots.txt` は `Allow: /` なので CloudFront URL がインデックスされうる。canonical が www を指すため実害は小さいが、`transform.cdn` で Response Headers Policy を当てるのが筋。
- ✅ **`VERCEL_ENV` → `STAGE` の書き換え** → **完了（2026-07-29・実行順の 1）**。判定は `src/lib/stage.ts` に集約し、`sst.config.ts` は `STAGE: $app.stage` を注入（`VERCEL_ENV: 'preview'` の暫定措置は撤去）。`src/lib/db.ts` はフェイルクローズに反転済み。
- シークレット未投入のため、認証・admin・Sentry・Instagram・メールは**未検証**。

**Phase 2〜4 の具体化 → 下記「Pour Over 実行順」を正本とする。**

---

## Pour Over 実行順（2026-07-28 再監査・**全21項目**）

この移行の呼称は **「Pour Over（ポアオーバー）」**。以下がタスクの正本で、
`sst.config.ts` 末尾に実装者向けの索引がある。Phase 1（dev 環境構築）と
`next/image` の最適化は完了済み。

**2026-07-28 の再監査で 16 項目から組み替えた。** 背骨と依存関係は変わっていない。
変更は ①リスクゼロで他に依存しない前準備を「第0群」として切り出し前倒ししたこと、
②抜けていたデプロイ自動化（9.5）を足したこと、③既存項目の設計・記述を訂正したこと。
根拠はコード全走査・AWS の実測・SST 4.17.1 のソース読解。

⚠️ **項目数の表記について（2026-07-31 訂正）。** 再監査の直後は「全20項目」と書いていたが、
実数は **21** である（第0群 4 ＋ 本編 17＝ 1〜16 の 16 個に 9.5 を足したもの）。
20 は第0群を足した時点の数で、**9.5 を追加した分が数えられていなかった**。
🔴 **番号そのものは正しく、動かしていない。** 直したのは合計だけなので、
「20タスク」と書かれた古い文書が別の割り当てを指しているわけではない。

**進捗（2026-08-01 時点）: 17 / 21。** 第0群 4/4・第1群 4/4・**第2群 5/5**・
**9.5 完了・10 完了・11 完了・12 実装完了**。次は **13（production デプロイ → 検証 → DNS 切替）**。
✅ **依存 F は解消**（2026-08-01 17:50 UTC に TTL を 60s へ引き下げ・権威 NS 4本で実測）。
＝ **13 は 2026-08-02 17:50 UTC 以降ならいつでも実行できる**。日程を先に決める必要はもう無い。
🔴 **12 は「実装済み・未実測」**。`domain` は production にしか付かないので、apex の 308 も HSTS も
**まだ一度も動いていない**（dev で当てる経路が原理的に無い唯一のタスク）。実測は 13 で行う。
🔴 **12 で `dns: false` を採った＝ DNS 切替は SST ではなく人が Route53 で行う。**
計画の「`dns` は有効のままでよい」は**誤りだった**（SST のソースで確認・下記）。
✅ 「SNS トピックが0個」は解消。✅「CronRelay の Errors」も含め、**両リージョンの経路を dev で実測**済み
（詳細は `docs/pour-over-log.md` の 2026-08-01 の節）。

### 第0群｜地ならし（本番影響ゼロ・依存なし・並行可）

他のどのタスクにも依存せず、しかし後段で必ず詰まる要因を先に潰す群。
12 の直前まで持ち越すと「そこで止まる」ため前倒しした。

| # | 作業 | 状態 |
|---|---|---|
| 0-a | **デプロイ経路の一本化** — `scripts/deploy.sh` に①npm 11 検査 ②資格情報の展開 ③`sst deploy` ④画像最適化の検証 を閉じ込め、`npm run sst:deploy -- --stage <stage>` を唯一の入口にする | ✅ 完了 |
| 0-b | **CAA に `0 issue "amazon.com"` を追加** → 直後に ACM で試験発行し、12 の不確実性をここで消す | ✅ 完了（**この試験発行で 12 を止める地雷を発見・解決した**。下記） |
| 0-c | **Amplify の domain association → app → `AmplifyServiceRole` → 孤児 CNAME を削除** | ✅ 完了 |
| 0-d | **予算アラートの閾値見直し**（$0.01 通知 → 適正値 / 上限 $10 → $20） | ✅ 完了（上限 **$20** / 通知 **ACTUAL > $12**・2026-07-29 に AWS 実測で確認） |

> ✅ **第0群は 4/4 完了。** 解消した依存は **H**（CAA → 12）と **I**（Amplify 削除 → 12）、
> 追加した依存は **J**（0-a → 以降のすべてのデプロイ）・**K**（9.5 → 14）・**L**（Instagram トークン）。

> ## 🔴🔴 0-b の試験発行で判明: **`www` の証明書は Vercel の CAA に阻まれて発行できない**
>
> **CAA に `amazon.com` を足しただけでは足りなかった。** 実際に ACM へ
> `www.sikocoffee.com` + `sikocoffee.com` を要求したところ、
> **apex は SUCCESS、www は FAILED（`FailureReason: CAA_ERROR`）** になった。
> DNS 検証レコードは両方とも正しく引けており、原因は検証ではなく**発行時の CAA 判定**。
>
> **原因**: `www.sikocoffee.com` は **Vercel への CNAME**（`724b9301c41a7c8f.vercel-dns-017.com`）。
> RFC 8659 は「検証対象がエイリアス（CNAME）なら、CA は CNAME を辿った先で CAA を評価する」と
> 定めている。そして **その Vercel 側のホストが自前の CAA を publish している**:
>
> ```
> dig CAA 724b9301c41a7c8f.vercel-dns-017.com
>   0 issue "sectigo.com"  0 issue "globalsign.com"  0 issue "letsencrypt.org"  0 issue "pki.goog"
>   ← amazon.com が無い
> ```
>
> ＝ **www の CAA は我々のゾーンではなく Vercel のゾーンが決めている。** 自分の CAA をどう直しても
> www 単独の証明書は取れない。apex が通ったのは A レコード（エイリアスではない）で、
> 自ゾーンの CAA まで素直に遡れるため。
>
> 🔴 **これは 12 を確実に止める。** しかも 12 の時点では www はまだ Vercel を向いている必要がある
> （CloudFront に証明書が無いと HTTPS を張れないので、先に DNS を切ることはできない＝鶏と卵）。
> TTL 引き下げ・WAF・アラームを済ませた後で詰まるところだった。
>
> ### ✅ 解決策: **ワイルドカード証明書**（実証済み）
>
> `sikocoffee.com` + `*.sikocoffee.com` で要求すると、**`*.sikocoffee.com` はそれ自体が
> エイリアスではない**ため CAA の評価は `sikocoffee.com` から始まり、我々の CAA（amazon.com を含む）
> に当たる。`issuewild` を置いていないので `issue` がワイルドカードにも適用される。
>
> **結果: `ISSUED` / Issuer: Amazon / 有効期限 2027-02-11。**
> しかも検証レコードは apex・ワイルドカードとも **`_c84c530444dc328407ddf8a6cf46916b.sikocoffee.com`
> の1本を共用**するため、**追加の DNS レコードは一切不要**だった。
>
> ```
> arn:aws:acm:us-east-1:654512230021:certificate/01195002-424e-44b1-9425-aff38c879765
> ```
>
> ### 12 への反映（必須）
>
> - **SST に証明書を自動作成させてはいけない。** 既定では `domain.name` に対して証明書を作るため、
>   `www.sikocoffee.com` で同じ CAA_ERROR を踏む。**上記 ARN を `domain.cert` に渡す**こと。
>   SST の `cdn.ts` は `cert` が与えられていれば自作をスキップする。
>   ~~`dns` は有効のままでよい。`dns: false` にする必要があるのは非対応 DNS プロバイダの場合だけ~~
>   → 🔴 **この一文は誤りだった（2026-08-01・12 の実装時に SST のソースで確認）。**
>   `cdn.ts` の `createDnsRecords()` は `domain.name` と `aliases` の**すべて**について
>   `dns.createAlias()` を呼び、CloudFront への A/AAAA ALIAS を作る。つまり **`dns` を
>   有効のままにすると production の deploy 自体が DNS 切替になり、13 の
>   「デプロイ → 検証 → 切替」が成立しない**（検証の前に切り替わる）。さらに
>   `_createRecord()` の `allowOverwrite` は既定 false で、www には既存の CNAME・apex には
>   既存の A があるため、**実際にはデプロイが RRSet の衝突で落ちる公算が高い**。
>   → **`dns: false` を採用した。** レコードは SST の管理外に置き、切替も切り戻しも
>   Route53 の UPSERT で人が行う（**11 で TTL を 60s にした投資はこの構成でだけ回収される**）。
> - 📌 **`domain` を付けると SST が `*.cloudfront.net` 宛を自動で 403 にする**
>   （`CF_BLOCK_CLOUDFRONT_URL_INJECTION`）＝ **13 の事前検証を CloudFront の URL では行えない**。
>   `curl --resolve www.sikocoffee.com:443:<配信IP> https://www.sikocoffee.com/...` の形で
>   SNI と Host を本番ドメインにしたまま当てること。
> - 📌 **切替後は www が Route53 の ALIAS（A レコード）になり CNAME ではなくなる**ため、
>   以後の更新は自ゾーンの CAA で評価される。それでもワイルドカードのまま運用するのが安全。
> - ⚠️ **`_c84c530444dc328407ddf8a6cf46916b.sikocoffee.com` を削除しないこと。**
>   0-c で「孤児」として一度削除したが、**現在はワイルドカード証明書の検証レコードとして生きている**
>   （ACM の検証トークンはドメイン＋アカウントに対して決定的で、同じ名前が再利用される）。
>   これを消すと更新が止まる。
> - 🧹 後始末: ✅ **完了**。失敗した www 単独の証明書（`aea326a1-…`）とその検証レコード
>   `_a4eb7ebc6bd0dd0df20316ef46257422.www.sikocoffee.com` は削除済み。
>   2026-07-29 の再確認で **us-east-1 の証明書はワイルドカード1枚のみ**（`ISSUED` / Issuer: Amazon /
>   2027-02-11 まで / **`InUseBy` は空**＝まだ CloudFront に未接続＝12 待ち）、Route53 に残る
>   `_` 始まりのレコードは **検証用 `_c84c…` 1本＋SES DKIM 3本だけ**であることを確認した。
>
> 🔑 **教訓**: CAA は「自分のゾーンだけ見ればよい」ものではない。**CNAME を張った先の CAA に従う。**
> 移行元が DNS ホスティングも兼ねている場合、この形の依存が残る。

> 🔑 **0-a は「npm を上げる」ではなく「手順を消す」タスクである。** 素の `npx sst deploy` には
> 忘れると壊れる前後処理が3つ（npm 11・`login_session` の展開・画像最適化の事後検証）あり、
> どれも**忘れても成功したように見える**のが厄介だった。`scripts/deploy.sh` に閉じ込めて
> **`npm run sst:deploy` を唯一の入口**にすることで、手順書を読まなくても正しくなる。

> 🔴 **0-a を最初に置く理由**: `#96` で直した sharp のクロスビルドは、**npm 10 でビルドした瞬間に
> 無言で退行し、しかもデプロイは成功する**。`package.json` に `engines` が無く、実際に
> 作業マシンの npm は 10.9.2 だった（2026-07-28 実測）＝ 再発の条件が揃っていた。
> `verify:image-optimizer` は事後検査であり、実行を忘れれば素通りする。だから
> **デプロイの手前で機械的に止める**。CI は `next build` のみで OpenNext ビルドを含まないため、
> このゲートは意図的に CI へは入れない（入れると `npm ci` が落ちるだけで得がない）。

> ✅ **0-c の実施記録（2026-07-28）**: association → app → role → 孤児 CNAME 2本の順で削除。
> 公開コピー `main.d3059a6gcvih7x.amplifyapp.com` は停止、本番（www 200 / apex 308 / SES DKIM
> SUCCESS）は無傷。⚠️ **domain association を消しても Amplify は検証 CNAME を自動削除しなかった**
> ため手動で消した。順序自体は正しく、逆順だと消せない状態になっていた。
> これにより **依存 I は解消**。同時に「main への push のたびに `AdministratorAccess-Amplify` を
> 持つロールが動く」という統制上の穴も閉じた（通算124ジョブ・直近はすべてドキュメント PR）。
> 📌 ロググループ `/aws/amplify/d3059a6gcvih7x`（375KB・保持期間**無期限**）だけは削除記録として残置。

### 第1群｜下ごしらえ（本番無影響・並行可）

| # | 作業 | 期待できる結果 |
|---|---|---|
| 1 | ✅ **`VERCEL_ENV` → `STAGE`**（判定を `src/lib/stage.ts` に集約＋`sst.config.ts` に `STAGE: $app.stage` を注入） | **完了（2026-07-29）**。AWS 本番でサーバ側 Sentry の Performance が実際に動くようになった（従来は `tracesSampleRate: VERCEL_ENV==='production' ? 0.1 : 0` のため **AWS 本番では 0＝完全に無効**だった）。「Speed Insights は Sentry Performance で代替」という前提がここで初めて成立する。`src/lib/db.ts` の判定も**反転**し、未設定時に preview へ倒れるフェイルクローズにした |
| 2 | ✅ **cron 4ルートの観測性** | **完了（2026-07-29）**。観測を `src/lib/cronLog.ts` に集約し（`cronStart` / `cronDone` / `cronFail` / `cronWarn` / `cronAlert`）、4ルートを同じ形に揃えた。**console と Sentry の両方**へ出すので DSN 未設定でも消えない。`cronDone` が件数を出すため **「動いたが0件」と「動いていない」を CloudWatch だけで区別できる**（`release-reservations` の件に効く）。握り潰していた2か所も開けた: `cleanup-pending` の `DeleteCommand` は `ConditionalCheckFailedException` のみ `skipped` として数え他は報告、`instagram-refresh` の `GetCommand` は退避しつつ警告。依存 E・L 向けに失敗地点を `phase`（`token-read`/`refresh`/`persist`）で Sentry へ送り、残り14日を切ったら警告する。回帰テスト `src/__tests__/cron-observability.test.ts` |
| 3 | ✅ **Vercel 専用スクリプトの条件化**（`@vercel/analytics` / `@vercel/speed-insights`） | **完了（2026-07-29）**。`src/lib/stage.ts` に `isVercelPlatform()` を足し、`src/app/layout.tsx` は Vercel 上でのみ両コンポーネントを描画する。AWS では `/_vercel/insights/script.js` と `/_vercel/speed-insights/script.js` の 404 が消え、**Vercel 側の挙動は変わらない**（soak 中も Speed Insights の比較材料を保てる）。回帰テストは `src/__tests__/stage.test.ts` に追加 |
| 4 | ✅ **Vercel Blob → S3**（**presigned S3 PUT で実装**） | **完了（2026-07-29）**。S3/Rekognition 側は `src/lib/avatarStorage.ts`、DynamoDB 側は `src/lib/avatarAccount.ts`。アップロードは **upload-url → S3 へ直接 PUT → confirm** の3段。バケットは**2つ**（非公開のアップロード用＋CloudFront からのみ読める公開用）で、**検閲を通ったものだけ**が公開用へコピーされる。`next.config.ts` の `remotePatterns` と CSP `img-src` は両方更新済み。回帰テスト `src/__tests__/avatarStorage.test.ts` |

> 🔴 **1 の実装で判明した罠: 単純な置換だと soak 期間に本番障害を起こす。**
> 14（soak）の間は **AWS と Vercel の両方が本番を担う**。`VERCEL_ENV` を `STAGE` に
> 置き換えるだけだと、**`STAGE` を持たない Vercel 本番が preview テーブルを向く**
> （＝本番サイトが空のデータを読む）。そのため `src/lib/stage.ts` は
> **`STAGE ?? VERCEL_ENV`** のフォールバックを持たせてある。
> → **16（Vercel 依存の撤去）でこの一行を消す**こと。4点セットに続く5点目として扱う。
>
> 📌 **1 の調査で分かった記述の誤り**（従来「`sentry.server.config.ts` と
> `sentry.edge.config.ts` が `VERCEL_ENV` を見ている」としていた）:
> 実際に `VERCEL_ENV` を見ていたのは **`sentry.server.config.ts` と `sentry.client.config.ts`** で、
> **`sentry.edge.config.ts` は `environment` 自体を持っていなかった**（Sentry ウィザードの
> 生成物のままで DSN もハードコード、`tracesSampleRate` は全ステージ **100%**）。
> environment のみ補い、**サンプリング率の是正は Sentry のクォータ方針の判断を伴うため分離**した。
> また **`sentry.client.config.ts` は Next 16 では死にコード**（実体は
> `src/instrumentation-client.ts`。参照ゼロを確認）だったため削除した。
> ⚠️ 残る既知のギャップ: **`src/instrumentation-client.ts` には `environment` が無い**ので
> **クライアント側のイベントは今もステージ未タグ**。クライアントは `STAGE` を読めない
> （ビルド時に焼き込む `NEXT_PUBLIC_*` が要る）ため、別タスクとして扱う。
>
> **なぜ 4 は presigned なのか**: 5 で入れる `oac-with-edge-signing` は Lambda@Edge 経由のため
> **ボディが 1MB 上限**。現行の `MAX_FILE_SIZE` は 2MB で衝突する。サーバ経由アップロードをやめれば
> 大きなボディが CloudFront/Lambda を通らなくなり、衝突自体が消える。
> 📌 1MB を超えるボディを持つルートは**アバターだけ**（Server Actions は未使用、他の POST は
> フォーム/JSON のみ）＝ 4 を presigned にすれば 5 との衝突は完全に消える、と確認済み。
>
> 🔴 **ただし素直に presigned にすると「無検閲の公開アップロード口」ができる。**
> 現行 `api/account/avatar/route.ts` は **`Rekognition(Bytes)` に通ってから `put()`** の順で、
> 検閲に落ちた画像は保存されない。presigned にすると **PUT が先・検閲が後**に逆転するため、
> **confirm を呼ばなければ未検閲のオブジェクトが URL つきで残る**。
> → **presign 先は公開されない `pending/` プレフィクス（または別バケット）にし、
> confirm で `Image:{S3Object}` として検閲 → 合格時のみ公開先へ copy → pending を削除**する。
> S3 ライフサイクルで pending を1日で自動削除。実行ロールには pending の `s3:GetObject` と
> 公開先の `s3:PutObject` / `s3:DeleteObject` が要る。
> ⚠️ 保存先は **CloudFront が `_assets` として配信している既存バケットとは別**にすること。
>
> ---
>
> 🔴 **4 の実装で判明した順序の問題（計画に書かれていなかった）。**
> 4 は第1群＝ **13（切替）より前**に入るが、その時点で本番は Vercel 単独で、
> **AWS の production ステージがまだ存在しない**。つまりアップロード先のバケットと
> その公開配信経路を「サイト本体より先に」用意する必要がある。
> → サイトの CloudFront に相乗りする案は使えず、**アバター専用の `sst.aws.Router`** を立てた
> （CloudFront は無料枠の内側なので費用はほぼ増えない。13 の後に統合してもよい）。
>
> 🔴 **マージしただけでは本番のアバター画像アップロードは 503 になる。**
> `AVATAR_UPLOAD_BUCKET` / `AVATAR_BUCKET` / `AVATAR_BASE_URL` の3本がそろわないと
> フェイルクローズで止まる（プリセット選択は影響を受けない）。稼働させるには:
> ① `npm run sst:deploy -- --stage <stage>` でバケットと Router を作る
> ② その3本を **Vercel 側の環境変数にも**入れる（soak 期間は同じバケットを共有する）
> ③ Vercel が使っている IAM ユーザーに、下記2ステートメント相当の S3 権限を足す
>    （AWS 側は実行ロールに付与済みで静的キーは不要）
> 影響範囲は小さい（本番で `avatarUrl` を持つユーザーは **0件**）が、
> **①〜③を済ませるまでは新規アップロードだけができない**。
>
> ⚠️ **Rekognition は呼び出し元の権限で S3 を読む。** `Image: { S3Object }` に変えた以上、
> アップロード用バケットの `s3:GetObject` が無いと検閲が全件失敗し、
> フェイルクローズにより**すべて「アップロードできません」になる**（無言では壊れない）。

### 第2群｜AWS の防御と実行基盤（dev で検証）

| # | 作業 | 期待できる結果 |
|---|---|---|
| 5 | ✅ **Function URL の保護** → `protection: "oac-with-edge-signing"` | **完了（2026-07-29・dev で実測検証）。** `AuthType` は server / image-optimizer とも `NONE` → **`AWS_IAM`**、直叩きは `/`・`/admin` とも **200 → 403**。CloudFront 経由は `/`=200・`/api/health`=200・`/admin`=307 で**変化なし**。host 依存ロジックも無傷（`/api/admin` への POST は正しい Origin で middleware を通過し、詐称・欠落は 403）。これで 6・9・12 が意味を持つようになった |
| 6 | ✅ **WAF 3ルール**を AWS WAF で再構築（**CLOUDFRONT スコープ＝us-east-1 固定**・`transform.cdn` で `webAclArn`） | **完了（2026-07-31・dev で実測検証）。** 値は推測せず `vercel firewall rules ls --json` の live 設定から採った。公開パス（`/`・`/shop`・`/api/health`）は **200 のまま不変**、`/admin`・`/admin/login` は 307/200 → **202（`x-amzn-waf-action: challenge`）**、`/api/admin/auth` は変更前 40連打が全部 405 だったのに対し **T+45s 以降は 403**。レート制限のブロック中も `/admin` は 202 のままで、**スコープが2つのログインパスに限定されている**ことも確認できた |
| 7 | ✅ **`server.memory` 1024 → 2048 MB** | **完了（2026-07-31・dev で実測検証）。** Lambda の CPU はメモリ比例で **1769MB＝1vCPU 相当**なので 0.58vCPU → **約1.16vCPU**。同一手段（CloudWatch Logs の `REPORT`）で前後を測り、コールド／ウォームを分けた結果、**コールド p50 は 2,041ms → 1,068ms（−48%・n=21）**、ウォーム p50 は 73.8ms → 51.3ms（−30%・n=123）。`maxMemoryUsed` は **231MB → 230MB で不変**＝ RAM は元から余っており、効いたのは純粋に CPU。8 の実行予算（30秒）にも効く。⚠️ 費用は「相殺」ではなく GB-秒で**約 +10%**（月 $0.003 相当＝誤差） |
| 8 | ✅ **cron 4本 → `sst.aws.CronV2`（EventBridge Scheduler）＋中継 Lambda** | **完了（2026-07-31・dev で実測検証）。** 経路は **Scheduler → 中継 Lambda（`src/functions/cronRelay.ts`）→ server の Function URL を SigV4 で直叩き → cron ルート**。`release-reservations` は日次から **`rate(10 minutes)`** へ、`instagram-refresh` は月次から **週次**へ（依存 E・L の余裕を 60日で2回→8回にする）。認可は **①Function URL の IAM ②`CRON_SECRET`** の2重。<br>🔴 **`Authorization` ヘッダは SigV4 が占有する**ため `CRON_SECRET` は **`x-cron-secret`** で渡す。判定は `src/lib/cronAuth.ts` に集約し、soak のあいだ Vercel の `Authorization: Bearer` 形式も受け続ける（撤去は 16 の⑧）<br>🔴 **production のスケジュールは DISABLED で作られる**。`sst.config.ts` の `CRON_STAGES` に `'production'` を足すのは **13 で DNS を切り替えたあと**（それまで Vercel の cron が生きており、二重実行すると `instagram-refresh` が競合する） |
| 9 | ✅ **非本番に `X-Robots-Tag: noindex`＋アクセス制限**（`edge` の CloudFront Function 注入） | **完了（2026-07-31・dev で実測検証）。** 宣言どおり **WAF は使わず CloudFront Function**（リクエスト課金のみ＝実測 103K req/月で月 $0.01）。資格情報は `PREVIEW_BASIC_AUTH`（**`SECRET_NAMES` には入れない**＝入れると production の 13 でも投入を強いられる）を deploy 時に base64 化して焼き込む。実測は公開パスが 200 → **401**（`www-authenticate` ＋ `x-robots-tag` ＋ `cache-control: no-store`・`x-cache: FunctionGeneratedResponse`＝エッジで完結）、資格情報ありで 200 ＋ **`x-robots-tag: noindex, nofollow`**、誤った資格情報は 401。AvatarCdn は **noindex のみ**（`<img>` は資格情報を送らないので Basic 認証は付けられない）。<br>🔴 **WAF は CloudFront Function より先に評価される**ので `/admin*` は資格情報の有無に関わらず **202（challenge）**のまま。<br>🔴 **`edge` は Router の直下ではなくルートの中に書く** — 直下にも同名の型があり **型検査もデプロイも通るのに黙って無視される**（教訓27）。<br>📌 12 で `domain` を付けると SST が `*.cloudfront.net` 宛を自動で 403 にする（`CF_BLOCK_CLOUDFRONT_URL_INJECTION`）＝ production 側にこの作業を広げる必要はない |

> 🔴 **5 が最優先である理由**: OpenNext/SST は server Lambda の **Function URL をオリジン**にするが、
> その **AuthType は `NONE`**、リソースポリシーは **`Principal: *`／CloudFront 限定の条件なし**。
> 実測で `https://<32文字>.lambda-url.ap-northeast-1.on.aws/` に直アクセスでき、`/`=200・`/admin`=307。
> **CloudFront に WAF を付けても、この URL を直接叩けば全部素通りする。**
> apex 正規化の CloudFront Function も noindex も同様に迂回される。URL は推測困難だが obscurity は統制ではない。
> `"oac"` モードは POST に `x-amz-content-sha256` を要求し、Stripe webhook・NextAuth・ブラウザのフォーム送信が
> 壊れるため**採用不可**（本プロジェクトは POST ルートが20本以上）。

> ✅ **5 は host 依存ロジックを壊さない（2026-07-28 に検証。当初これを最大の懸念と見ていた）。**
> OAC/SigV4 は Host ヘッダを origin のものへ書き換えるため、CSRF チェック（`src/middleware.ts:17` の
> `new URL(request.url).origin`）・NextAuth・パスキーの `rpID` 導出・checkout のホスト許可が
> 全部壊れるのではないかと疑ったが、**壊れない**。理由:
> - オリジンリクエストポリシーは既に **`Managed-AllViewerExceptHostHeader`**＝ Host は元から転送していない
> - SST の CloudFront Function が **`setForwardedHost()` で `x-forwarded-host` に本来のホストを退避**し、
>   OpenNext はそちらから URL を再構成する（キャッシュポリシーも `x-forwarded-host` を含む）
> - dev への実プローブで裏取り済み: `Origin: <CloudFront ドメイン>` の POST が **401**（CSRF 通過）、
>   Origin なし／でたらめは **403**
> 🔑 逆に言うと、**今は Function URL を直叩きすれば `x-forwarded-host` を偽装できる**。
> CFF を経由しないため退避処理が走らないからで、**5 を最優先にする理由がもう1つ増えた**。

> ⚠️ **5 の完了判定は `Principal:*` の掃除ではなく `AuthType` を見ること。**
> リソースポリシーの公開ステートメントは5本あるが、**すべて
> `Condition: lambda:FunctionUrlAuthType = NONE`（または `InvokedViaFunctionUrl`）付き**である
> ことを実測で確認した。つまり **AuthType を `AWS_IAM` にした時点で5本とも不発になる**。
> SST は世代違いの古いステートメントを掃除しないが、それは**無害な汚れ**であって
> 「URL が開いたまま」ではない。
> → 検証は `aws lambda get-function-url-config` の **`AuthType: AWS_IAM`** を主、
>   `get-policy` の残骸確認を従とする。
>
> ✅ **実施後の実測（2026-07-29）— 予測より綺麗になった。** SST は
> `WebPublicFunctionUrlAccess*` 系を**実際に削除した**（デプロイログに `Deleted` が出る）。
> 結果、server のポリシーは **4本**:
> `Principal:*` の残骸2本（`FunctionURLAllowPublicAccess` は `AuthType=NONE` 条件付き、
> `FunctionURLAllowInvokeAction` は `InvokedViaFunctionUrl` 条件付き＝どちらも AWS_IAM 下では不発）
> ＋ **CloudFront 用の2本**（`Principal: cloudfront.amazonaws.com` かつ
> `AWS:SourceArn` がディストリビューション ARN に限定）。
> 「5本すべて残る」という上の記述は**予測であって実測ではなかった**。実際の残骸は2本。
> 不発であることは直叩き 403 で裏が取れている。
> 📌 SST 4.17.1 のソースを確認したところ、`protection` は **server と image-optimizer の
>   両方**の Function URL を `authorization: "iam"` に切り替える（`ssr-site.ts`）。
>   image-optimizer 側の露出も同じ1手で塞がる。

> ✅ **8 の設計上の制約は2つとも予測どおりだったが、コンポーネントの選択が違った**（実装時に判明）。
> ① **`sst.aws.Cron` は 4.17.1 で deprecated**。「実体は EventBridge Rules（Scheduler ではない）」は
> `Cron` については正しいが、**非推奨でない `sst.aws.CronV2` は EventBridge Scheduler**
> （`cron-v2.ts` は `scheduler.Schedule` を作る）で、`timezone` と `retries` を持つ。**採用したのは `CronV2`**。
> どちらにせよ **中継 Lambda は必須**である点は変わらない — Rules の API Destinations が対応する認証は
> API key / Basic / OAuth のみで **SigV4 に対応せず**、Scheduler はそもそも任意の HTTPS を叩けない。
> 中継 Lambda は同一アカウントなので、**実行ロールのアイデンティティ側ポリシーに
> `lambda:InvokeFunctionUrl` を与えれば足りた**（リソースポリシーの追加は不要）。
> 対象の URL は `web.nodes.server.url` から取れる（実際に `.apply()` 越しに取得している）。
> 📌 **4本のスケジュールは1つの中継関数を共有する。** `CronV2` の `function` に `Function`
> インスタンスを渡すと `functionBuilder` が**再利用**し（新規作成しない）、叩くパスは
> `event: { path }` で渡せる。関数を4つ作る必要はない。
> 🔴 **`Authorization` ヘッダは SigV4 の署名が占有する**ため、`CRON_SECRET` を同居させられない。
> → 中継からは **`x-cron-secret`** で送り、cron ルート側は `src/lib/cronAuth.ts` で
> **両形式（Vercel の `Authorization: Bearer` と AWS の `x-cron-secret`）を受ける**。
> soak 期間は両方の経路が本番を担うので、どちらか一方に寄せてはいけない。
> この秘密ヘッダは **SigV4 の署名対象に含めてある**ので、経路上で差し替えれば署名検証で落ちる。
> ② 中継先は CloudFront ではなく **Function URL を直接**にする。**CloudFront のオリジン ReadTimeout は
> 実測 30 秒**しかなく、Vercel が関数にくれていた 300 秒から **1/10 に縮む**ため。
> 📌 この 30 秒はディストリビューション設定ではなく **KVS の metadata**（`origin.timeouts.readTimeout`）にあり、
> CloudFront Function の `setUrlOrigin()` が `cf.updateRequestOrigin()` で毎リクエスト適用している。
> ディストリビューションに見える `OriginReadTimeout: 20` は `placeholder.sst.dev` オリジンのもので、
> KVS の metadata 読み込みに失敗したときしか使われない（＝ SST #6894 の 503 経路）。
> ⚠️ Lambda 側のタイムアウトも 30 秒で**同値**のため、両者が同時に切れて 504 の原因が切り分けられない。
> 5 で IAM 認証にするなら中継 Lambda は実行ロールで SigV4 署名すればよく、`CRON_SECRET` と二重の防御になる。

> ⚠️ **6 のスコープは現行どおり `/admin*` と `/api/admin/*` に限定する。**
> 全パスに rate limit を広げると 8 の cron を自分で止めることになる。
> 費用は **$5/ACL + $1/rule×3 = 月$8**。実測トラフィック（Edge Requests 103K/月・転送 1.26GB・
> Function Invocations 5.5K）では CloudFront も Lambda も無料枠に収まるため、
> **移行後の AWS コストの大半がこの WAF**。「コスト差は月$5程度」という当初の見積りは WAF を勘定していなかった。
>
> 🔴 **web ACL はステージごとに1枚できる**（Pulumi のスタックが別なので共有されない）。
> dev と production が並ぶ soak 期間は **月$16** になり、予算通知のしきい値 $12 を超える。
> → `sst.config.ts` の `WAF_STAGES` を配列で持たせてあるので、**dev の検証が済んだら 'dev' を外す**。
> ⚠️ 9（非本番のアクセス制限）で web ACL を**もう1枚作らないこと**。作るならこの ACL を共有する。
>
> 📌 **移行で変わる挙動が2つある（どちらも緩む方向ではない）。**
> ① レート制限の窓: Vercel の `fixed_window` は窓の境界でカウンタがリセットされるが、
>    AWS は約30秒ごとに直近の窓を再評価し、**レートがしきい値を下回るまでブロックが続く**。
>    実測でも 80連打の直後は素通り（405）で、**T+45s から 403 に変わった**＝集計に遅れがある。
> ② challenge の免疫時間: 既定 300 秒。App Router のクライアント遷移は同じ `/admin*` へ
>    RSC の fetch を投げ、**実測でそれも 202（challenge）になる**。トークンが切れた瞬間の遷移が
>    challenge の HTML を受け取るのを避けるため、`challengeConfig` で **3600 秒**に伸ばしてある
>    （admin セッションは 25 時間なので依然その内側）。
>
> 📌 **海外渡航時の一時解除の手順が Vercel と変わる。** Vercel は
> `vercel firewall rules disable <id>` だったが、AWS では web ACL が IaC 管理下にあるので
> **`AdminGeoRestrictJp` の action を `count` に変えてデプロイし直す**のが正しい（教訓6）。
> コンソールや CLI で直接いじると次の `sst deploy` で黙って巻き戻る。

### 第3群｜切替準備

| # | 作業 | 期待できる結果 |
|---|---|---|
| **9.5** | ✅ **GitHub Actions ＋ OIDC で `sst deploy` を自動化（完了・実測検証済み）** | **16項目の版で抜けていた**。パリティ表の項目27（push で自動デプロイ）に対応するタスクが実行順に存在しなかった。無いと 14（soak）で **main に push すると Vercel だけが更新され、本番を担う AWS は取り残される**。加えてデプロイが「npm 11 の入った特定のマシンから手打ち」に固定される。OIDC ロールにすれば静的キーも増えない（項目12と同方向） |

> **9.5 の実装（2026-08-01）**
>
> - **`ci.yml` を拡張して `deploy` ジョブを足した**（別ワークフローにしなかった）。
>   `needs: [lint-typecheck, e2e]` で **テストが緑のときだけ**デプロイする。別ファイルにして
>   `workflow_run` で繋ぐ形もあるが、それだと ref の解釈が既定ブランチ側になって分かりにくく、
>   ここでは「同じワークフロー内の依存」で足りる。`permissions` はジョブ単位で絞れる。
> - **入口は `npm run sst:deploy` のまま**（0-a の不変条件）。CI 専用の経路を別に作ると
>   ①ツールチェーン検査 ③デプロイ ④画像最適化の検証 が丸ごと抜ける。
>   `scripts/deploy.sh` は **② だけ条件分岐**させた（CI では資格情報が既に環境変数にあり、
>   `~/.aws/config` が無いので `aws configure export-credentials` は使えないし不要）。
> - **デプロイ先は `strategy.matrix.stage` の1か所**で決める（`WAF_STAGES` / `CRON_STAGES` と同じ運用）。
>   🔴 **今は `[dev]` だけ。`production` を足すのは 13 で DNS を切り替えた後**。
>   先に足すと本番ステージが CI から先に作られ、13 の検証手順を飛ばすことになる。
> - **ロールは SST の管理外**（`scripts/bootstrap-github-oidc.sh`／1度だけ実行）。
>   `sst.config.ts` に入れると「CI がデプロイするスタックが CI 自身のロールを管理する」循環になり、
>   デプロイに失敗したとき CI がデプロイし直せなくなる。教訓6 は SST が作ったリソースの話で、
>   最初から SST の外にあるものには当てはまらない。
> - 権限は **AdministratorAccess**（オーナー判断・2026-08-01）。SST/Pulumi は Lambda・CloudFront・
>   S3・IAM・WAF・Scheduler・ACM・Route53 まで広範に触るので、絞ると 13 で AccessDenied が
>   連発して切り分け不能になる。**防御は信頼ポリシー側に寄せた**
>   （`sub` を `repo:i0li0/siko-coffee:ref:refs/heads/main` に限定・静的キーは増やさない）。
> - `concurrency` は `cancel-in-progress: false`。SST の state ロックは1ステージ1本で、
>   デプロイ中に打ち切ると **ロックが残ったままになる**。
>
> **完了条件**
> 1. ✅ **`bash scripts/bootstrap-github-oidc.sh` 実行済み（2026-08-01）。**
>    信頼ポリシーの `sub` が `repo:i0li0/siko-coffee:ref:refs/heads/main`、権限は
>    `AdministratorAccess` の1本、リポジトリ変数 `AWS_DEPLOY_ROLE_ARN` の登録まで
>    **AWS と gh に問い合わせて確認**（冪等性も2回目の実行で実測）。
>    ⚠️ IAM の `description` は Latin-1 のみ＝日本語を入れると `ValidationError`。
> 2. ✅ **CI からの実デプロイを確認（2026-08-01）。** 初回（#115 マージ時）は
>    **デプロイ自体は成功して AWS に適用された**が ④ で赤くなった＝ CI が sharp の潜在バグを
>    炙り出した（教訓29／#117 で修正）。**#117 マージ後の実行で `SST Deploy (dev)` が緑**になり、
>    Lambda の `LastModified` が CI 実行時刻（`22:17:2x`）に更新されたことを確認した。
>    📌 ジョブ名は実行時に `SST Deploy (dev)` と展開される。PR 上で
>    `SST Deploy (${{ matrix.stage }})` と未展開に見えるのは**スキップ時だけの表示**。
>    ⚠️ 「ワークフローの文法が通った」は「デプロイできた」の証明ではない（教訓27 と同型）。
>    実デプロイの結果は **AWS 側に問い合わせて**確かめる（例: `aws lambda get-function-configuration`
>    の `LastModified` が CI 実行時刻に更新されているか）。
| 10 | ✅ **CloudWatch Alarms を先に用意**（完了・**dev で実測検証済み**） | 観測できない状態で切り替えない。Vercel に無い機構＝移行で明確に良くなる項目。経路は **Alarm → SNS → 中継 Lambda → Slack**（メール購読は購読確認のクリックが要り IaC で完結しないので不採用）。<br>🔴 **トピックは2本**。アクションはアラームと同一リージョン必須で、**CloudFront のメトリクスは us-east-1 にしか出ない**ため。中継 Lambda 1本にクロスリージョンで集約する。<br>🔴 **SES の `Reputation.*` は production でだけ作る**（アカウント全体のメトリクスなので dev にも作ると soak 中に二重に鳴る）。<br>⚠️ `SLACK_WEBHOOK_URL` は `SECRET_NAMES` に入れず placeholder 付きで宣言（未設定でも deploy は通る）。**値は deploy 時に焼き込まれるので `sst secret set` 後に再デプロイが要る**。<br>📌 **13 での再確認**: production では SES の2本が新規に作られる＝そこで初めて有効になる |
| 11 | ✅ **Route53 の TTL を 60s へ**（切替の**24時間以上前**・**完了 2026-08-01**） | **完了**。apex A **300s → 60s** / www CNAME **500s → 60s**（値は不変・権威 NS 4本で実測）。対象は 13 で書き換える2本だけで、ACM 検証 CNAME と SES DKIM は据え置き。**依存 F は解消**＝ 13 は **2026-08-02 17:50 UTC 以降**ならいつでも打てる。<br>🔴 **「60s だから切り戻し1分」と見積もらないこと。** 24時間は 500s から計算した値ではなく、TTL を守らない／下限を設けるリゾルバと OS・ブラウザのキャッシュを吸収するための余裕。期待できるのは 5〜8分が**1分台に近づく**ことまで（詳細は `docs/pour-over-log.md` の 2026-08-01 の節） |
| 12 | ✅ **`domain` を設定**（`name: www.sikocoffee.com` / `aliases` に apex）＋ apex→www の 308 と HSTS を `edge.viewerRequest.injection` で（**実装完了 2026-08-01・実測は 13**） | 🔴 **証明書は SST に自動作成させず、0-b で発行済みのワイルドカード証明書の ARN を `domain.cert` に渡す**。自動作成させると `www.sikocoffee.com` が Vercel への CNAME であるために **Vercel 側の CAA が効いて `CAA_ERROR` で発行できない**（0-b で実証）。〜〜手動の事前発行は不要〜〜 という当初の記述は**誤り**だった<br>🔴🔴 **`dns: false` を採用**。`dns` を有効のままにすると **deploy 自体が DNS 切替になり 13 の「デプロイ→検証→切替」が壊れる**（`allowOverwrite` 既定 false ＋既存レコードありでデプロイが落ちる公算も高い）。切替・切り戻しは Route53 の UPSERT で人が行う<br>🔴 **dev で実測できない唯一のタスク**（`domain` は production 限定＝ apex の Host が dev に届かない）。代わりに `src/lib/apexRedirect.ts` へ切り出して**生成コードを実際に評価する**回帰テスト `src/__tests__/apexRedirect.test.ts`（13ケース・変異3件で落ちることまで確認）を検証手段にした |

> 🔴 **12 の前に必須の前提作業が2件ある**（2026-07-28 の AWS 側実地調査で判明）。
> どちらも 12 を物理的に実行不能にするため、番号は増やさず**12 の前提**として扱う。
>
> **① CAA レコードに Amazon CA を追加する。**
> `sikocoffee.com` の CAA は `0 issue` が **globalsign / letsencrypt / pki.goog / sectigo の4つだけ**
> （Route53 の RRset と権威 NS への dig の両方で確認）。AWS 公式は
> value に **`amazon.com` / `amazontrust.com` / `awstrust.com` / `amazonaws.com` のいずれか**を要求する。
> ＝ **現状 Amazon CA は許可されておらず、SST が証明書を作っても発行が CAA エラーで落ちる。**
> 上の「手動の事前発行は不要」は CAA を直した後にのみ成立する。
> → **`0 issue "amazon.com"` を CAA に追加してから 12 に入る。**
> 📌 Amplify 時代の証明書は取れているので、CAA はその後に追加されたとみられる。
>
> **② Amplify の domain association とアプリを削除する。**
> 「旧構成の残骸」として棚卸しに載っている Amplify アプリは**残骸ではなく稼働中**だった。
> ブランチ `main` の `enableAutoBuild` が有効で、**2026-07-28 にもビルドが成功している**
> （通算122ジョブ）。ブランチの既定ドメインは **200 を返し、サイトの完全な公開コピーが動いている**
> （`/shop` 200・`X-Robots-Tag` なし）。さらに **`sikocoffee.com` の domain association が
> `AVAILABLE`**（www は verified）。実 DNS は Vercel を向いているので現時点の実害は無いが、
> **12 で SST が同じ Route53 レコードを作りに行くと衝突しうる。**
> Route53 に残る `acm-validations.aws` 宛の孤児 CNAME 2本もこれが出所。

> ⚠️ **`domain.redirects` を使ってはいけない。** SST の `HttpsRedirect` は
> **S3 website バケットの `redirectAllRequestsTo` ＋ CloudFront** で実装されており
> **Response Headers Policy を付けない＝HSTS が乗らない**。
> `next.config.ts` が apex 正規化を抱えている理由（リダイレクト応答にも完全な HSTS を乗せる）を
> そのまま壊す。apex は `aliases` に入れ、308 と HSTS は CloudFront Function で出すこと。
> 📌 深刻度の補正: `hstspreload.org` の status は **`unknown`＝preload リストに未登録**。
> 現状の実害は無く、「将来 preload 申請する道を塞ぐ」という位置づけ。

> ⚠️ **CloudFront Function は1キャッシュビヘイビアに1つしか関連付けられない。**
> dev には既に SST 生成の `WebCloudfrontFunctionRequest` が viewer-request に付いている。
> 独立した関数を足すことはできないので、**SST の `edge.viewerRequest.injection` を使う**
> （SST はユーザーの injection を自分の関数に合成する）。

### 第4群｜切替と観測

| # | 作業 | 期待できる結果 |
|---|---|---|
| 13 | **production ステージへデプロイ → 検証 → DNS 切替**<br>📕 **当日の手順書は `docs/pour-over-13-runbook.md`** | 🔴🔴 **前提: production の secret 投入（2026-08-01 時点で 0本）**。`SECRET_NAMES` の7本が1本でも欠けると `sst deploy --stage production` が落ちる。**値は Vercel からコピーする（作り直さない）** — soak 中は両方が本番を担うので `AUTH_SECRET` などを作り直すとランダムにログアウトする<br>🔴 **DNS 切替は SST ではなく人が Route53 で行う**（12 で `dns: false` にしたため）。apex の A と www の CNAME を CloudFront への ALIAS へ UPSERT する。**切り戻しは同じ操作で Vercel へ戻すだけ＝ 11 の 60s TTL がここで効く**<br>🔴 **事前検証は CloudFront の URL ではできない**（`domain` を付けると SST が `*.cloudfront.net` を 403 にする）。`curl --resolve www.sikocoffee.com:443:<配信IP> https://www.sikocoffee.com/...` で SNI と Host を本番ドメインのまま当てる。**12 の apex 308 ＋ HSTS はここで初めて実測できる**（dev では原理的に動かない）<br>シークレットは Vercel 本番の30本と突合済みで過不足なし（AWSキー3本は廃止、BLOB3本は不要、`SITE_URL`/`NEXTAUTH_URL` はコードに `https://www.sikocoffee.com` のフォールバックあり）<br>🔴 **5 の確認をこのステージでもやり直すこと**（`protection` はステージごとに効くので、dev で閉じても production は別）。`AuthType: AWS_IAM` と直叩き 403 を再測する<br>🔴 **4 の積み残し②③をここで回収する**: production のバケット名で `AVATAR_UPLOAD_BUCKET` / `AVATAR_BUCKET` / `AVATAR_BASE_URL` を Vercel 本番にも入れ、Vercel の IAM ユーザーに S3 権限を足す。**それまで本番のアイコン設定は 503 のまま**（オーナー判断・2026-07-29。理由は `docs/pour-over-log.md` 教訓20）<br>🔴 **8 の cron を DNS 切替の“あと”で有効化する**: `sst.config.ts` の `CRON_STAGES` に `'production'` を足して再デプロイ。それまで production のスケジュールは DISABLED で作られており、cron は Vercel 側だけが回している。**先に有効化すると `instagram-refresh` が Vercel と二重に走り、長期トークンの更新が競合する** |
| 14 | **soak 期間**。**Vercel は `main` 自動デプロイのまま生かす** | ロールバック先が常に最新に保たれる。この期間は Vercel の設定に一切触らない |

### 第5群｜後始末

| # | 作業 | 期待できる結果 |
|---|---|---|
| 15 | **Vercel 解約 ＋ 決済再開** | ①Stripe 新キー投入 →②`PAYMENTS_ENABLED=true` →③再デプロイ の順厳守 |
| 16 | **Vercel 依存の撤去（下記①〜⑦）** | OpenNext #1202 の暫定回避を撤去。`siko-coffee.vercel.app` 向けの2本目は解約で消えるため**移設不要＝削除のみ** |

> 🔴 **16 は「`vercel.json` を消す」だけでは build が全環境で落ちる。** `package.json` の
> **`prebuild` が `scripts/check-cron-schedule.mjs` を呼び、このスクリプトは `vercel.json` を
> 読めないと `exit 1`** する。さらに `.github/workflows/ci.yml` にも `npm run check:cron` の
> 独立ステップがある。→ 削除対象は以下の**4点セット**（＋テスト）:
> ① `next.config.ts` の `redirects()` ② `vercel.json` ③ `scripts/check-cron-schedule.mjs` と
> `prebuild` フックと `check:cron` スクリプト ④ CI の該当ステップ
> ⑤ `src/__tests__/hostRedirects.test.ts`（②と同時に消さないと CI が落ちる）
> ⑥ 🆕 **`src/lib/stage.ts` の `?? process.env.VERCEL_ENV` フォールバック**（1 で soak 期間の
> Vercel 本番を守るために入れたもの。⑥は `src/__tests__/stage.test.ts` の該当ケースと同時に消す）
> ⑦ 🆕 **`src/lib/stage.ts` の `isVercelPlatform()` と `src/app/layout.tsx` の呼び出し、
> `@vercel/analytics` / `@vercel/speed-insights` の依存**（3 で入れたもの。⑥と同じく
> `src/__tests__/stage.test.ts` の該当 describe も同時に消す）
> ⑧ 🆕 **`src/lib/cronAuth.ts` の `Authorization: Bearer` 分岐**（8 で AWS 経路を `x-cron-secret` に
> 移したあとも、soak 中の Vercel cron のために残してあるもの。`src/__tests__/cronAuth.test.ts` の
> 該当ケースも同時に消す）。あわせて **`vercel.json` の `crons` 4本**も②で一緒に消える
>
> 📌 ⑥⑦とも `src/lib/stage.ts` に集めてあるので、**撤去の起点は `grep -rn VERCEL src/`** でよい。
> ⑧ は `src/lib/cronAuth.ts` の1関数に閉じている。

### 🔴 動かせない依存

| | 依存 | 理由 |
|---|---|---|
| A | **5 → 6** | Function URL を閉じないと WAF は迂回されるので無意味 |
| B | **5 と 4** | 5 の Lambda@Edge はボディ 1MB 上限。だから 4 は presigned S3 PUT で作る |
| C | **6 → 13** | WAF 不在で切り替えると admin の防御が丸ごと消える |
| D | **1 → 13** | Sentry が無効のままだと切替後に何を観測しても信用できない |
| E | **8 → 15** | Instagram の長期トークンは cron で延長する方式。**60日止まると恒久失効**し手動再認証が要る。✅ 8 で **月次 → 週次**にしたので、60日の窓に取れる更新機会は 2回 → **8回**になった |
| F | ✅ **11 → 13** | 24時間以上前でないと旧 TTL が失効せず引き下げが効かない。**2026-08-01 17:50 UTC に 11 を実施済み＝ 13 は 8/2 17:50 UTC 以降なら可** |
| G | **12 → 16** | 先に `redirects()` を消すと apex が無正規化になる。テストも同時に消さないと CI が落ちる |
| H | **0-b（CAA 修正）→ 12** | Amazon CA が CAA で許可されていないと ACM が発行できず、`domain` 設定が完了しない |
| ~~I~~ | ~~**Amplify 削除 → 12**~~ | ✅ **解消済（2026-07-28）**。0-c で association・app・role・孤児 CNAME を削除した |
| **J** | **0-a → 以降のすべてのデプロイ** | npm 10 でビルドすると sharp が wasm32 に落ち、**next/image が無言で壊れたままデプロイが成功する** |
| **K** | **9.5 → 14** | 無いと soak 中に main へ push するたび Vercel だけが進み、本番の AWS が取り残される |
| **L** | **Instagram トークンの更新確認 → 15** | E の実体を絶対日付にしたもの。✅ **2026-08-01 の更新に成功**（実測 `refreshedAt: 2026-07-01T00:51:23Z` → **`2026-08-01T00:21:11.206Z`** / `expiresIn: 5184000`）＝ **失効は 2026-08-30 → 2026-09-30 へ後退**。次の機会は **2026-09-01 00:00 UTC**（Vercel の月次 `0 0 1 * *`）で、13 が済んでいれば AWS の週次に替わる。🔴 **AWS 側の週次スケジュールは 13 まで DISABLED** なので、**13 が 9/1 を跨ぐならその時点でも頼れるのは Vercel の月次1本**。成否は `siko-coffee-config` の `refreshedAt` を読めば判定できる（Vercel のログは不要）。落とすと恒久失効し手動再認証 |

### Pour Over に含めないもの（分離実施）

同時にやると切り分けが困難になるため、意図的に外す。

- `middleware` → `proxy` のリネーム（Next 16 で非推奨・codemod あり）
- `/admin/monthly` のリンク切れ
- security-backlog の4件
- ブレンド共創プラットフォームの機能開発

---

### 参考: 移行しなくてよいと確認できたもの

調査で「作業が不要」と確定した項目。計画から外してよい。

| 項目 | 根拠（2026-07-28 実測） |
|---|---|
| **SES のサンドボックス脱出** | `ProductionAccessEnabled: true` / 上限 50,000通・日 / `sikocoffee.com` は Verified・**DKIM SUCCESS** |
| **Blob のデータ移送** | ストアは空（`Storage 0 B`・"no blobs in this store yet"）、参照する `avatarUrl` も0件 |
| **Protected Sourcemaps** | AWS・Vercel とも `.js.map` は 403＝そもそも出力されていない（`SENTRY_AUTH_TOKEN` 未設定時は `sourcemaps.disable` が効く） |
| **Skew Protection** | Vercel 側で Disabled（Pro 機能）＝失うものが無い |
| **CI の付け替え** | `.github/workflows/ci.yml` に Vercel への参照なし。Playwright は localhost＋自前 webServer |
| **Marketplace 統合・Log Drains・Deploy Hooks** | いずれも未使用（`Drain Volume 0 B`・"No resources found"・"does not have any deploy hooks"） |
| **カスタム環境への対応** | Production/Preview/Development の3つのみ＝`STAGE==='production' ? 本番 : preview` で完全 |

---

## 再監査（2026-07-28・全体を通しで検証）

「進んでから戻らない」ことを目的に、コード全走査・AWS 実測・SST 4.17.1 のソース読解で
全項目を突き合わせた。**背骨と依存関係は正しかった**。上に反映済みでない事項のみここに残す。

### 解消・更新された前提

- ✅ **本番 lots の孤児 `reservedG=200` は解消済み**。現在 `reservedG: 0` /
  `updatedAt: 2026-07-27T19:27:26Z`。時刻から見て Vercel の cron 一覧の **Run** を
  押した結果と思われる。`reconcileLotReservations()` が実際に効く証拠でもある。
- ✅ **`next/image` は現在も正常**（w=256 で 4,182 B / webp ＝ Vercel とバイト単位で一致）。
- ✅ **GitHub に AWS の静的キーは無い**（secrets / variables ともに 0 件）。
  静的キー `AKIA…ZCYG` の消費者は **Vercel 本番だけ**で確定（2026-07-28 も DynamoDB で使用中）。
- ✅ **CAA に必要なのは4つのうち1つだけ**（ACM 公式）。`0 issue "amazon.com"` の1本追加で足り、
  既存4件を残したまま追加できる。**Vercel の証明書更新にも影響しない**（Vercel は Let's Encrypt）。
- ✅ **1MB 超のボディを持つルートはアバターのみ**。Server Actions は未使用。

### `release-reservations` の件は Vercel API では決着しない

Vercel コネクタで runtime ログを引いたところ、**`since=24h` と `since=1h` の結果が完全に一致**した
（`/` 5 / `/api/menu` 2 / `/shop` 1 / `/api/beans` 1）。＝ **runtime ログの保持は約1時間**で、
cron の実行時刻（18:00–19:00 UTC）は取得範囲外。「cron のログが無い」ことは証拠にならない。
このコネクタに Cron Jobs の API は無い。
→ **決着させるならダッシュボードの `View Logs` / `Run`。** ただし優先度は下がった:
実害だった孤児 `reservedG` は解消済みで、仕組み自体は 8 で置き換わる。
📌 「Hobby は cron 2本まで」という仮説は**外れ**（Vercel 公式は現在 **100本/プロジェクト・日次まで**）。
📌 `instagram-refresh` は 7/1 00:51 UTC に実際に発火している＝ cron 機構そのものは生きている。

### そのほか

- ✅ **`sentry.edge.config.ts` だけ環境無条件**だった件 → **1 で `environment` を補って解消**（2026-07-29）。
  🔑 **この行は正しく、メモリ側の「server と edge が VERCEL_ENV を見ている」が誤りだった。**
  実際に `VERCEL_ENV` を見ていたのは server と **client**（client は Next 16 の死にコードで、1 で削除）。
  ⚠️ **`tracesSampleRate: 1`・`sendDefaultPii: true` は据え置き**。サンプリング率の是正は
  Sentry のクォータ方針の判断を伴うため 1 の範囲外とした（別途決める）。
- ⚠️ **Vercel チームに放置プロジェクトが2つ**（`modest-burnell-e74583` / `thirsty-hoover-1c2347`）。
  どちらも `live: false`・独自ドメインなし・デプロイ1回きりで**害は無い**。15 の解約で消える。
- 📌 **作業場所はメインリポジトリに固定する。** `.sst/` と `node_modules/` が使い捨て worktree
  （`next-image-optimization-b798fc`）にしか無く、消すと `npm ci` + `sst install` からやり直しになる。
  state 自体は S3（`sst-state-…`・バージョニング有効）なので失われない。
  **`sst deploy` と AWS 操作は main から**、コード変更は従来どおり worktree + PR、という分担にする。
  `next.config.ts` の `repoRoot()` が worktree 用の探索分岐を持つ点でもメイン側が素直。
- 📌 server Lambda は **x86_64 / 2048MB**（7 で 1024 から変更）、image-optimizer は **arm64 / 1536MB**。
  **アーキテクチャの不一致は残っている。** 7 では arm64 化を**意図的に見送った**（1回のデプロイで
  メモリと arch の2変数を動かすと効果を切り分けられないため）。やるなら単独タスクとして、
  7 が残した数値（ウォーム p50 51.3ms / コールド p50 1,068ms）を基準に測る。sharp の arm64 ビルドは実証済み。

---

## AWS 側 実地調査（2026-07-28）

Vercel 側の棚卸しと対になる回。**stage `dev` の実デプロイとアカウント全体を実測**した結果のうち、
上の記述を**訂正するもの**と**計画に無かったもの**を記録する。
（🔴 CAA と Amplify の2件は「第3群」の 12 の前提として上に反映済み。）

### 🔴 Function URL の露出は「地雷4」の記述より広い

| | 記録 | 実測（2026-07-28 再検証） |
|---|---|---|
| 対象 | server の Function URL のみ | **image-optimizer の Function URL も `AuthType: NONE` / `Principal: *`**。直アクセスで 200 を返し画像を生成する＝無認証の変換コンピュートがもう1本開いている |
| CORS | 記載なし | **両方とも全開**（`AllowOrigins`/`AllowMethods`/`AllowHeaders` が `*`）。任意 Origin に `Access-Control-Allow-Origin: *` を返し preflight も 200。`AllowCredentials: false` なので Cookie は乗らない |

> 🔑 **リソースポリシーに世代の違う重複ステートメントが残る。**
> server 側は5ステートメントあり、うち3つが公開許可。Sid の命名規則が2世代混在しており、
> **SST はデプロイをまたいだ古い許可を掃除していない**。
>
> 🔴 **↑ ここから導いた「`Principal:*` が残っていれば URL は開いたまま」は誤りだった（2026-07-29 に実施して判明）。**
> 公開ステートメントは**すべて `Condition: lambda:FunctionUrlAuthType = NONE`
> （または `InvokedViaFunctionUrl`）付き**なので、**`AuthType` を `AWS_IAM` にした時点で不発になる**。
> 実際 5 の適用後も `Principal:*` は2本残っているが、直叩きは **403** である（実測）。
> → **完了判定は `Principal:*` の掃除ではなく `aws lambda get-function-url-config` の
> `AuthType: AWS_IAM`**（詳細は上の「5」の節）。ポリシーの残骸は**無害な汚れ**。
> なお SST は `WebPublicFunctionUrlAccess*` 系を実際には削除したので、残骸は3本ではなく2本だった。

> ⚠️ **予約同時実行がどの関数にも設定されていない。** 同時実行クォータが 1000 に戻っている今、
> 公開された Function URL から 1000 並列を引ける。`protection` と併せて上限を設けるのが妥当。

### ⚠️ オリジン ReadTimeout は 20 秒ではなく **30 秒**（訂正済み）

第2群の 8 に書いていた「SST 既定で 20 秒」は誤り。詳細は当該箇所に反映した。要点のみ再掲:
実効値は **KVS の metadata（`origin.timeouts.readTimeout`）にあり 30 秒**、
CloudFront Function の `setUrlOrigin()` が `cf.updateRequestOrigin()` で毎リクエスト適用している。
ディストリビューションに見える `OriginReadTimeout: 20` は `placeholder.sst.dev` オリジンのもので、
metadata の読み込みに失敗したときしか使われない。
⚠️ **Lambda 側も 30 秒で同値**のため両者が同時に切れ、504 の原因を切り分けられない。

### ⚠️ セキュリティヘッダが静的アセットに乗らない（**パリティ退行**）

ディストリビューションの `ResponseHeadersPolicyId` は `None`、アカウントにカスタム
Response Headers Policy は **0 個**。ヘッダは Next.js 側で付けているため
**server を経由するページにしか乗らない**。

| リクエスト | Vercel 本番 | AWS（dev） |
|---|---|---|
| `/`（ページ） | CSP/HSTS/X-Frame/nosniff 全部 | 全部 |
| `/_next/static/**.js` | **全部あり** | **`cache-control` のみ** |
| `/_next/image?...` | HSTS/nosniff あり | **`cache-control` のみ** |

S3 配信のアセットと画像最適化の応答でヘッダが丸ごと落ちる（特に `nosniff` の欠落）。
→ 対処は R-1。

### ⚠️ コールドスタートが実測で効いている

CloudWatch Logs Insights（直近48h・server Lambda）と、キャッシュバスター付き `/shop` の TTFB 実測:

| | 1回目（コールド） | 2回目以降 |
|---|---|---|
| AWS（dev） | **3.11s** | 0.24〜0.31s |
| Vercel（本番） | 0.58s | 0.36s |

**296 invocations / 55 コールド ＝ 18.6%**。`initDuration` は avg 164ms・max 200ms しかなく、
主因は初回リクエストの実行そのもの（`duration` max **2,190ms**＝モジュール遅延ロードと
DynamoDB 初回接続）。`open-next.config.ts` の warmer は `'dummy'` で無効のまま。
＝ **温まっていれば AWS の方が速いが、コールド経路は約3秒**。

> 🔑 **`maxMemoryUsed` は 231MB / 1024MB。** つまり作業 7 の 2048MB 化は
> **メモリ不足の解消ではなく純粋な CPU 増強**である、という裏付けが取れた。RAM は余っている。

✅ **7 の実施後（2026-07-31）にこの節の前提が改善した。** 2048MB 化でコールド経路の実行時間は
**p50 2,041ms → 1,068ms（−48%）**、ウォーム p50 も 73.8ms → 51.3ms。上表の「コールド 3.11s」は
その分だけ短くなる（`initDuration` は 164ms → 157ms でほぼ不変＝縮んだのは初回実行そのもの）。
**ただしコールド経路が消えたわけではなく、依然 1 秒級**である。
→ **warmer の要否はこの新しい水準で判断する。** `open-next.config.ts` の warmer は `'dummy'` のままで、
有効化すると常時課金が増える。dev の 15.6% というコールド率は**巡回トラフィック主体の dev 固有の値**で、
本番の実際のコールド率は 13 の後でないと分からない。**warmer の判断は 13 以降に持ち越すのが妥当**
（今決めても根拠になる本番の数字が無い）。

### ⚠️ 4（Blob → S3）は画像モデレーションを黙って外してしまう

`src/app/api/account/avatar/route.ts` は Rekognition `DetectModerationLabels` を
**`Image: { Bytes: imageBytes }`＝サーバを通った生バイト**で呼んでいる
（`MinConfidence: 70`、失敗時は `safe: false` でフェイルクローズ）。実行ロールにも当該権限がある。
→ **presigned S3 PUT にすると画像が server Lambda を一切通らないため、この検閲が丸ごと消える。**
**対処**: PUT 完了後に呼ぶ confirm エンドポイントで `Image: { S3Object: ... }` 形式で再検閲する
（S3 参照なら 15MB まで可）。実行ロールに保存先バケットの `s3:GetObject` が要る。
**4 の設計にこの一段を明記すること。**

### ⚠️ 5 が使う Lambda@Edge の制約（AWS 公式で確認）

`oac-with-edge-signing` の署名関数には以下が効く。
- **us-east-1 限定** / **番号付きバージョン必須**（`$LATEST`・エイリアス不可）
- **環境変数が使えない**（予約変数を除く）/ レイヤー不可 / X-Ray 不可 / VPC 不可 / DLQ 不可
- **arm64 不可**（x86_64 のみ）/ ephemeral storage 512MB まで / **provisioned concurrency 不可**
- 実行ロールは `lambda.amazonaws.com` と **`edgelambda.amazonaws.com` の両方**から assume 可能に
- 📌 **ログはビューアに最も近いリージョンの CloudWatch に出る**。`ap-northeast-1` だけを見ていると
  署名関数の障害を見落とす。10 のアラーム設計で考慮する。

### ⚠️ メールの運用体制が無い（切替とは独立の既存ギャップ）

SES 本体は健全（Production 有効・DKIM SUCCESS・上限 50,000通/日）だが、その周辺が空:
- **SPF レコードが無い**（apex TXT は site verification のみ）/ **DMARC が無い** / **MX が無い**
- SES の **custom MAIL FROM 未設定** ＝ エンベロープ MAIL FROM は `amazonses.com` のまま
- **configuration set が 0 個** ＝ バウンス/苦情のイベント配信先が無い
- `FeedbackForwardingStatus` は有効だが、転送先の `noreply@sikocoffee.com` は
  **MX が無いので受信できない** ＝ **バウンス通知はどこにも届かない**

DKIM が `d=sikocoffee.com` に整列するため認証自体は通る。問題は
**注文確認メールが不達でも検知手段がゼロ**という点。Vercel 時代からの既存ギャップで移行では
悪化しないが、AWS 一本化後は SES が唯一の送信路になる。→ R-5。

### ⚠️ 実行ロールの権限が広い

server Lambda のインラインポリシーは DynamoDB を `siko-coffee-preview-*` に限定しており**正しい**が:
- **`ses:SendEmail` / `ses:SendRawEmail` が `Resource: "*"`** ＝ dev ステージから検証済み
  アイデンティティ全部として送信できる。dev URL は公開・admin はパスワードのみなので踏み台の面がある
- **`cloudfront:CreateInvalidation` が `Resource: "*"`** ＝ アカウント内の任意ディストリビューションを無効化できる
- S3 の書き込み先が **CloudFront が `_assets` として配信しているバケットと同一**。
  4 でアバターを置くなら**別バケット（または別プレフィクス＋厳格なポリシー）**にすること

### 観測とガバナンスの現状（すべて 0 件）

| 項目 | 状態 |
|---|---|
| CloudWatch Alarms / SNS トピック | **0 / 0** ＝ 10 に着手する前に**通知先そのものが無い** |
| CloudFront アクセスログ | **無効** ＝ エッジのリクエスト可視性ゼロ |
| SQS の DLQ / RedrivePolicy | **無し** ＝ ISR 再検証の失敗が4日後に黙って消える |
| CloudFront CustomErrorResponses | **0 件** ＝ 5xx で CloudFront 素のエラーページが出る |
| `next/image` の**存在しない画像**の扱い | **AWS 500 / Vercel 400**（2026-07-29 実測。正常な画像は両方とも最適化されて 200 なので **5 とは無関係の既存差分**）。10 のアラームを 5xx 率で組むと、**壊れたリンク1本でページングされうる**点に注意 |
| GuardDuty / Security Hub / Config / Access Analyzer | **0 / 未購読 / 0 / 0** |
| IAM パスワードポリシー | **未設定** |
| Route53 ヘルスチェック | **未設定** ＝ ロールバックは手動 DNS 変更のみ |

良好だったもの: **ルート MFA 有効**、**CloudTrail は多リージョン＋改ざん検知で配信も継続中**、
本番 DynamoDB は PITR 有効・削除保護有効を再確認、SST の state バケットはバージョニング有効＋
パブリックブロック済み。

### その他の実測

- Function URL の `InvokeMode` は両方 **`BUFFERED`** ＝ レスポンスストリーミング無効、同期呼び出しの
  **6MB レスポンス上限**が効く。ただし最大ページは 240KB、Suspense の使用も3ページのみ＝**現状は実害なし**。
  将来 admin 集約 API が育ったときの天井として記憶しておく。
- server Lambda は **x86_64 / 2048MB**（7 で 1024 から変更済み）、image-optimizer は **arm64 / 1536MB**。
  **アーキテクチャの不一致は未解消**。7 では 2変数を同時に動かさないため arm64 化を見送った＝**独立した未着手項目**
  として残っている（sharp の件で arm64 ビルドは実証済みなので、やること自体の障壁は低い）。
- IPv6 は**無効**だが **Vercel 側にも AAAA が無い**ため退行ではない。有効化は費用ゼロの改善。
- `MinimumProtocolVersion` は `TLSv1`（既定証明書ゆえ強制）。12 で ACM 証明書を付けたら
  **TLSv1.2_2021** にすること。
- dev の CloudFront は既に**1日あたり3千件規模のリクエスト**を受けている（bot が公開 URL を発見済み）。
  9（非本番のアクセス制限）の必要性を実測が裏付けている。
- 本番の静的アクセスキーは **調査当日も DynamoDB へのアクセスに使われていた** ＝ Vercel 本番が現役で
  使用中であり、**切替前には削除できない**ことが実測で確定。
- 💰 費用の再見積り: CloudFront も Lambda も無料枠内、DynamoDB/S3 は誤差 ＝ **やはり WAF が支配的**。
  ただし記録に無かった線が2本ある — **Lambda@Edge には無料枠が無い**（リクエスト課金＋GB-秒）と
  **CloudWatch Logs の取り込み課金**。総額は月 **$9〜11** 見込み。
  ✅ 予算アラートの閾値引き上げは **0-d で実施済み**（上限 $10 → **$20** / 通知 $0.01 → **$12**）。
  🔴 **ただしこの $9〜11 は web ACL が1枚のときの数字**（2026-07-31 に 6 を実装して判明）。
  web ACL は Pulumi のスタック単位なので **ステージごとに1枚できる**。dev と production が並ぶ
  soak 期間は WAF だけで月$16 になり、**通知しきい値 $12 を確実に超える**。
  → `sst.config.ts` の `WAF_STAGES` から 13 の前に `'dev'` を外すこと。

---

## 推奨タスク（コスト非制約の前提・2026-07-28）

上の実行順（21項目）＝「切替に必須」とは**別枠**の推奨。優先度順。着手判断はオーナー。

| # | 内容 | 根拠 |
|---|---|---|
| **R-1** | **CloudFront Response Headers Policy を付ける** | 上の**パリティ退行**の直接の対処。静的な5つ（HSTS / X-Content-Type-Options / X-Frame-Options / Referrer-Policy / Permissions-Policy）を RHP に置き、**CSP はアプリ側に残す**（`docs/csp-nonce-migration-plan.md` で将来リクエスト毎になるため）。🔗 **12 の「apex 308 に HSTS を乗せる」問題も RHP で解ける**＝ `HttpsRedirect` が RHP を付けない件への正攻法。CloudFront 生成のエラーページにも乗る |
| **R-2** | **CloudWatch RUM を入れる** | パリティ表で唯一 ✕ の Speed Insights の**直接の代替**。ap-northeast-1 で利用可能を確認済み。実ユーザーの Core Web Vitals が取れ、「モバイルのスコアが取れていない」問題を移行後に解消できる。⚠️ JS スニペット方式なので **CSP の `connect-src`/`script-src` 更新が必須** |
| ~~**R-3**~~ | ~~CloudFront 継続的デプロイ（staging distribution）~~ → **❌ 不採用を推奨** | 当初「即時ロールバックへの答え」と評価したが**過大評価だった**（下の注記を参照）。ロールバックの実際の答えは **14（soak 中は Vercel を生かす）＋ R-4 の Route53 ヘルスチェック／フェイルオーバー** |
| **R-4** | **観測の土台を作る** | **SNS トピックがまず必要**（10 の前提）。加えて CloudFront standard logging v2 / SQS の DLQ / **Synthetics canary による外形監視**（Vercel にも無い＝純増）/ Route53 ヘルスチェック＋フェイルオーバー |
| **R-5** | **SES を運用できる状態にする** | SPF・DMARC・MX の追加、custom MAIL FROM、**configuration set + event destination → SNS**。コスト非制約なら VDM も。注文フローの生命線 |
| **R-6** 🔺 | **コールドスタート3秒を潰す** | 🔑 **SST の Nextjs コンポーネントに `warm` プロパティがある**（server 関数を暖めておくインスタンス数。実体は数分ごとに n 並列でリクエストする serverless cron）＝ **`sst.config.ts` に1行**で効く。実測 TTFB 3.11s → 0.24s の改善が見込め、**手間に対する効果が最も大きい**ため優先度を上げた。確実さを買うなら provisioned concurrency だが、まず `warm` で足りるか測るのが順当。⚠️ **Lambda@Edge は provisioned concurrency 非対応**なので 5 の署名関数には効かない |
| **R-7** | **実行ロールと同時実行を絞る** | `ses:*` と `cloudfront:CreateInvalidation` の `Resource: "*"` を限定。server に**予約同時実行の上限**を設定 |
| **R-8** | **配信まわりの小改善** | IPv6 有効化 / **Origin Shield**（画像は Cache Writes > Reads でヒット率が低い）/ CustomErrorResponses でブランドされたエラーページ / **CF の ReadTimeout を Lambda より長く** / ACM 後に TLSv1.2_2021 / **HTTP/3**（R-3 を採らないので排他は解消。`transform.cdn` で設定。実測では **Vercel も HTTP/3 を広告していない**ため、パリティ回復ではなく**上積み**になる。効果を測れるよう **R-2 の RUM を先に**入れるのが順当） |
| **R-9** | **アカウントのガバナンス** | **費用ゼロで今すぐ**: IAM Access Analyzer・パスワードポリシー。有料: GuardDuty / Config / Security Hub。最終ゴールは静的キー廃止＝ IAM Identity Center 化（15 と同方向） |
| **R-10** | **掃除** | Amplify（＝12 の前提でもある）/ 不要 IAM ロール4本 / 空バケット `siko-coffee` / 孤児 ACM 検証 CNAME 2本 / `/aws/amplify/*` ロググループ（保持期間**無期限**） |

> ❌ **R-3（CloudFront 継続的デプロイ）は不採用を推奨する。**
> 当初は「即時ロールバックの劣化を埋める機構」と評価したが、AWS 公式の
> quotas/considerations と SST のドキュメントで裏を取ったところ**過大評価だった**。
> - 🔴 **staging へ流せるのは最大 15%**（重み付け時）＝ **切り戻しスイッチではなくカナリア**。
>   100% を戻す用途には使えない。
> - 🔴 **WAF と衝突する。** 継続的デプロイが有効だと web ACL の**初回の関連付けができず、
>   関連付け解除もできない**。行うには継続的デプロイポリシーの削除（＝staging も消える）が要る。
>   **作業 6（WAF）と真正面から競合する。**
> - 🔴 **非決定的。** CloudFront **サービス全体**の繁忙時は、ポリシーに関係なく全リクエストが primary へ行く。
> - 🔴 **SST の Nextjs コンポーネントが非対応**（`transform.cdn` にも該当プロパティ無し）＝
>   Pulumi 管理の外での手作業になる。
> - OAC 利用時は staging 用に S3 バケットポリシーの追加が要る。
>
> **ロールバックの実際の答えは 14（soak 中は Vercel を main 自動デプロイのまま生かす）**
> ＋ **R-4 の Route53 ヘルスチェック／フェイルオーバー**である。TTL を 60s（作業 11）に
> 下げてあれば切り戻しは1分台で済む。
> ⚠️ ただし**この手段は 15（Vercel 解約）で失われる**。解約までに R-4 の canary とアラームで
> 「壊れたことに早く気づく」体制へ移行しておくこと。
>
> 📌 **これにより「R-3 と HTTP/3 が排他」というトレードオフは消滅する。** 両者は独立に判断してよい。

---

## 現状の AWS アカウント棚卸し（2026-07-26 実測）

アカウント `654512230021` / 主リージョン `ap-northeast-1`。

### 稼働中のリソース

| 種別 | 実体 |
|---|---|
| DynamoDB | 32テーブル（本番 `siko-coffee-*` 16 + プレビュー `siko-coffee-preview-*` 16）。全て PAY_PER_REQUEST |
| S3 | `siko-coffee`（パブリックアクセスブロック 4項目すべて有効・SSE 有効） |
| SES | `sikocoffee.com` / `siko.is.coffee@gmail.com` 検証済 |
| Route 53 | ホストゾーン `sikocoffee.com` |
| Lambda / EC2 / RDS / CloudFront | **無し**（移行先はまっさらな状態） |
| Budgets | "My Zero-Spend Budget" $10 |
| 当月コスト | 実質 $0（端数のみ） |

### 🔴 セキュリティ上の指摘

| # | 指摘 | 深刻度 |
|---|---|---|
| 1 | IAM ユーザー `shun` は `administrator` グループ経由で **AdministratorAccess**。そのアクセスキーが Vercel の環境変数に置かれている＝**Vercel に預けた鍵がアカウント全権限を持つ**。漏洩時の影響範囲は全 AWS リソース | **高** |
| 2 | ~~アクセスキーが**2本ともActive**。`AKIA...DLMC` は 2026-05-18 以降未使用~~ → **✅ 対応済 2026-07-26**（無効化→本番疎通確認→削除。残るは本番稼働中の `AKIA...ZCYG` のみ） | ~~中~~ |
| 3 | ~~**CloudTrail のトレイルが1本も無い**~~ → **✅ 対応済 2026-07-26**（下記参照） | ~~中~~ |
| 4 | ~~**DynamoDB の PITR が無効**。削除保護も `false`~~ → **✅ 対応済 2026-07-26**（本番16テーブル全てで有効化。下記参照） | ~~中~~ |
| 5 | GuardDuty 無効 | 低 |

**良好な点**: ルートアカウント MFA 有効 / `shun` も MFA 有効 / S3 パブリックアクセス全ブロック + 暗号化有効 / RDS・EC2 の課金残骸なし。

### 旧構成の残骸（移行前に整理対象）

Amplify アプリ `siko-coffee`（`d3059a6gcvih7x`）、`AmplifyServiceRole`、`AWSServiceRoleForRDS`、`rds-monitoring-role`、`siko-coffee-lambda-role`、`http-function-url-tutorial-test-siko-role-*`。実体（RDS/EC2）は既に無いため課金影響はほぼ無いが、IAM ロールは整理しておくと移行後の見通しが良くなる。

> 🔴 **訂正（2026-07-28）: Amplify アプリは残骸ではなく稼働中だった。**
> ブランチ `main` の `enableAutoBuild` が有効で、調査当日もビルドが成功している（通算122ジョブ）。
> ブランチの既定ドメインは 200 を返し**サイトの完全な公開コピーが動いている**。
> さらに **`sikocoffee.com` の domain association が `AVAILABLE`**。
> ＝ 単なる整理対象ではなく、**作業 12 の前提として削除が必要**。詳細は「AWS 側 実地調査」を参照。

### 推奨対応順

1. ~~未使用アクセスキー `AKIA...DLMC` を削除~~ → **✅ 完了 2026-07-26**
2. ~~CloudTrail を有効化~~ → **✅ 完了 2026-07-26**
3. ~~DynamoDB PITR + 削除保護を有効化~~ → **✅ 完了 2026-07-26**
4. 移行完了後、**Vercel 用アクセスキーを削除し Lambda 実行ロールへ移行**（項目12） ← 移行のゴール
5. 旧構成の IAM ロール・Amplify アプリを整理

### DynamoDB データ保護（2026-07-26 実施）

本番 16 テーブル**すべて**で PITR（ポイントインタイムリカバリ）と削除保護を有効化した。実施前は 16/16 が両方とも無効。

対象: `auth` `beans` `blends` `config` `expenses` `feedback` `inventory` `lots` `orders` `pos` `products` `reservations` `roaster-metrics` `roasters` `sales` `subscriptions`（すべて `siko-coffee-` プレフィックス）

**守っている実データ**（実施時点の概算件数）: `expenses` 124 / `config` 26 / `sales` 14 / `products` 8 / `auth` 7。いずれも失うと復元不能な業務データで、PITR 無効は理論上ではなく実質的なリスクだった。

| 項目 | 内容 |
|---|---|
| PITR | 過去 **35 日間**の任意の秒に復元可能（AWS 既定） |
| 削除保護 | `DeleteTable` を API/コンソールから拒否。解除は明示的な `update-table --no-deletion-protection-enabled` が必要 |
| コスト | 本番16テーブルの合計サイズは **36.5 KB**。PITR は約 $0.20/GB-月なので **実質 $0** |

**プレビュー用テーブル（`siko-coffee-preview-*` 16個）は意図的に対象外**。データは使い捨てであり、削除保護を付けると移行作業中の作り直し・撤去の妨げになるため。

確認コマンド:

```
aws dynamodb describe-continuous-backups --table-name siko-coffee-orders --region ap-northeast-1
```

### CloudTrail 構成（2026-07-26 構築）

| 項目 | 値 |
|---|---|
| トレイル名 | `siko-coffee-trail`（ホーム `ap-northeast-1`） |
| 範囲 | **全リージョン**（`IsMultiRegionTrail=true`）＋グローバルサービスイベント含む |
| 管理イベント | 読み取り・書き込み**両方**（`ReadWriteType=All`） |
| 改ざん検知 | **有効**（`LogFileValidationEnabled=true`。Digest ファイルで後から改ざん検証可能） |
| ログ保存先 | S3 `siko-coffee-cloudtrail-654512230021`（`ap-northeast-1`） |
| バケット保護 | パブリックアクセス4項目すべてブロック / SSE-S3（AES256, Bucket Key 有効） / HTTP アクセスを Deny |
| バケットポリシー | CloudTrail サービスプリンシパルに `aws:SourceArn` 条件付きで限定許可（Confused Deputy 対策） |
| ライフサイクル | 365日で自動削除、未完了マルチパートは7日で中止 |
| コスト | 管理イベントの1本目のトレイルは**無料**。S3 保存料のみ（この規模では月数円） |

確認コマンド:

```
aws cloudtrail get-trail-status --name siko-coffee-trail --region ap-northeast-1
```

**移行作業との関係**: これ以降の AWS 操作（SST デプロイ、IAM ロール作成、WAF 設定など）がすべて監査ログに残る。学習中に「何をどう変えたか」を後から追える。

---

## Claude Code ↔ AWS 連携（2026-07-26 設定）

### 設定済み

- **AWS CLI の読み取り専用コマンド 58 件を許可リスト化** — `.claude/settings.local.json`（メインリポジトリと本 worktree の両方）。`describe-*` / `list-*` / `get-*` 系のみを列挙し、`secretsmanager get-secret-value` や `ssm get-parameter` など**秘密情報を露出するコマンドは意図的に除外**（都度承認になる）。
- **`.mcp.json` に AWS 公式 MCP サーバー 4種を定義** — `aws-api`（`READ_OPERATIONS_ONLY=true` / `REQUIRE_MUTATION_CONSENT=true`）、`aws-docs`、`aws-pricing`、`aws-iac`。リージョンは `ap-northeast-1`、プロファイルは `default`。

### 有効化に必要な作業

MCP サーバーは `uvx` で起動するが、**現在このマシンに `uv` が入っていない**。以下を実行してから Claude Code を再起動すると 4 サーバーが立ち上がる。

```
brew install uv
```

### 連携の使い分け

| 用途 | 手段 |
|---|---|
| リソースの確認・調査 | Bash の `aws` CLI（許可リスト済みでプロンプトなし） |
| AWS ドキュメント検索 | `aws-docs` MCP |
| 移行コストの試算 | `aws-pricing` MCP |
| CloudFormation/CDK の生成・検証 | `aws-iac` MCP |
| SST デプロイ | Bash（`npx sst deploy` 等） |

## メモ

- 本ドキュメントは 2026-07-26 時点の実測。OpenNext のバージョンと peer range は着手時に再確認すること（`npm view @opennextjs/aws@latest peerDependencies`）。
- CSP の `unsafe-inline` 問題は**ホスティング先に依存しない**（Next.js フレームワーク由来）。移行しても解決しない。詳細は [csp-nonce-migration-plan.md](./csp-nonce-migration-plan.md)。
- 関連: `docs/blend-platform-plan.md`（在庫解放 cron の即時化はこの計画の実装品質に直結する）
