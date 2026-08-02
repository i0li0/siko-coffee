# Pour Over 積み残し一覧

**Pour Over が終わったときに何が残るのか**を1か所で見るための文書。

これまで積み残しは「計画（`aws-migration-feasibility.md`）」「実施ログ（`pour-over-log.md`）」
「当日手順（`pour-over-13-runbook.md`）」「`sst.config.ts` の索引」に分散しており、
**全体で何本残っているのかを言える場所が無かった**。本文書がその役目を持つ。

## 使い方

- **正本ではない。** 各項目の詳細はリンク先が正本で、ここは**索引と現況**。
- **状態は実測で書く。** 「〜のはず」を書かない。各項目に**確認コマンド**を付けてあるので、
  読む前に叩き直せる（📌 このプロジェクトの原則「状態は書いた場所の数だけ古くなる」）。
- **最終実測日: 2026-08-02**（13 の 2・3 完了直後）。

## 全体像

| 群 | 本数 | 説明 |
|---|---|---|
| **A. Pour Over 本編の残り** | **9** | 21タスクのうち未完のもの。これが終われば Pour Over は完了 |
| **B. 意図的に見送った技術判断** | 4 | やらないと決めたのではなく、**判断材料が揃うまで待っている**もの |
| **C. Pour Over が生んだ小さな負債** | 3 | 移行の過程で生まれ、まだ回収していないもの |
| **D. 推奨タスク（R-1〜R-10）** | 9 | コスト非制約の前提で挙がった改善。R-3 は不採用確定 |
| **E. スコープ外と明記したもの** | 5 | **Pour Over と混ぜないと決めた**もの。完了後に着手する |

---

## A. Pour Over 本編の残り（9本）

進捗 **17/21**。13 は 2・3 が完了し、**4（DNS 切替）だけ**が残っている。

| # | 内容 | いつ | 状態（2026-08-02 実測） |
|---|---|---|---|
| **13-4** | **DNS 切替**（Route53 の UPSERT） | ⏳ **2026-08-02 17:50 UTC 以降**（依存 F） | 唯一の時刻の門。手作業の前提はゼロ（TOTP 完了済み） |
| 5-1 | 3-a〜3-h を**実 DNS で**やり直す | 切替直後 | — |
| 5-2 | **4 の②③回収** — Vercel に `AVATAR_UPLOAD_BUCKET` / `AVATAR_BUCKET` / `AVATAR_BASE_URL` ＋ IAM に S3 権限 | 切替後 | 🔴 **未着手を実測確認**＝ Vercel 本番 env に `AVATAR_*` は**1本も無い**。**本番のアイコン設定は今も 503** |
| 5-3 | `CRON_STAGES` に `'production'` を足して再デプロイ | 🔴 切替の**あと** | 現在 `['dev']`。先にやると `instagram-refresh` が Vercel と二重に走り**長期トークンの更新が競合**する |
| 5-4 | `ci.yml` の `matrix.stage` に `production` | 切替後**速やかに** | 現在 `[dev]`。🔴 **これをやるまで production は main から取り残される**（→ runbook §3-2） |
| 5-6 | Instagram トークンの確認 | 2026-09-02 | `refreshedAt` = **2026-08-01T00:21:11Z**＝失効 **2026-09-30**・次の更新機会 9/1 |
| **14** | **soak 期間**（Vercel を生かしたまま観測） | 切替後 | Vercel の設定に一切触らない＝ロールバック先を最新に保つ |
| **15** | **Vercel 解約 ＋ 決済再開** | soak の後 | ①Stripe 新キー →②`PAYMENTS_ENABLED=true` →③再デプロイ の順厳守 |
| **16** | **Vercel 依存の撤去（①〜⑧）** | 15 の後 | 🔴 `vercel.json` だけ消すと **build が全環境で落ちる**（`prebuild` → `check-cron-schedule.mjs`）。📌 計画の表は長く「①〜⑦」と書いていたが**本文には⑧まである**（本作業で訂正） |

```bash
# A の現況をまとめて確認する
grep -n "const CRON_STAGES\|const WAF_STAGES" sst.config.ts
grep -n "stage: \[" .github/workflows/ci.yml
vercel env ls production --scope team_Evt7nWh10Bz1hbN6Sg75LsOt --project prj_BDqrRMJfhzlF5vrVEtbDK3UK1Vnv | grep AVATAR
aws dynamodb get-item --table-name siko-coffee-config --region ap-northeast-1 \
  --key '{"configKey":{"S":"INSTAGRAM_ACCESS_TOKEN"}}' --query 'Item.refreshedAt.S' --output text
```

### 16 の撤去リスト（①〜⑦）

①`redirects()` ②`vercel.json` ③`check-cron-schedule.mjs` + `prebuild` + `check:cron`
④CI の該当ステップ ⑤`hostRedirects.test.ts` ⑥`src/lib/stage.ts` の `?? VERCEL_ENV`（+ `stage.test.ts` の該当ケース）
⑦`isVercelPlatform()` と `layout.tsx` の呼び出し＋`@vercel/analytics`/`@vercel/speed-insights` の依存
⑧`src/lib/cronAuth.ts` の `Authorization: Bearer` 形式の受け入れ

📌 ⑥⑦とも `stage.ts` に集めてあるので、撤去の起点は `grep -rn VERCEL src/` でよい。

---

## B. 意図的に見送った技術判断（4本）

**やらないと決めたのではなく、判断材料が揃うのを待っている。** 待ち条件を明記する。

| # | 内容 | 見送った理由 | いつ再検討できるか |
|---|---|---|---|
| B-1 | **arm64 への統一** | 7 で「1デプロイで2変数を動かすと、速くなった原因を切り分けられない」ため | **いつでも**。7 の実測（コールド p50 1,068ms）が基準値として使える |
| B-2 | **warmer（`warm` プロパティ）の有効化** | 「dev のコールド率は巡回トラフィック主体の dev 固有の値で、本番の実際のコールド率は分からない」ため | 🔑 **14（soak）で本番のコールド率が測れるようになる**＝ここが待ち条件 |
| B-3 | **`server.timeout` を 30秒より伸ばす** | cron の実行予算に効くが、8 のスコープ外 | いつでも。CloudFront 経由の web は CF 側で切れるので挙動は変わらない |
| B-4 | **geo ルールが国外を実際に deny するかの確認** | **日本からは原理的に確認できない** | 海外からアクセスできる機会。現状は「日本では撃たない」（負の対照）までを実測済み |

**B-1 の現況（2026-08-02 実測・production）**:

| 関数 | Arch | Memory | Timeout |
|---|---|---|---|
| `WebServerApnortheast1Function` | **x86_64** | 2048 | 30 |
| `WebImageOptimizerFunction` | **arm64** | 1536 | 25 |
| `CronRelayFunction` | x86_64 | 256 | 40 |
| `AlarmRelayFunction` | x86_64 | 128 | 30 |
| `WebRevalidationSeederFunction` | x86_64 | 128 | 900 |

```bash
for f in $(aws lambda list-functions --region ap-northeast-1 \
  --query "Functions[?contains(FunctionName,'production')].FunctionName" --output text); do
  printf "%-62s " "$f"
  aws lambda get-function-configuration --function-name "$f" --region ap-northeast-1 \
    --query '[Architectures[0],MemorySize,Timeout]' --output text
done
```

---

## C. Pour Over が生んだ小さな負債（3本）

移行の過程で生まれ、まだ回収していないもの。いずれも**実測で現存を確認済み**。

| # | 内容 | 影響 | 確認 |
|---|---|---|---|
| C-1 | **`src/instrumentation-client.ts` に `environment` が無い** | **クライアントだけステージ未タグ**のまま Sentry に送られる。1（`VERCEL_ENV`→`STAGE`）で server と edge は揃えたが、client は `NEXT_PUBLIC_*` が要るため別タスクにした | `grep -n "environment" src/instrumentation-client.ts` が空 |
| C-2 | **`sentry.edge.config.ts` の `tracesSampleRate: 1`** | 全ステージ **100% サンプリング**。トラフィックが増えると Sentry のクォータを食う | `grep -n "tracesSampleRate" sentry.edge.config.ts` |
| C-3 | **`BLOB_READ_WRITE_TOKEN` が Vercel 本番 env に残存** | **死んだ env**。4 で S3 へ移したのでコードは `@vercel/blob` を一切参照していない（grep 0件）。実害は無いが、16 の掃除対象 | `grep -rn "BLOB_READ_WRITE_TOKEN\|@vercel/blob" src/ package.json` が空 |

---

## D. 推奨タスク R-1〜R-10（9本・R-3 は不採用確定）

`aws-migration-feasibility.md`「推奨タスク」が正本。**コスト非制約の前提**で挙がったもので、
Pour Over の完了条件ではない。**実測で状態が分かるものは下に書いた。**

| # | 内容 | 現況（2026-08-02 実測） |
|---|---|---|
| R-1 | **CloudFront Response Headers Policy** | パリティ退行の直接の対処。静的ヘッダを配信層へ寄せる |
| R-2 | **CloudWatch RUM** | 🔑 **切替で Speed Insights を失う**＝これがその代替。失う前の基準値は**デスクトップの RES 97 / LCP 2.66s のみ**（モバイルは元からデータ無し） |
| ~~R-3~~ | ~~CloudFront 継続的デプロイ~~ | **❌ 不採用確定**。切り戻しは DNS を戻すだけで足りる（11 の 60s TTL で回収済み） |
| R-4 | 観測の土台（CloudFront standard logging v2 / DLQ / Synthetics canary） | SNS トピックは 10 で作成済み |
| R-5 | **SES を運用できる状態にする**（SPF・DMARC・MX・custom MAIL FROM・configuration set） | 🔴 **バウンス/苦情が誰にも届かない**状態。**実測: SPF・DMARC・MX とも未設定**（`dig` で3件とも空）／DKIM 3本のみ設定済み。10 で SES の `Reputation.*` アラーム2本は production に入ったので、**評判の悪化は鳴るが個別のバウンスは追えない** |
| R-6 | コールドスタート対策（＝ B-2 の warmer） | B-2 と同一。soak 待ち |
| R-7 | 実行ロールと同時実行を絞る | `ses:*` と `cloudfront:CreateInvalidation` の `Resource: "*"` を限定 |
| R-8 | 配信まわりの小改善 | **実測: IPv6 = `false` / `CustomErrorResponses` = 0件 / HTTP version = `http2`**（http3 でない）。Origin Shield も未設定 |
| R-9 | アカウントのガバナンス | 🟢 **無料で今すぐできる2件が未設定**: **IAM パスワードポリシー無し**（`NoSuchEntity`）／**Access Analyzer 0件**。有料は GuardDuty / Config / Security Hub |
| R-10 | 掃除 | 下記 |

### R-10 の掃除リスト（実測済み）

| 対象 | 状態 |
|---|---|
| Amplify（app / association） | ✅ **0-c で削除済み** |
| 孤児 ACM 検証 CNAME 2本 | ✅ **削除済み**（Route53 に残る CNAME は ACM 検証 `_c84c…` 1本・DKIM 3本・`www` のみ） |
| 空バケット `siko-coffee` | 🔴 **残存・中身は空** |
| `/aws/amplify/*` ロググループ | 🔴 **残存**（`/aws/amplify/d3059a6gcvih7x`） |
| 不要 IAM ロール | ⚠️ **要確認**。候補は `http-function-url-tutorial-test-siko-role-*` / `rds-monitoring-role` / `siko-coffee-lambda-role` / `AWSServiceRoleForRDS`。**使用中でないことを確かめてから消す**（SST 管理下の `siko-coffee-{dev,production}-*` には触らない） |

🔴 **`_c84c530444dc328407ddf8a6cf46916b.sikocoffee.com` は消さないこと**（ワイルドカード証明書の更新に使用中）。

```bash
aws s3 ls s3://siko-coffee --recursive                      # 空バケット
aws logs describe-log-groups --log-group-name-prefix /aws/amplify --region ap-northeast-1
aws iam get-account-password-policy                          # NoSuchEntity なら未設定
aws accessanalyzer list-analyzers --region ap-northeast-1
aws cloudfront get-distribution-config --id <production の Id> \
  --query 'DistributionConfig.{CustomErrors:CustomErrorResponses.Quantity,IPv6:IsIPV6Enabled}'
```

---

## E. スコープ外と明記したもの（5本）

🔑 **Pour Over と同時にやると切り分けが困難になる**ため分離した。**完了後に着手する。**
ここに挙がっているものを「ついでに」直さないこと。

| # | 内容 | 備考 |
|---|---|---|
| E-1 | **`middleware` → `proxy` のリネーム**（Next 16 の非推奨対応） | ⚠️ **ビルドのたびに警告が出ている**（`The "middleware" file convention is deprecated`）。16 の撤去と同じファイル群を触るので**順序に注意** |
| E-2 | `/admin/monthly` のリンク切れ | 管理画面サイドバーに実体の無いリンク |
| E-3 | **security-backlog 4件** | ①middleware の失効チェック ②パスキー ID 露出 ③Stripe webhook の文言 ④Honeytoken 導入。いずれも低リスク・対応任意 |
| E-4 | ブレンド共創プラットフォーム（機能開発） | E2E とサブスクは**決済再開待ち**＝ 15 に依存 |
| E-5 | 商品詳細ページの二重実装 | 公開サイト IA 監査（2026-07-11）で検出・未着手 |

---

## 依存関係（積み残しどうし）

```
13-4（DNS 切替）
  ├→ 5-1（実 DNS で再検証）
  ├→ 5-2（AVATAR_* 回収）……… 本番のアイコン設定 503 の解消
  ├→ 5-3（cron 有効化）……… 先にやると Instagram トークンが競合
  ├→ 5-4（matrix に production）… やるまで production が main から取り残される
  └→ 14（soak）
       ├→ B-2 / R-6（warmer）… 本番のコールド率が測れるようになる
       └→ 15（Vercel 解約＋決済再開）
            ├→ 16（Vercel 依存の撤去 ①〜⑧）
            │    └→ E-1（middleware→proxy）… 同じファイル群
            └→ E-4（ブレンド PF の E2E・サブスク）… 決済再開が前提
```

**待ち条件を持たないもの**（いつでも着手できる）: B-1・B-3・C-1・C-2・R-1・R-5・R-7・R-8・R-9・R-10・E-2・E-3・E-5

---

関連: [`aws-migration-feasibility.md`](aws-migration-feasibility.md)（計画・正本） /
[`pour-over-log.md`](pour-over-log.md)（実施ログと教訓） /
[`pour-over-13-runbook.md`](pour-over-13-runbook.md)（切替当日の手順）
