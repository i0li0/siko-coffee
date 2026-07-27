# AWS 移行 実現可能性調査 — 全項目の現状パリティ検証

作成日: 2026-07-26 / 目的: **AWS 学習**を動機とした Vercel → AWS 移行で、現状の機能・セキュリティ水準を「同等以上」にできるかを項目別に検証する。

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
| 29 | `VERCEL_ENV` によるテーブル prefix 切替 | 独自 `STAGE` 環境変数へ書換 | ○ | **必須作業**。`src/lib/db.ts:23`、Sentry config 2ファイル、統合テスト 1ファイル |
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

⚠️ **既知のリスク（未検証）**: SST 側に Next 16 関連の未解決 issue が2件ある — [#6894](https://github.com/sst/sst/issues/6894)（CloudFront KeyValueStore が初回デプロイ後に空になり CFF が 503）と [#6867](https://github.com/sst/sst/issues/6867)（Next 16.2.6 で `next/image` のローカル public 画像が壊れる）。**本プロジェクトは `/images/logo/logo_siko8.png` などを `next/image` で使っており #6867 に該当しうる**（当方は 16.2.11 なので修正済みの可能性もある）。初回デプロイ時に真っ先に確認すること。

**Phase 2: 周辺サービスを AWS へ寄せる**
- cron 4本 → EventBridge Scheduler（先に移せる。日次制限から解放される即効メリット）
- Vercel Blob → S3（データ移送）
- WAF 3ルール → AWS WAF で再構築し、log モードで挙動を観測
- `VERCEL_ENV` → `STAGE` への書き換え（4ファイル）

**Phase 3: 本番切替**
- apex 正規化を CloudFront / Route53 側へ移設（地雷1の対処）
- Route 53 はすでに AWS なので、**DNS 切替は容易でロールバックも容易**
- 切替後、CloudWatch でエラー率・レイテンシを監視

**Phase 4: Vercel 解約**

---

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
