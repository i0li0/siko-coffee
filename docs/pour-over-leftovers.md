# Pour Over 積み残し一覧

**Pour Over が終わったときに何が残るのか**を1か所で見るための文書。

これまで積み残しは「計画（`aws-migration-feasibility.md`）」「実施ログ（`pour-over-log.md`）」
「当日手順（`pour-over-13-runbook.md`）」「`sst.config.ts` の索引」に分散しており、
**全体で何本残っているのかを言える場所が無かった**。本文書がその役目を持つ。

## 使い方

- **正本ではない。** 各項目の詳細はリンク先が正本で、ここは**索引と現況**。
- **状態は実測で書く。** 「〜のはず」を書かない。各項目に**確認コマンド**を付けてあるので、
  読む前に叩き直せる（📌 このプロジェクトの原則「状態は書いた場所の数だけ古くなる」）。
- 🔴 **「状態」を測るときは、同時に「履歴」も測る**（教訓42）。自動復旧する対象は
  1回の `describe-*` では何も分からない。2026-08-02 に、アラームが3回鳴って戻ったのを
  「今すべて OK」と読んで見逃した。
- 🔴 **列挙は必ず全リージョンで回す**（教訓43）。**CloudFront 系のアラームは us-east-1**。
  `--region ap-northeast-1` だけで数えた「6本」は母集団が欠けていた。
- **最終実測日: 2026-08-03**（14 = soak 初日。切替の約21時間後）。

## 全体像

| 群 | 本数 | 説明 |
|---|---|---|
| **A. Pour Over 本編の残り** | **6** | 21タスクのうち未完のもの。これが終われば Pour Over は完了 |
| **B. 意図的に見送った技術判断** | 4 | やらないと決めたのではなく、**判断材料が揃うまで待っている**もの |
| **C. Pour Over が生んだ小さな負債** | **2**（元3・C-1 完了） | 移行の過程で生まれ、まだ回収していないもの |
| **D. 推奨タスク（R-1〜R-10）** | 9 | コスト非制約の前提で挙がった改善。R-3 は不採用確定 |
| **E. スコープ外と明記したもの** | 5 | **Pour Over と混ぜないと決めた**もの。完了後に着手する |

---

## A. Pour Over 本編の残り（6本）

進捗 **18/21**。✅ **13 は完了＝本番トラフィックは AWS（CloudFront）で稼働中**
（切替 `2026-08-02T19:39:15Z`）。ここからは soak と後始末。

| # | 内容 | いつ | 状態（2026-08-02 実測） |
|---|---|---|---|
| ~~**13-4**~~ | ~~**DNS 切替**~~ | — | ✅ **完了**（`2026-08-02T19:39:15Z`）。🔴 www は **UPSERT では通らず `DELETE`＋`CREATE`** が要った（教訓40） |
| ~~5-1~~ | ~~3-a〜3-h を実 DNS でやり直す~~ | — | ✅ **完了・全項目合格**（`x-amz-cf-pop: KIX56-P4` で AWS 配信を直接確認） |
| ~~5-2~~ | ~~**4 の②③回収**~~ | — | ✅ **完了（2026-08-02）。ただし前提が2つとも変わっていた**（下記） |
| 5-3 | `CRON_STAGES` に `'production'` ＋ **Vercel の発火窓の外へずらす** | 5-4 の**あと**（単独で） | ⏳ **PR #135**。🔴 計画の「切替後なら安全」は誤りだった（下記） |
| 5-4 | `ci.yml` の `matrix.stage` に `production` | 切替後**速やかに** | ✅ **本 PR で実施**＝ `[dev, production]`。🔴 **ここから main への push は本番に入る** |
| 5-6 | Instagram トークンの確認 | 2026-09-02 | `refreshedAt` = **2026-08-01T00:21:11Z**＝失効 **2026-09-30**・次の更新機会 9/1。🔴 **5-3 が済むまで頼りは Vercel の月次1本**（production の cron は DISABLED） |
| **14** | **soak 期間**（Vercel を生かしたまま観測） | 切替後 | ⏳ **進行中。初日（2026-08-03）の実測は異常ゼロ**（アラーム遷移は 08-02T22:36Z 以降なし・5xx ゼロ・cron 109回連続 200）。🔴 **`cleanup-pending` と `po-timeouts` は production でまだ一度も走っていない**（5-3 の有効化が日次20:00/20:20 UTC を過ぎた後だった）＝ **初回は 2026-08-03T20:00Z / 20:20Z**。Vercel の設定には一切触らない |
| **15** | **Vercel 解約 ＋ 決済再開** | soak の後 | ①Stripe 新キー →②`PAYMENTS_ENABLED=true` →③再デプロイ の順厳守。🔴 **IAM アクセスキー `AKIAZQY7YB2C3BYMZCYG`（`shun` / AdministratorAccess）の削除を必ず含める**＝解約しても AWS 側に残る |
| **16** | **Vercel 依存の撤去（①〜⑧）** | 15 の後 | 🔴 `vercel.json` だけ消すと **build が全環境で落ちる**（`prebuild` → `check-cron-schedule.mjs`）。📌 計画の表は長く「①〜⑦」と書いていたが**本文には⑧まである**（本作業で訂正） |

### 🔴 5-2 の前提は2つとも変わっていた（2026-08-02 に実測して判明）

計画は「Vercel に `AVATAR_*` 3本を投入し、Vercel の IAM ユーザーに S3 権限を追加する。
**それまで本番のアイコン設定は 503**」と書いていた。**どちらも今は成り立たない。**

- 🟢 **③（IAM に S3 権限）は最初から満たされていた。** Vercel が使う AWS キー
  `AKIAZQY7YB2C3BYMZCYG` は IAM ユーザー **`shun`**（グループ `administrator`
  ＝ **`AdministratorAccess`**）のもの。最終使用が **2026-08-02T20:02:00Z / dynamodb /
  ap-northeast-1** ＝ これが Vercel の実行時キーであることの実測。S3 も Rekognition も既に通る。
  **IAM の変更は不要だった。**
- 🟢 **「本番のアイコンが 503」は DNS 切替そのもので解消した。** 503 を返すのは
  `isAvatarStorageConfigured()`（`AVATAR_UPLOAD_BUCKET` と `AVATAR_BUCKET` の有無）で、
  **AWS の production Lambda には SST が3本とも注入済み**（実測）。本番を担うのが
  Vercel から AWS に移った時点で条件が消えている。
  → **今 Vercel に入れる意味は「ロールバック時のパリティ」**に変わった（soak 中に切り戻したら
  Vercel 側でアップロードが壊れる、を防ぐ）。**目的が変わったので優先度も変わる。**

🔑 **積み残しは「やること」だけでなく「なぜ要るか」を持たないと腐る。**
この2件は、理由のほうが先に消えていたのに作業だけが残っていた。

⚠️ **投入した値は検証できない。** Vercel 本番 env は **`sensitive` 型**なので
`vercel env pull` はリテラル `[SENSITIVE]` を書く（3本とも `len=11`）。
＝ **投入されたことは確認できたが、値が正しいかは Vercel 側からは分からない。**
実際に確かめられるのは **Vercel へデプロイして動かしたとき＝切り戻したとき**だけ。
📌 投入値は AWS の production Lambda の env から読んだもの（＝ SST が生成した実測値）:
`siko-coffee-production-avataruploadsbucket-baruzmbz` /
`siko-coffee-production-avatarsbucket-mrvrrdnf` / `https://d1hd0wz5s5nlam.cloudfront.net`

### 🔴 新しく見つかった負債: Vercel が **AdministratorAccess の静的キー**を持っている

上の調査で判明。**`R-7`（実行ロールを絞る）と同じ問題が Vercel 側にもある**が、
こちらは**静的キー**なので失効しない分だけ悪い。**15（Vercel 解約）の作業に
「このアクセスキーを削除する」を必ず含めること**（解約してもキーは AWS 側に残る）。
📌 アカウントにルートのアクセスキーは無い（`AccountAccessKeysPresent = 0`）。

```bash
aws iam get-access-key-last-used --access-key-id AKIAZQY7YB2C3BYMZCYG
aws iam list-groups-for-user --user-name shun
```

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
🔴 **⑥は2か所ある**: `stage.ts`（実行時）と **`next.config.ts` の `env.NEXT_PUBLIC_STAGE`（ビルド時・C-1 で追加）**。
式が同じなので `grep -rn VERCEL src/` だけでは **`next.config.ts` が漏れる**（`src/` の外）
⑦`isVercelPlatform()` と `layout.tsx` の呼び出し＋`@vercel/analytics`/`@vercel/speed-insights` の依存
⑧`src/lib/cronAuth.ts` の `Authorization: Bearer` 形式の受け入れ

📌 ⑥⑦とも `stage.ts` に集めてあるので、撤去の起点は `grep -rn VERCEL src/` でよい。

---

## B. 意図的に見送った技術判断（4本）

**やらないと決めたのではなく、判断材料が揃うのを待っている。** 待ち条件を明記する。

| # | 内容 | 見送った理由 | いつ再検討できるか |
|---|---|---|---|
| B-1 | **arm64 への統一** | 7 で「1デプロイで2変数を動かすと、速くなった原因を切り分けられない」ため | **いつでも**。7 の実測（コールド p50 1,068ms）が基準値として使える |
| B-2 | **warmer（`warm` プロパティ）の有効化** | 「dev のコールド率は巡回トラフィック主体の dev 固有の値で、本番の実際のコールド率は分からない」ため | ✅ **待ち条件は満たされた（2026-08-03 実測）＝ 本番のコールド率 55.2%**（248 invocations/24h・コールド p50 1,157ms / ウォーム p50 124ms）。**dev の 3.2% とは桁が違う**（1,050 req のうち Lambda に届くのは 248＝CloudFront が76%吸う）。🔴 **あとはコストの判断だけ**＝ 実ユーザーはほぼ必ずコールドを踏むが、この 248 の大半はスキャナ |
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

## C. Pour Over が生んだ小さな負債（残り2本・元3本）

移行の過程で生まれ、まだ回収していないもの。いずれも**実測で現存を確認済み**。

| # | 内容 | 影響 | 確認 |
|---|---|---|---|
| ~~C-1~~ | ~~**`src/instrumentation-client.ts` に `environment` が無い**~~ | ✅ **完了（2026-08-03）**。`next.config.ts` の `env` が **ビルド時に `STAGE ?? VERCEL_ENV` を焼き込み**、`getClientStage()` が読む。**実ビルド3本の成果物で確認**（AWS 経路・Vercel 経路の正の対照＋未設定時が `(void 0)??"development"` の負の対照）。🔴 残るのは**デプロイ後に Sentry のダッシュボードを人が見る**工程 | `grep -n "environment" src/instrumentation-client.ts` |
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
| **R-4** | **観測の土台（CloudFront standard logging v2 / 追加メトリクス / DLQ / Synthetics canary）** | ✅ **standard logging v2 は完了（2026-08-03）**＝ `sst.config.ts` の「診断（R-4）」ブロック。**dev・production の両方**で CloudFront のアクセスログを **CloudWatch Logs**（`siko-<stage>-cloudfront-access-logs`・保持30日）へ配信。**「作れた」で止めず、実際にログが届き 404 を診断フィールド付きで引けるところまで実測した**（下記）。残りは**追加メトリクス**（メトリクスごと課金なので予算と併せて判断）・DLQ・Synthetics canary。<br>🔴 昇格の理由: 2026-08-02 に 5xx が3回スパイクしたが、**ログも内訳メトリクスも無いため原因を特定できないまま終わった**（教訓44）。**検知（10）と診断は別の投資** |
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
# 観測の穴（教訓44）の現況
aws cloudfront get-monitoring-subscription --distribution-id E3FC7N27IY6A73  # まだ未設定（追加メトリクス）

# ✅ standard logging v2 は入れて、**届くところまで実測した**（2026-08-03）
aws logs describe-log-streams --region us-east-1 \
  --log-group-name siko-production-cloudfront-access-logs --max-items 3
```

**5xx の理由を引く**（`x-edge-detailed-result-type` にそれが入る）。
🔴 **`filter-log-events` の JSON フィルタは使えない。** フィールド名にハイフンが含まれ、
`{ $."sc-status" = 5* }` は **`InvalidParameterException: Invalid character(s) in term '$."'`**
で弾かれる（2026-08-03 に実測）。**Logs Insights でバッククォート**を使うこと:

```bash
LG=siko-production-cloudfront-access-logs
QID=$(aws logs start-query --region us-east-1 --log-group-name $LG \
  --start-time $(( $(date +%s) - 3600 )) --end-time $(date +%s) \
  --query-string 'fields @timestamp, `sc-status`, `x-edge-detailed-result-type`, `x-edge-result-type`, `cs-uri-stem`, `cs(User-Agent)` | filter `sc-status` like /^5/ | sort @timestamp desc | limit 20' \
  --query 'queryId' --output text)
sleep 8 && aws logs get-query-results --region us-east-1 --query-id "$QID"
```

✅ **実測で確認済み（2026-08-03）**: 配信ラグ **約20秒**／ロググループのリソースポリシーは
**自動で付いた**（追加作業なし）／届くのは **33フィールド**で
**`x-edge-detailed-result-type` を含む**（`recordFields` は未指定＝既定の全フィールド）。
負の対照として仕込んだ 404 は `sc-status: 404` /
`x-edge-detailed-result-type: **Error**` として引けた。

📌 レガシーの S3 ログ（`DistributionConfig.Logging`）は**使っていない**（`Enabled: false` のまま）。
v2 とレガシーは併存できるが、二重に払う理由が無い。

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
13-4（DNS 切替）✅ 2026-08-02T19:39:15Z 完了
  ├→ 5-1（実 DNS で再検証）✅ 完了
  ├→ 5-4（matrix に production）✅ 完了 … やるまで production が main から取り残される
  │    └→ 5-3（cron 有効化＋発火窓ずらし）⏳ PR #135 … 🔴 5-4 と分ける
  ├→ 5-2（AVATAR_*）✅ 完了 … 🔴 503 の解消は切替そのものが済ませた＝残る意味は切り戻し時のパリティ
  └→ 14（soak）
       ├→ B-2 / R-6（warmer）… 本番のコールド率が測れるようになる
       └→ 15（Vercel 解約＋決済再開）
            ├→ 16（Vercel 依存の撤去 ①〜⑧）
            │    └→ E-1（middleware→proxy）… 同じファイル群
            └→ E-4（ブレンド PF の E2E・サブスク）… 決済再開が前提
```

**待ち条件を持たないもの**（いつでも着手できる）: B-1・B-3・C-2・R-1・R-5・R-7・R-8・R-9・R-10・E-2・E-3・E-5
（C-1 は 2026-08-03 に完了）

---

関連: [`aws-migration-feasibility.md`](aws-migration-feasibility.md)（計画・正本） /
[`pour-over-log.md`](pour-over-log.md)（実施ログと教訓） /
[`pour-over-13-runbook.md`](pour-over-13-runbook.md)（切替当日の手順）
