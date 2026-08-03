# Pour Over 実施記録

**計画の正本は [aws-migration-feasibility.md](./aws-migration-feasibility.md)。** こちらは
「実際に何をして、何が分かったか」を時系列で残す実行ログ。計画は先の話を、ここは済んだ話を扱う。

目的は2つ。①次に触るとき「なぜこうなっているか」を再調査せずに済ませる
②同じ形の失敗を他の作業でも避けられるよう、教訓を移植可能な形にしておく。

📋 **まだ終わっていないものの一覧は [pour-over-leftovers.md](./pour-over-leftovers.md)。**
ここ（ログ）は済んだ話、あちらは残っている話。**このログに「別タスクとして起票」「見送り」
「未着手」と書いたら、必ず積み残し一覧にも足すこと**（書いた場所が1つだと必ず埋もれる）。

---

## 覚えておくべき定数

作業のたびに調べ直すことになる値。**特に「消してはいけないもの」に注意。**

| | 値 |
|---|---|
| AWS アカウント | `654512230021` / 主リージョン `ap-northeast-1` |
| Route53 ホストゾーン | `Z0281603UIOXAI0M8P8R`（`sikocoffee.com`） |
| **ワイルドカード証明書** | `arn:aws:acm:us-east-1:654512230021:certificate/01195002-424e-44b1-9425-aff38c879765`<br>`sikocoffee.com` + `*.sikocoffee.com` / Issuer: Amazon / **2027-02-11 まで** |
| dev の CloudFront | `https://d3ejmruzea0u7a.cloudfront.net`（ディストリビューション `E2KRJP9NS7XXWC`） |
| dev の AvatarCdn | `https://d22i7l6gqogfbs.cloudfront.net`（`E1PTASTVVV2I6E`・**WAF は付けない**） |
| dev の web ACL（6） | ~~`AdminWaf-a3068a4`~~ **2026-08-02 に削除**（`WAF_STAGES` から `'dev'` を外した）<br>⚠️ **ステージごとに1枚できる**（$8/月）。`WAF_STAGES` で作るステージを絞る。今は `['production']` |
| dev の cron（8） | EventBridge Scheduler 4本 → 中継 Lambda `siko-coffee-dev-CronRelayFunction-*` 1つ<br>⚠️ **production は DISABLED で作られる**。有効化は `CRON_STAGES` に `'production'` を足す＝ **13 の DNS 切替後** |
| デプロイの入口 | **`npm run sst:deploy -- --stage <stage>`**（素の `npx sst deploy` を打たない） |
| CI のデプロイロール（9.5） | `arn:aws:iam::654512230021:role/siko-coffee-github-deploy`<br>信頼するのは **`repo:i0li0/siko-coffee:ref:refs/heads/main` のみ**／権限は `AdministratorAccess`<br>リポジトリ変数 **`AWS_DEPLOY_ROLE_ARN`** に同じ値。作り直しは `scripts/bootstrap-github-oidc.sh`（冪等） |
| CI のデプロイ先 | `.github/workflows/ci.yml` の **`strategy.matrix.stage`** の1か所。今は `['dev']`<br>⚠️ **`'production'` を足すのは 13 の DNS 切替後**（`CRON_STAGES` と同じ理由） |

### 🔴 9.5 以降のデプロイ運用（先に読む）

**main に push すると、CI が必ず AWS へデプロイする。** これで運用の性質が3つ変わった。

1. **マージ順そのものが実害を持つ。** 壊れた状態を直す PR より先に無関係な PR をマージすると、
   その無関係な変更が原因であるかのような赤が出る。2026-08-01 に #116（依存の勧告対応）と
   #117（sharp 修正）が実際にこの構図になった。
   🔴 **両者はファイルが排他でテキスト衝突しないので、Git だけ見ていると順序の必要性に気づけない。**
   「衝突しない＝どちらから入れてもよい」ではない。
2. **PR の CI が緑でも、デプロイできるかは何も分からない。**
   `deploy` ジョブは `push` 限定なので PR ではスキップされる。
   ＝ **「レビューでは緑だったのに main で落ちた」はこの設計では正常**。異常ではない。
3. **`deploy` が赤くても「デプロイされていない」とは限らない。**
   `npm run sst:deploy` は ①検査 →③`sst deploy` →④検証 の順で、**④で落ちても ③は適用済み**。
   赤を見たら**どの段で落ちたか**を必ず見る（実例は 9.5 の初回＝下記）。

### 🔴 消してはいけない DNS レコード

**`_c84c530444dc328407ddf8a6cf46916b.sikocoffee.com`（CNAME）**

上記ワイルドカード証明書の検証レコード。これを消すと ACM の自動更新が止まる。
一度「Amplify 由来の孤児」として削除したが、**ACM の検証トークンはドメイン＋アカウントに対して
決定的**なため、証明書を作り直した際に同じ名前が再利用され、現在は現役になっている。

### 期限のあるもの

| | 期限 | 確認方法 |
|---|---|---|
| Instagram 長期トークン | **2026-09-30 失効**（2026-08-01 の更新に成功して 60 日後退）/ 次の更新機会 **2026-09-01 00:00 UTC** | `siko-coffee-config` の `INSTAGRAM_ACCESS_TOKEN` の `refreshedAt`（Vercel のログは不要）<br>✅ 2026-08-01 実測: `2026-07-01T00:51:23Z` → **`2026-08-01T00:21:11.206Z`**<br>🔴 8 で AWS 側を**週次**にしたが、production のスケジュールは 13 まで DISABLED なので、**13 が 9/1 を跨ぐならその時点でも頼れるのは Vercel の月次だけ** |
| ワイルドカード証明書 | 2027-02-11 | 使用開始後に ACM が自動更新（検証レコードが要る） |

---

## 実施記録

### 2026-07-26 — 下準備

- Phase 0（オンライン決済の停止）完了。取引実績ゼロを Stripe / DynamoDB 両面で裏取りし、
  API の 503 とショップ導線の停止表示の**両方**を本番で実測。
- AWS アカウントの棚卸し。未使用アクセスキー削除・CloudTrail 有効化・
  本番 DynamoDB 16テーブルの PITR と削除保護を有効化。

### 2026-07-27 — Phase 1（dev 環境）

- `sst deploy --stage dev` 成功。**静的 AWS キー無しで DynamoDB に到達できることを実証**
  （移行の最大の目的が技術的に成立することの確認）。
- `next/image` が最適化されていないことを発見（Vercel 4KB ↔ AWS 222KB ＝ 約53倍）。

### 2026-07-28 — next/image の修復と全体再監査

- sharp のクロスビルド問題を解決（#96）。原因は**無言で失敗する3段の重なり**だった。
- Vercel / AWS 双方の実地調査を反映し、実行順を16項目に整理（#97〜#99）。
- **全体再監査**を実施。コード全走査・AWS 実測・SST 4.17.1 のソース読解で全項目を突き合わせ、
  **16 項目から組み替えた**（第0群の新設と 9.5 の追加）。背骨と依存関係に誤りは無かった。
  ⚠️ このとき「20項目」と書いたが、**実数は 21**（第0群 4 ＋ 本編 17）。20 は第0群を足した
  時点の数で、**9.5 を追加した分が合計に反映されていなかった**（2026-07-31 に訂正）。
  番号そのものは正しく、動かしていない。

### 2026-07-28〜29 — 第0群（全4件完了）

| | 内容 | 結果 |
|---|---|---|
| 0-a | デプロイ経路を `scripts/deploy.sh` に一本化 | ①npm 11 検査 ②資格情報の展開 ③`sst deploy` ④画像最適化の検証 を内包。異常系（プロファイル不正）で AWS に触れず停止することも確認 |
| 0-b | CAA に `0 issue "amazon.com"` を追加 | 5件・INSYNC・伝播確認。**試験発行で 12 を止める地雷を発見**（後述）→ ワイルドカード証明書で解決 |
| 0-c | Amplify の削除 | association → app → `AmplifyServiceRole` → 孤児 CNAME 2本。公開コピー停止・本番無傷を各段で確認 |
| 0-d | 予算の見直し | 上限 $10 → **$20** / 通知しきい値 $0.01 → **$12**（通知先は維持） |

**解消した依存**: H（CAA → 12）・I（Amplify 削除 → 12）
**追加した依存**: J（0-a → 全デプロイ）・K（9.5 → 14）・L（Instagram トークン）

### 2026-07-29 — 突き合わせと第1群 1（`VERCEL_ENV` → `STAGE`）

**着手前の突き合わせ**（記録と実環境のズレを潰す）。第0群の4件はすべて AWS 実測で完了を確認:
予算 $20 / 通知 $12・CAA に `amazon.com` あり・Amplify アプリ 0 件・ワイルドカード証明書 `ISSUED`。
記録側が古かったのは**状態表だけ**で、実体は進んでいた。

| ズレていた記録 | 実際 |
|---|---|
| 実行順の表と `sst.config.ts` の索引で **0-d が「⬜ 未」** | 完了（$20 / $12） |
| `sst.config.ts` の索引で **0-b が「⬜」** | 完了（依存 H は解消済み） |
| 「失敗した www 証明書と検証レコードは削除してよい」 | すでに削除済み |
| タスク2「`instagram-refresh` には `catch` が無い」 | `catch` は1つある（`GetCommand` を黙って握り潰す）。裸なのは **`fetch()` の例外と `PutCommand`** |
| 「`sentry.server` と `sentry.edge` が `VERCEL_ENV` を見ている」 | 見ていたのは **`sentry.server` と `sentry.client`**。`sentry.edge` は **`environment` 自体が無かった** |

**実施したこと（タスク1）**: 判定を `src/lib/stage.ts` に集約し、`db.ts` をフェイルクローズに反転。
`sst.config.ts` は `STAGE: $app.stage` を注入して暫定の `VERCEL_ENV: 'preview'` を撤去。
死にコードだった `sentry.client.config.ts` を削除し、`sentry.edge.config.ts` に `environment` を補った。
回帰テスト `src/__tests__/stage.test.ts` を追加（219 テスト green / lint clean）。

### 2026-07-29 — 第1群 2（cron 4ルートの観測性）

**なぜ要るか**: 8（`sst.aws.Cron` への移行）を終えると Vercel のダッシュボードは使えなくなり、
**CloudWatch Logs が唯一の観測手段**になる。着手前の実測どおり、3ルートは `catch` が
**Sentry だけ**で `console.error` が無く、`instagram-refresh` は逆に **Sentry が無い**うえ
`fetch()` の例外と `PutCommand` が裸だった。＝ DSN 未設定やネットワーク遮断で
**失敗が痕跡なく消える**状態だった。

**実施したこと**: 観測を `src/lib/cronLog.ts` に集約し、4ルートすべてを同じ形にした。

| 関数 | 出力 | 用途 |
|---|---|---|
| `cronStart` | `console.log` `[cron] <route> start` | 「実行されたか」を CloudWatch で判定する |
| `cronDone` | `console.log` `... done <ms> {件数}` | **「動いたが 0 件」と「動いていない」を区別する** |
| `cronFail` | `console.error` ＋ `captureException` | 例外 |
| `cronWarn` | `console.warn` ＋ `captureMessage(warning)` | 失敗ではないが黙って進めたくない状態 |
| `cronAlert` | `console.error` ＋ `captureMessage(error)` | 例外は無いが失敗（外部 API が非 200 等） |

Sentry の `tags.route` は既存の値（`cron/...`）をそのまま維持した（変えると既存の検索が外れる）。

**握り潰しを2か所とも開けた**:
- `cleanup-pending` の `DeleteCommand`: `ConditionalCheckFailedException`（＝すでに paid）だけを
  `skipped` として数え、**それ以外（スロットリング等）は報告する**。従来はどちらも同じ `catch {}` で
  消えており、「毎回 `deleted:0`」の理由が分からなくなる形だった。
- `instagram-refresh` の `GetCommand`: 項目なしは例外にならないので、**例外が出ている時点で異常**。
  env var へ退避しつつ `cronWarn` を出す。

**依存 E・L への手当て**: このルートが静かに止まるとトークンは**恒久失効**する。そこで
①失敗地点を `phase`（`token-read` / `refresh` / `persist`）として Sentry の extra に載せ、
②リフレッシュ後の残りが 14 日を切ったら `cronWarn` する、を追加した。
回帰テスト `src/__tests__/cron-observability.test.ts`（16 ケース）は
**「Sentry へ送ったか」ではなく「console にも出たか」を固定する**（235 テスト green / lint clean）。

---

### 2026-07-29 — 第1群 3（Vercel 専用スクリプトの条件化）

**なぜ要るか**: `@vercel/analytics` と `@vercel/speed-insights` が読み込むスクリプトは
**Vercel のインフラが配信する**もので、アプリのビルド成果物には入っていない。
AWS では毎リクエスト 404 を取りに行くだけになる。

**実施したこと**: `src/lib/stage.ts` に `isVercelPlatform()` を追加し、
`src/app/layout.tsx` は Vercel 上でのみ両コンポーネントを描画するようにした。
ステージ判定と同じファイルに置いたのは、**どちらも 16 でまとめて消える一群**だから
（撤去の起点を `grep -rn VERCEL src/` の1回で済ませる）。

**判定に `VERCEL` と `VERCEL_ENV` の両方を見ている理由**: 意味的には `VERCEL` が正しいが、
システム環境変数の注入はプロジェクト設定のトグルに依存するため「必ずある」と言い切れない。
一方 `VERCEL_ENV` は**本番で実際に読めていることが分かっている**（1 で入れた
`getStage()` のフォールバックが機能している）。**外して困るのは Vercel 側**で、
外れると計測が静かに止まり soak 期間の比較材料を失うので、確実にある方を必ず含める。
AWS ではどちらも未設定なので偽陽性は起きない。

**検証**（`next dev` で両方向を実測）:

| 環境変数 | ページの `@vercel/*` 参照 |
|---|---|
| なし（＝ AWS / ローカル相当） | **無し** |
| `VERCEL_ENV=preview` | `@vercel/analytics` `@vercel/speed-insights` とも有り |

📌 **dev では `/_vercel/...script.js` は出ない**（開発モードは別スクリプトを読む）ので、
その文字列の有無で確認しようとすると**変更前でも「消えている」ように見える**。
確認は `@vercel/` のモジュール参照側で行うこと。

回帰テスト `src/__tests__/stage.test.ts` に `isVercelPlatform` の describe を追加（lint / tsc clean）。
⚠️ **`layout.tsx` の描画自体は自動テストで固定していない**。RSC を vitest で描画するには
`next/font` を含む5モジュールのモックが要り、モックの陳腐化のほうが risk が大きいと判断した。

---

### 2026-07-29 — 第1群 4（Vercel Blob → S3）

**なぜ presigned なのか**: 5（`oac-with-edge-signing`）は経路に Lambda@Edge が入るため
**ボディ 1MB 上限**。アバターは 2MB まで許しているので、サーバ経由アップロードのままだと
5 と衝突する。ブラウザから S3 へ直接 PUT すれば大きなボディが CloudFront/Lambda を通らず、
衝突そのものが消える（依存 B）。

**実施したこと**: アップロードを **upload-url → S3 へ直接 PUT → confirm** の3段にした。
S3/Rekognition 側は `src/lib/avatarStorage.ts`、DynamoDB 側は `src/lib/avatarAccount.ts`。

**🔴 バケットを2つに分けた理由（検閲の順序が逆転するため）**:
Blob 版は「Rekognition に通してから `put()`」で、**落ちた画像は保存されない**順序だった。
presigned にすると **PUT が先・検閲が後**になり、confirm を呼ばなければ未検閲物が残る。

| バケット | 公開 | 中身 |
|---|---|---|
| アップロード用 | 非公開（CDN なし） | presign の宛先。**未検閲**。ライフサイクルで1日後に自動削除 |
| 公開用 | CloudFront(OAC) のみ | **検閲を通ったものだけ**をコピー |

同一バケットのプレフィクス分割にしなかったのは、CDN を被せた時点で `pending/` も
配信対象になり、ビヘイビアで塞ぐ運用に頼ることになるため。**バケットが違えば
「公開される場所に未検閲物を置けない」ことが構造で保証される。**

**presigned PUT で縛れないもの**: 署名にサイズを含められない（POST policy と違う）。
そのため confirm 側で `HeadObject` の**実測値**を見て弾き、落ちたオブジェクトはその場で消す。
放置分はライフサイクルが回収する。持ち主の検証はキーに `userId` を含めて行う
（`pending/<userId>/<uuid>.<ext>` の形と前方一致の**両方**を見る）。

**🔴 順序の問題を1つ発見した（計画に無かった）**: 4 は 13 より前なのに、その時点で
**AWS の production ステージが存在しない**。サイトの CloudFront に相乗りできないため、
アバター専用の `sst.aws.Router` を立てた。**この判断が無いと 4 は本番で成立しない。**

**マージ後に必要な作業**（済むまで本番のアップロードは 503・プリセットは影響なし）:
① `npm run sst:deploy` でバケットと Router を作る ② `AVATAR_UPLOAD_BUCKET` /
`AVATAR_BUCKET` / `AVATAR_BASE_URL` を **Vercel 側にも**入れる ③ Vercel の IAM ユーザーに
S3 権限を足す。本番で `avatarUrl` を持つユーザーは0件なので影響範囲は小さい。

回帰テスト `src/__tests__/avatarStorage.test.ts`（18ケース・253 テスト green / lint / tsc clean）。
`next build` で3ルートの登録を確認し、未認証で 401 を返すことも実測。

---

### 2026-07-29 — 着手前の突き合わせ（2回目）

第1群を終えた時点で、記録と実環境をもう一度突き合わせた。**今回はズレが1件も無かった。**

| 確認したもの | 実測 | 記録どおりか |
|---|---|---|
| 予算 | 上限 $20 | ✅ |
| CAA | `amazon.com` を含む5件 | ✅ |
| Amplify | アプリ 0 件 | ✅ |
| ワイルドカード証明書 | `ISSUED` | ✅ |
| アバターのバケット / Router | **AWS に存在しない** | ✅（4 は未デプロイ） |
| Vercel の `AVATAR_*` 3本 | **未設定**（`vercel env ls production` で確認） | ✅（本番の新規アップロードは 503） |
| server / image-optimizer の Function URL | `AuthType: NONE`・直叩き `/` = **200** | ✅（5 は未実施） |
| WAF web ACL（CLOUDFRONT） | 0 件 | ✅（6 は未実施） |
| `server.memory` | 1024 MB | ✅（7 は未実施） |

📌 前回（第0群）は状態表3か所が古かったが、今回は**正本を1か所に寄せた効果でズレが出なかった**。
教訓10の運用が効いていることの確認になる。

### 2026-07-29 — 第2群 5（Function URL の保護）

**なぜ最優先か**: この URL が開いている限り、6（WAF）・9（noindex）・12（apex 正規化）は
**CloudFront の前段に置く統制**なので、オリジンを直接叩かれた時点で全部素通りする。
着手前の実測でも `https://<32文字>.lambda-url.ap-northeast-1.on.aws/` は **200** を返した。
加えて直叩きでは CloudFront Function を経由しないため `x-forwarded-host` を偽装できる。

**実施したこと**: `sst.config.ts` の `sst.aws.Nextjs` に `protection: 'oac-with-edge-signing'` を追加した。
`"oac"` を採らないのは POST に `x-amz-content-sha256` を自前で付ける必要があり、
**Stripe webhook・NextAuth・ブラウザのフォーム送信では付けられない**ため（POST ルートは20本以上）。

🔗 **依存 B が効いている**: このモードは Lambda@Edge を挟むので **ボディ 1MB 上限**。
4 でアバターを presigned S3 PUT にしてあるので衝突しない。1MB 超のボディを持つルートは他に無い。

🔴 **コードだけでは閉じない。** マージしても `AuthType` は `NONE` のままで、
`npm run sst:deploy -- --stage dev` を打って初めて `AWS_IAM` になる。
**完了判定は `aws lambda get-function-url-config` の `AuthType`**（`get-policy` の
`Principal:*` は残るが、すべて `Condition: FunctionUrlAuthType = NONE` 付きなので不発になる）。

**デプロイして実測した（dev・変更前の値は着手前に採ってある）**:

| 見たもの | 変更前 | 変更後 |
|---|---|---|
| `AuthType`（server / image-optimizer） | `NONE` / `NONE` | **`AWS_IAM` / `AWS_IAM`** |
| Function URL 直叩き `/` | **200** | **403** |
| Function URL 直叩き `/admin` | 307 | **403** |
| image-optimizer 直叩き `/` | 200 | **403** |
| CloudFront 経由 `/` `/api/health` `/admin` | 200 / 200 / 307 | **200 / 200 / 307（不変）** |

✅ **host 依存ロジックは無傷**（#98 の予測どおり）。`/api/admin/*` への POST で:
正しい Origin → middleware を**通過**（その先で 404）、詐称 Origin → **403**、Origin 欠落 → **403**。
＝ `new URL(request.url).origin` が CloudFront のホストに正しく再構成されている
＝ `x-forwarded-host` への退避が `oac-with-edge-signing` 下でも機能している。
✅ `next/image` も無傷（`w=256` で 982 B の `image/webp`）。

📌 **予測と違ったこと**: 「リソースポリシーの公開ステートメント5本はすべて残る」と
書いていたが、SST は `WebPublicFunctionUrlAccess*` 系を**実際に削除した**。
残骸は2本だけで、加えて `Principal: cloudfront.amazonaws.com` かつ `AWS:SourceArn` を
ディストリビューションに限定した正規の2本が入った。**予測を実測として書いていた**。

**同時に 4 のリソースも出来た**（同じ `sst.config.ts` にあるため1回のデプロイで作られる）。
構造で守るという設計の主張を実測で確認した:

| 確認 | 結果 |
|---|---|
| 両バケットの Public Access Block | 4項目とも `True` |
| アップロード用バケットの直 GET | **403**（公開されていない） |
| ライフサイクル | `expire-pending` / Enabled / `pending/` / **1日** |
| CORS | **PUT のみ** |
| AvatarCdn 経由で未存在オブジェクト | 403（OAC 経由で到達＝バケットは非公開のまま） |

⚠️ **本番の 503 は意図的に据え置いた**（オーナー判断・2026-07-29）。理由は下の教訓20。

---

### 2026-07-31 — 第2群 6（Vercel WAF → AWS WAF）

**着手の前提**: 5 が入って Function URL が `AWS_IAM` になっているので、CloudFront の前段に
置く統制がようやく意味を持つ（依存 A）。着手前に `wafv2 list-web-acls --scope CLOUDFRONT` が
**0件**であることを実測して「未着手」を裏取りしてから始めた。

**移す値は推測しなかった**。`vercel firewall rules ls --json` で live 設定を採取:

| Vercel の現行ルール | 条件 | 動作 |
|---|---|---|
| Admin login rate limit | path pre `/api/admin/auth` OR `/api/admin/passkey/login` | IP 別 30req/60s（fixed_window）超過で deny |
| Admin UI bot challenge | path pre `/admin` | challenge |
| Admin geo restrict JP | (`/admin` OR `/api/admin`) AND geo_country ≠ JP | deny |

**実施したこと**: `sst.config.ts` に `aws.wafv2.WebAcl`（`scope: 'CLOUDFRONT'`）を足し、
`sst.aws.Nextjs` の `transform.cdn` で `webAclArn` を渡した。
📌 `sst.aws.Nextjs` に web ACL の引数は無く、内部の `Cdn` コンポーネントを transform するのが唯一の経路。
📌 CloudFront の API はこのフィールドを紛らわしくも `webAclId` と呼ぶが、WAFv2 では **ARN を渡す**。
📌 `scope: 'CLOUDFRONT'` の web ACL は **us-east-1 にしか作れない**ので、この1リソースにだけ
`new aws.Provider('WafUsEast1', { region: 'us-east-1' })` を付けた。

**変更前の値を同じ手段で採ってからデプロイした（教訓14）**:

| 見たもの | 変更前 | 変更後 |
|---|---|---|
| `wafv2 list-web-acls --scope CLOUDFRONT` | **0件** | **1件**（`AdminWaf-a3068a4`） |
| ディストリビューションの `WebACLId`（Web app） | 空 | **web ACL の ARN** |
| ディストリビューションの `WebACLId`（AvatarCdn） | 空 | **空のまま**（意図どおり） |
| `/` `/shop` `/api/health` | 200 / 200 / 200 | **200 / 200 / 200（不変）** |
| `/admin` | 307 | **202**（`x-amzn-waf-action: challenge`） |
| `/admin/login` | 200 | **202** |
| `/api/admin/auth`（GET） | 405 | 405（challenge の対象外＝Vercel と同じ） |
| `/api/admin/auth` を 40連打 | **40/40 が 405** | 直後は素通り → **T+45s から 40/40 が 403** |
| POST `/api/admin/auth` | 403 | **403（不変）**＝middleware の origin 検査は無傷 |

✅ **レート制限のブロックは2つのログインパスに正しく限定されている**。403 が返っている最中でも
`/` は 200、`/admin` は 202（challenge）のままだった＝ scope-down statement が効いている。

✅ **エンコードと大文字での迂回も塞がっている**。`/%61dmin/login` と `/Admin/login` はどちらも
**202**。`textTransformations` に `URL_DECODE` と `LOWERCASE` を2段掛けたのが効いている
（素の `uriPath` だけを見ると、WAF が見る文字列とアプリが解釈するパスがずれる）。

🔴 **計画に無かった発見: challenge の既定 300 秒では admin の画面遷移に割り込む。**
App Router のクライアント遷移は同じ `/admin*` へ RSC の fetch を投げるが、`RSC: 1` を付けた
リクエストも **202（challenge）**になることを実測した。トークンが切れた瞬間の遷移は
RSC ペイロードの代わりに challenge の HTML を受け取ることになる。
→ `challengeConfig.immunityTimeProperty.immunityTime` を **3600 秒**にした。
admin セッションは 25 時間（`api/admin/auth` の cookie `maxAge`）なので依然その内側。
challenge は静かな JS チャレンジで、突破コストは 5 分でも 1 時間でも変わらない
（実効的な統制は geo deny とレート制限のほう）。

⚠️ **費用はステージごとに掛かる。** web ACL は Pulumi のスタック単位なので dev と production で
共有されず、soak 期間は **月$16**＝予算通知のしきい値 $12 を超える。
→ `WAF_STAGES` を配列にしてあるので、**dev の検証が済んだら 'dev' を外して再デプロイする**。
✅ **2026-08-02 に外した**（下の「6 の後始末」の節）。

⚠️ **海外渡航時の一時解除の手順が変わった。** Vercel は `vercel firewall rules disable <id>` で
よかったが、AWS では web ACL が IaC 管理下にある。**`AdminGeoRestrictJp` の action を
`count` に変えてデプロイし直す**のが正しい（教訓6）。コンソールで直接いじると次の
`sst deploy` で黙って巻き戻る。

📌 **geo ルールは日本からは検証しきれない。** ルールの構造（`NOT geo[JP] AND (/admin OR /api/admin)`）
は `get-web-acl` で確認し、**日本からのアクセスがブロックされないこと**（負の対照）は実測したが、
「国外からは deny される」ことそのものは未確認。13 の後に国外経路で確かめる。

---

### 2026-07-31 — 第2群 7（server.memory 1024 → 2048 MB）

**着手の前提**: 6 と同じ `sst.config.ts` を触るので、#110 がマージされてから分岐した（教訓17）。

**変更**: `sst.aws.Nextjs` の `server.memory` を `'1024 MB'` → `'2048 MB'`。それだけ。
Lambda の CPU はメモリに比例し **1769MB で 1vCPU 相当**なので、0.58vCPU → **約1.16vCPU**。

**変更前を同じ手段で測ってからデプロイした（教訓14）。** 手段は CloudWatch Logs の `REPORT` 行
（`@duration` / `@maxMemoryUsed` / `@initDuration`）。**コールドとウォームを分けて集計した**のが要点で、
分けないと「コールド率が違うだけ」の差を性能改善と読み違える（実際、変更前の窓はコールド 15.6%、
変更後の窓は 3.2% で、素の p90 は 1,991ms → 90ms と**実力以上に良く見えた**）。

| | 変更前 1024MB（7日） | 変更後 2048MB |
|---|---|---|
| **ウォーム** p50 / p90 / max | 73.8 / 281.2 / 818.0 ms（n=502） | **51.3 / 91.2 / 264.5 ms**（n=123） |
| **コールド** p50 / p90 / max | 2,040.9 / 2,151.5 / 2,199.5 ms（n=93） | **1,068.0 / 1,099.8 / 1,224.3 ms**（n=21） |
| `maxMemoryUsed` | 231 MB | **230 MB（不変）** |

✅ **コールド経路が約半分になった**（2,041ms → 1,068ms・−48%）。CPU を2倍にした効果としては素直な値。
ウォームも p50 −30%。B-12 で「コールド実測3秒」と記録した体感の主因はここだった。

📌 **コールドの初回サンプルは n=3 しかなかったので、同時25接続のバーストを2回撃って n=21 まで増やした**
（Lambda は同時実行のぶんだけ新しい実行環境を立てるので、意図的にコールドを作れる）。
p50 は 1,072.7ms → 1,068.0ms とほぼ動かず、**小標本の偶然ではないことを確認**してから記録した。

🔑 **`maxMemoryUsed` が 231 → 230 MB で動かないことが、この作業の性格を証明している。**
RAM は最初から 77% 余っていた＝**これはメモリ不足の解消ではなく純粋な CPU 増強**。
「メモリを増やしたら速くなった」と要約すると、次に似た症状が出たときに誤診する。

⚠️ **「GB-秒課金なので費用は相殺される」は言い過ぎだった（計画の記述を修正）。**
変更前のトラフィック構成（コールド 15.6%）で加重平均すると 0.381 → 0.420 GB-秒＝**約 +10%**。
実行時間は縮んだが2倍のメモリを完全には打ち消していない。ただし実測 5.5K invocations/月では
**月 $0.003 の差**＝完全な誤差で、判断は変わらない。コスト面の主役は依然 WAF（$8/月）。

📌 **arm64 化は同時にやらなかった。** server=x86_64 / image-optimizer=arm64 の不一致は残っている。
1回のデプロイで2変数動かすと「速くなったのはメモリか arm64 か」を切り分けられなくなるため、
やるなら単独で測る。今回の数値がその比較基準になる。

⚠️ **worktree からデプロイするための2段の罠を踏んだ**（どちらも既知だが、実際に踏むまで効かなかった）。
① worktree の `node_modules` が #106 より古く `@aws-sdk/s3-request-presigner` が無くビルドが落ちた
（`package.json`・lockfile には入っている＝**worktree 固有の環境要因**で、main と CI は無傷）。
② それを `npm ci` で直そうとしたが **npm 11 は install スクリプトを既定で実行しない**（`allow-scripts`）。
esbuild・@sentry/cli など5パッケージの postinstall が飛ぶ。**依存の導入は npm 10、npm 11 は
`sst deploy` のときだけ**という既存の使い分けが正しいことを、実際の警告出力で再確認した。
バイナリ（`esbuild/bin/esbuild`・`cli-darwin/bin/sentry-cli`）の実在まで見て確定させた。

> 🔴 **この段落の「使い分けが正しい」という結論は誤りだった（2026-07-31 に撤回）。**
> 実在を確認したバイナリは **npm 11 で postinstall が飛んでも同じように実在する**
> （4件とも optional なプラットフォーム別パッケージで解決するため postinstall が実質 no-op）。
> 「npm 10 で入れたから在った」ではなく「**どちらで入れても在った**」が事実。
> 負の対照を取らなかったための誤帰属で、この誤りが教訓26 の arch 不一致を生んだ。
> 現在は `allowScripts` で npm 11 に統一済み。→ **教訓28 の決着**。

✅ **回帰は無し。** `/`・`/shop`・`/api/health` は 200 のまま、`/admin`・`/admin/login` は **202
（`x-amzn-waf-action: challenge`）**で 6 の WAF は無傷、Function URL の `AuthType` は
server / image-optimizer とも **`AWS_IAM`** のままで 5 も無傷。`sharp` も Linux arm64 ネイティブのまま
（`verify:image-optimizer`）。`tsc` / `eslint` / `vitest`（27ファイル・258件）すべて green。

### 2026-07-31 — 第2群 8（Vercel Cron → EventBridge Scheduler ＋ 中継 Lambda）

**経路**: EventBridge Scheduler → 中継 Lambda（`src/functions/cronRelay.ts`）→
**server の Function URL を SigV4 で直叩き** → `/api/cron/*`。CloudFront は通さない。

**📌 使ったのは `sst.aws.Cron` ではなく `sst.aws.CronV2`。**
計画には「`sst.aws.Cron` の実体は EventBridge **Rules** で Scheduler ではない」と書いてあり、
それ自体は正しかったが、**4.17.1 で `Cron` は deprecated** で、後継の `CronV2` は
`scheduler.Schedule` を作る＝**Scheduler が正**だった。`CronV2` は `timezone` と `retries` を持つ。
中継 Lambda が要る理由は変わらない — Rules の API Destinations は **SigV4 非対応**、
Scheduler はそもそも任意の HTTPS を叩けない。

**🔑 4本のスケジュールで中継関数は1つ。** `CronV2` の `function` に `Function` インスタンスを渡すと
`functionBuilder` が**再利用**する（ARN 文字列でなくても新規作成されない）。叩くパスは
`event: { path }` で渡し、Scheduler の `Target.Input` に JSON として載る。関数を4つ作る必要はなかった。

**🔴 計画に無かった衝突: `Authorization` ヘッダの取り合い。**
cron ルートは Vercel Cron が付ける `Authorization: Bearer <CRON_SECRET>` を検査していたが、
**SigV4 の署名も `Authorization` に入る**。同居できない。
→ 中継からは **`x-cron-secret`** で送り、判定を `src/lib/cronAuth.ts` に集約して
**両形式を受ける**ようにした。soak 期間は Vercel と AWS の両方が本番の cron を担うので、
どちらか一方に寄せると片側が静かに 401 で止まる（教訓9）。撤去は 16 の⑧。
📌 この秘密ヘッダは **SigV4 の署名対象に含めてある**（`SignedHeaders` に `x-cron-secret` が入る）ので、
経路上で足したり差し替えたりすれば署名検証で落ちる。

**SigV4 は自前で書いた（`src/functions/sigv4.ts`・約60行）。** 署名対象が
「固定ホスト・ASCII のみのパス・クエリなし・GET」に限られ、S3 の二重エンコードもチャンク転送も
presign も出てこないため。依存を足さない理由は、この関数が**実行ロールの一時資格情報を扱う**こと、
および SST の Function ビルド（esbuild）に tsconfig paths の解決を期待しない方針にしていること。
🔑 **正しさは外部の権威ある値で固定した**: AWS 公式 SigV4 テストスイートの `get-vanilla` ベクタ
（期待 `Signature=5fa00fa3…fbf31`）と、実装時に `@smithy/signature-v4` 5.5.1 で
**同じ入力を署名させて一致を確認した**「一時資格情報＋カスタムヘッダ＋lambda サービス」の2本。
回帰テストは `src/__tests__/sigv4.test.ts`。

**スケジュールの変更（Hobby の日次制限が外れた分の使い道）**

| ルート | Vercel（旧） | AWS（新） | 理由 |
|---|---|---|---|
| `release-reservations` | `10 18 * * *` | **`rate(10 minutes)`** | 8 の本命。在庫確保の失効戻しは日次では粗すぎる |
| `instagram-refresh` | `0 0 1 * *`（月次） | **`cron(0 0 ? * SUN *)`（週次）** | 依存 E・L。60日の窓で更新機会が **2回 → 8回**。Instagram 側は24時間以上経過したトークンしか更新できないので、これ以上詰めても無意味 |
| `cleanup-pending` | `0 18 * * *` | `cron(0 18 * * ? *)` | 変更なし（UTC のまま・発火時刻も同じ） |
| `po-timeouts` | `20 18 * * *` | `cron(20 18 * * ? *)` | 同上 |

**🔴 production のスケジュールは DISABLED で作られる。**
13 の時点では **Vercel の cron がまだ生きている**（soak 中は Vercel を触らない方針）。両方が回ると
`instagram-refresh` が同じ長期トークンを競合して更新し、無効な方が残りうる。
→ `sst.config.ts` の `CRON_STAGES` に `'production'` を足すのは **13 で DNS を切り替えたあと**。
WAF_STAGES と同じ「1か所の配列で切り替える」形に揃えてある。

**dev での実測（2026-07-31）**

- 変更前のベースライン: `aws scheduler list-schedules` **0件** / `aws events list-rules` **0件**（教訓14）。
- デプロイ後: スケジュール **4本**、いずれも `Target.Arn` が**同じ中継 Lambda**、`RetryPolicy` 2、
  `FlexibleTimeWindow: OFF`（Vercel Hobby の ±59分のゆらぎが消えた）。
  `instagram-refresh` だけ **DISABLED**（dev には本番の設定テーブルが無く、動かすと毎回
  `no Instagram token found` で Sentry が鳴るだけのため）。
- **通し動作**: 中継を `aws lambda invoke` で叩くと3本とも **200**。
  中継側 `[cron] relay /api/cron/release-reservations done 126ms status=200 {"released":0,...}`、
  **server 側にも** `[cron] cron/cleanup-pending done 22ms {"deleted":0,"skipped":0}` が出ており、
  「200 が返った」ではなく**ルートが実際に走った**ことまで確認できた。
  📌 中継とアプリで `[cron]` 接頭辞を揃えてあるので、Logs Insights の
  `filter @message like /^\[cron\]/` は**別々のロググループでも同じ絞り込みで拾える**。
- 🔑 **スケジュールが自力で発火することまで見た**（手で `invoke` して 200 が返るのは
  「中継が正しい」証明にしかならない）。`rate(10 minutes)` は作成の約10分後 **22:42:08 UTC** に
  1回目、**22:52 台**に2回目が出た。どちらも手動実行とは別の RequestId で、
  手動を撃っていない時間帯に立っている。＝ **Scheduler → 中継 → アプリの鎖が全部つながっている**。
  📌 スケジュール実行はほぼ毎回コールド（2,501〜2,681ms）。10分間隔では実行環境が保たれないため。
  cron の性質上まったく問題にならないが、「中継は毎回 2.5 秒かかる」ものとして見ておく。
- **負の対照を3つ撃った**（教訓19・21）:
  ① 署名なしで Function URL 直叩き → **403**、`x-cron-secret` だけ付けても **403**
     （＝ IAM 認証が主で、秘密は二重化にすぎないことの確認）
  ② 中継に許可外のパス（`/api/admin/dashboard`）を渡す → `fetch` せず **Unhandled error**
  ③ `sst.config.ts` に不正な `schedule` / `retries` を入れて `npm run check:sst` → **TS2322 が2件**
     （型検査がこの新しいブロックを本当に見ていることの確認）
- 中継の実測: `Max Memory Used` **106〜116 MB**（割当 256MB）/ Duration 139〜210ms。
  ⚠️ **実行予算は 30 秒のまま**。CloudFront の 30 秒は回避したが、**server Lambda 側の
  `timeout` も 30 秒**だから。伸ばすなら `server.timeout` を上げる（CloudFront 経由の web は
  CF 側で切れるので挙動は変わらない）が、1デプロイ2変数を避けて別作業にした。

⚠️ **中継 Lambda 自身の失敗は Sentry に出ない**（`@sentry/nextjs` は Next 側のコードで、この関数は
node 組み込み以外に依存しない方針）。CloudWatch の Errors メトリクスにアラームを張ること。
→ **10（CloudWatch Alarms）の対象に「CronRelay の Errors」を明示的に含める。**


### 2026-07-31 — 第2群 9（非本番の noindex ＋ アクセス制限）

**やったこと**: `sst.aws.Nextjs` と `sst.aws.Router` の `edge` に CloudFront Function を注入し、
**非本番ステージだけ** ①全応答に `X-Robots-Tag: noindex, nofollow` ②Basic 認証 を掛けた。

**なぜ2段構えか。** 目的が別だから。noindex は「検索結果に載らない」だけで、
**URL を知っていれば誰でも読める**状態は変わらない。Vercel が Deployment Protection で
実際に止めていたのは後者で、実測では **1.2k req/h の自動巡回がその壁で弾かれていた**
（＝飾りではない）。noindex だけで置き換えたことにすると、統制が1つ消えたまま 13 を迎える。

**🔴 アクセス制限に WAF を使わない。** web ACL は**ステージごとに1枚**で $5/月 + $1/ルール。
6 の `AdminWaf` と別に dev 用を作ると移行後コストが月$13〜16 になる。
CloudFront Function はリクエスト課金だけ（$0.10/百万＝実測 103K req/月で**月 $0.01**）で、
しかも **5 の Lambda@Edge より手前**で完結するので Lambda の起動すら起きない。

**実装上の要点**
- 資格情報は `sst.Secret('PREVIEW_BASIC_AUTH')` から取り、**deploy 時に base64 化**して
  CFF には期待値の文字列だけを焼く。CFF には `atob` も `Buffer` も `crypto` も無いので、
  受け取ったヘッダを復号するのではなく比較対象を先に作っておくのが唯一の手。
- **`SECRET_NAMES` には入れない。** あの配列に載せた名前は値が無いと deploy 自体が落ちるので、
  混ぜると production（13）でも投入を強いられる。非本番でだけ `new sst.Secret()` する。
- injection の中に `${...}` を書かない。SST 側が `interpolate` のテンプレートリテラルに
  埋めるため、テンプレートリテラルを持ち込むと先に展開されて壊れる。連結だけで書く。
- ⚠️ **これは秘匿ではなく遮蔽**。CFF のコードは `cloudfront:GetFunction` で読めるし比較も
  定数時間ではない。「本番と同じ値を dev に置かない」という既存方針と合わせて初めて成立する。
- ⚠️ 値は CFF に焼き込まれるので、**回すには `sst secret set` だけでなく再デプロイが要る**。

**実測（dev・変更前のベースラインを同じ `curl` で取ってから比較）**

| | 変更前 | 変更後（認証なし） | 変更後（認証あり） |
|---|---|---|---|
| `/`・`/shop`・`/robots.txt`・`/api/health` | 200・`x-robots-tag` **なし** | **401**＋`www-authenticate`＋`x-robots-tag`＋`cache-control: no-store` | 200＋**`x-robots-tag: noindex, nofollow`** |
| `/_next/static/...` | 200 | **401** | — |
| `/_next/image`（og.jpg・w=96・webp） | — | — | **200 / image/webp / 31,590→216 B** |
| 誤った資格情報 | — | **401** | — |

`x-cache` が **`FunctionGeneratedResponse from cloudfront`** ＝ 401 はエッジで完結しており、
オリジンにも Lambda@Edge にも届いていない。デプロイ後に `aws cloudfront get-function --stage LIVE`
でコードを読み戻し、注入が**ハンドラ先頭**に入っていることも確認した（教訓23）。

**回帰（他タスクを壊していないこと）**: 5 → `AuthType: AWS_IAM` のまま・Function URL 直叩き **403**／
6 → 公開パスは 40連打しても全部 200（スコープ維持）／8 → 中継 Lambda を手動実行して **200**
（cron は CloudFront を通らないので Basic 認証の影響を受けない、が**実際に確かめた**）／
next/image の最適化も維持。

**🔴 計画に無かった発見が3つ**
1. **WAF は CloudFront Function より先に評価される。** `/admin` は資格情報の有無にかかわらず
   **202（challenge）**のままで、Basic 認証の 401 にはならない。順序は
   **WAF → viewer-request CFF → キャッシュ → オリジン**。防御が重なる順序を思い込みで書かない。
2. **CloudFront が生成したエラーには viewer-response 関数が走らない。** AvatarCdn で存在しない
   キーを引くと 403 だが `x-robots-tag` は付かない（`x-cache: Error from cloudfront`）。
   実在するオブジェクトでは 200 とともに付く＝**関数の関連付けの確認を 404/403 でやると
   「効いていない」と誤判定する**（教訓21 の同型）。
3. **SST は `args.domain` があるとき `*.cloudfront.net` 宛を自動で 403 にする**
   （`CF_BLOCK_CLOUDFRONT_URL_INJECTION`）。dev は domain 未設定なので今は入っていないが、
   **12 で production に domain を付けた時点で自動的に有効**になる。9 を production へ
   広げる必要はない（そもそも本番は index されたい）。

**🔧 これ以降の運用に効くこと（次に dev を触る人へ）**
- **dev への素の `curl` は全パス 401 になる。** 「壊れた」と誤診しないこと。`-u` を付ける。
  資格情報は **`npx sst secret list --stage dev`** で読む（`eval "$(aws configure
  export-credentials --format env)"` が先に要る）。
  ⚠️ **SSM を直接引いても出ない** — SST v4 の secret は平文パラメータではなく暗号化された
  state 側にあり、SSM にあるのは `/sst/passphrase/siko-coffee/dev` だけ。
- 認証が掛からない/効かない経路が3つある。**この3つは 401 にならないのが正常**:
  ① **AvatarCdn**（`d22i7l6gqogfbs.cloudfront.net`）は noindex のみ
  ② **`/admin*`** は WAF が先に評価されるので資格情報の有無に関わらず 202（challenge）
  ③ **cron** は CloudFront を通らない（Function URL 直叩き）
- 資格情報を回すには **`sst secret set` だけでは足りず再デプロイが要る**（CFF に焼き込むため）。

**次への申し送り**: 12（apex 正規化＋HSTS）も `edge.viewerRequest.injection` を使う。
CloudFront Function は**1ビヘイビアに1つ**で、SST は injection を自前の関数に合成する方式なので
**注入口は1つしかない**。今は「9 は非本番だけ／12 は本番だけ」で排他だが、両方が要るステージが
できたら**文字列を連結する**こと（関数を足そうとしない）。

---

### 9.5 GitHub Actions ＋ OIDC で `sst deploy` を自動化（2026-08-01・✅ 完了／実測検証済み）

✅ **CI からの実デプロイまで確認して完了**（進捗 13/21 → **14/21**）。
🔑 **初回の実行は赤かったが、それは 9.5 の失敗ではない。** デプロイ自体は成功して
AWS に適用され（Lambda の `LastModified` が更新）、落ちたのは**その後**の
`verify:image-optimizer` だった＝ **CI が sharp の潜在バグを炙り出した**（教訓29／#117 で修正）。
**「初回が赤い＝仕組みが動いていない」と読まないこと。** どの段で落ちたかを見る。

**なぜ 13 より前に要るか**: 14（soak）では Vercel と AWS の両方が本番を担う。Vercel は main の
自動デプロイが有効なままにする（ロールバック先を最新に保つため）ので、AWS 側にこれが無いと
**push のたびに Vercel だけが進み、本番を担う AWS が取り残される**（依存 K）。

**設計上の判断**

- **`ci.yml` を拡張して `deploy` ジョブを足した**（別ワークフローにしなかった）。
  `needs: [lint-typecheck, e2e]` で**テストが緑のときだけ**デプロイする。13 以降はこの gate が
  本番を守る唯一の関門になる。`workflow_run` で別ワークフローに繋ぐ形もあるが、ref の解釈が
  既定ブランチ側になって分かりにくく、ここでは同一ワークフロー内の依存で足りる。
  `permissions` はジョブ単位で絞れるので、分ける理由にならない。
- 🔑 **入口は `npm run sst:deploy` のまま**（0-a の不変条件を CI にも通した）。
  CI 専用のデプロイ経路を別に書くと ①ツールチェーン検査 ③deploy ④画像最適化の検証 が
  丸ごと抜ける。**この4つが抜けたことに気づく手段が無い**のが元の罠（#96）だった。
  `scripts/deploy.sh` は **② だけ条件分岐**させた（CI では資格情報が既に環境変数にあり、
  `~/.aws/config` が無いので `aws configure export-credentials` は使えないし、そもそも不要）。
- **デプロイ先ステージは `strategy.matrix.stage` の1か所**で決める。`WAF_STAGES`・`CRON_STAGES`
  と同じ「配列1か所」の運用に揃えた。🔴 **今は `[dev]` だけ**。
- **ロールは SST の管理外**（`scripts/bootstrap-github-oidc.sh`／1度だけ実行）。
  `sst.config.ts` に入れると「CI がデプロイするスタックが、その CI 自身のロールを管理する」
  循環になり、デプロイに失敗したとき CI がデプロイし直せなくなる。
  📌 **教訓6（IaC 管理下のものを手で触ると次の deploy で巻き戻る）は当てはまらない。**
  あれは SST が作ったリソースの話で、ここは最初から SST の外にある。
- 権限は **AdministratorAccess**（オーナー判断）。SST/Pulumi は Lambda・CloudFront・S3・IAM・
  WAF・Scheduler・ACM・Route53 まで広範に触るので、絞ると 13 で AccessDenied が連発して
  切り分け不能になる。**防御は権限の狭さではなく信頼ポリシー側**に寄せた
  （`sub` を `repo:i0li0/siko-coffee:ref:refs/heads/main` に限定・静的キーは1本も増やさない）。
- `concurrency` は **`cancel-in-progress: false`**。SST の state ロックは1ステージ1本で、
  デプロイの途中で打ち切ると**ロックが残ったまま**になる。並走を防ぎつつ、割り込みもさせない。
- node 22 の同梱 npm は 10 系なので、**`npm ci` より前に `npm i -g npm@11`** を入れてある
  （順序が逆だと npm 10 で依存が入り、①の検査は通るのに sharp が wasm32 になる）。

**検証（ローカルで確かめられる範囲）**

- `scripts/deploy.sh` の分岐を stub で両方向とも実行: `AWS_ACCESS_KEY_ID` **あり**→②を飛ばして
  ①③④ を通過／**なし**→従来どおり `export-credentials` 経由。
  **負の対照**として「`export-credentials` が失敗したら止まるか」も確認（**exit 1** で ③ に進まない）。
- `ci.yml` を YAML パーサに通して `needs` / `if` / `permissions` / `concurrency` / `matrix` を確認。
- `npm run lint` / `npx tsc --noEmit` / `npm test`（30ファイル・272件）/ `npm run check:sst` すべて 0。

**✅ 完了条件① — ロール作成（2026-08-01 実行済み・AWS 実測で確認）**

`bash scripts/bootstrap-github-oidc.sh` を実行した。**スクリプトの出力ではなく AWS に
問い合わせて**確認した（教訓23）:

| 確認したもの | 実測値 |
|---|---|
| OIDC プロバイダ | `token.actions.githubusercontent.com` / ClientIDList `["sts.amazonaws.com"]` |
| 信頼ポリシーの `sub` | **`repo:i0li0/siko-coffee:ref:refs/heads/main`**（＝main への push のみ） |
| 信頼ポリシーの `aud` | `sts.amazonaws.com` |
| アタッチ済みポリシー | `AdministratorAccess` の1本のみ |
| リポジトリ変数 | `AWS_DEPLOY_ROLE_ARN` = `arn:aws:iam::654512230021:role/siko-coffee-github-deploy` |

**冪等性も実測**（2回目の実行は3経路とも「既にあります／更新しました」に落ちて exit 0）。

⚠️ **踏んだ罠: IAM の `description` は Latin-1 しか受け付けない。**
日本語を入れたら `ValidationError`（`[	

 -~¡-ÿ]*`）で
`CreateRole` が落ちた。このリポジトリはコメントも文書も日本語なので**同じ書き味で書くと落ちる**
API がある、という点だけ覚えておく（タグの Value や S3 のメタデータも同種の制約を持つ）。
📌 このとき **OIDC プロバイダは既に作られていた**ので、再実行時に二重作成にならないことが
偶然この場で確かめられた（冪等に書いておいて助かった形）。

**✅ 完了条件② — CI からの実デプロイ（2026-08-01・実測）**

| 確認したもの | 実測 |
|---|---|
| `Configure AWS credentials (OIDC)` | success（＝信頼ポリシーの `sub` が実際に一致した） |
| `SST Deploy (dev)` | **success**（#117 取り込み後の実行） |
| dev の Lambda `LastModified` | `2026-07-31T22:17:2x`＝**CI 実行時刻に更新** |
| SST state | 正常書き込み・**ロック残留なし**（state バケットに lock オブジェクト無し） |

📌 ジョブ名は実行時に **`SST Deploy (dev)`** と展開される。PR 上で
`SST Deploy (${{ matrix.stage }})` と未展開に見えるのは**スキップされたジョブの表示だけ**の話で、
設定の誤りではない（一度そう疑ったので記録しておく）。

**🔧 これ以降の運用に効くこと**

→ 運用上の帰結は冒頭の「🔴 9.5 以降のデプロイ運用」にまとめた。**次に main を触る人はそこを先に読む。**

### 2026-08-01 の一連（#115 → #117 → #118 → #116）を1本で読む

この日は4つの PR が連鎖した。**個々の PR を別々に読むと因果が失われる**ので、順に並べておく。

| # | 何を | 結果 |
|---|---|---|
| **#115** | 9.5 本体（`ci.yml` の `deploy` ジョブ ＋ OIDC ロール） | マージ → **初回デプロイが赤** |
| **#117** | `sharp` の `--cpu` 修正 ＋ デプロイ前検査の追加 | 赤の原因を解消 → **デプロイ緑** |
| **#118** | 9.5 を完了にし 13/21 → **14/21** | 正本の更新 |
| **#116** | `brace-expansion` の DoS 勧告（**Pour Over 外**の別件） | #117 の**後**に回した |

**因果**: 9.5 でビルド機が「開発者の Mac（arm64）」から「GitHub Actions の ubuntu-latest（x64）」に
変わった。それだけで、**それまで一度も表に出なかった** sharp のクロスビルドの穴（教訓29）が露見した。
つまり **#115 の赤は #115 のバグではなく、#115 が炙り出した既存のバグ**である。

🔑 **この順序で読むと分かること**: 移行作業の価値は「新しい環境で動くようにすること」だけではない。
**環境を1つ増やすと、それまで環境に依存して**たまたま**正しく見えていたものが分離される。**
教訓26（npm 10 の Node の CPU）も教訓29 も、**単一のマシンで作業している限り永久に見えない**種類の
バグだった。13（本番切替）より前に x64 のビルド機を通せたのは、順序として幸運だった。

📌 **#116 は Pour Over のタスクではない**が、ここに記録してある。9.5 以降は
**無関係な PR でもマージすれば本番相当の経路が動く**ので、「Pour Over 外だから独立」は
もう成り立たないため。実際 #116 を先に入れていれば、依存の更新が原因に見える赤が出ていた。

**次への申し送り（13 で必ず読む）**: `matrix.stage` に **`production` を足すのは DNS を
切り替えた後**。先に足すと本番ステージが CI から先に作られ、13 の「production デプロイ →
検証 → DNS 切替」という順序が飛ぶ。`CRON_STAGES` に production を足すのが 13 の後なのと同じ理由。

### 2026-08-01 — 依存 L の確認（Instagram トークン）

**期限が当日だった唯一の項目**で、結果は **更新成功**。

| | 値 |
|---|---|
| 更新前 | `refreshedAt: 2026-07-01T00:51:23Z` |
| 更新後（実測） | **`refreshedAt: 2026-08-01T00:21:11.206Z`** / `expiresIn: 5184000` |
| 失効日 | 2026-08-30 → **2026-09-30** |

🔑 **00:00 UTC 指定に対して発火は 00:21 UTC。** Hobby の flexible window（1時間）の内側で、
**遅れて発火する**。朝の時点で見に行くと「更新されていない」ではなく**「まだ観測できない」**
状態を掴むので、判定は窓が閉じた後にやること。

🔑 **`release-reservations` は回らず `instagram-refresh` は回った。** Vercel の cron は
「全部動く／全部動かない」ではなく **本ごとにまだら**だった。1本の実行実績を他の本の
根拠にしてはいけない。

📌 次の確認は **2026-09-02**（9/1 の月次の翌日）。13 が済んでいれば AWS の週次に替わっている。
**13 が 9/1 を跨ぐなら、その時点でも頼れるのは Vercel の月次1本**（production の
スケジュールは 13 まで DISABLED）。

### 2026-08-01 — 10（CloudWatch Alarms）実装とデプロイ

**経路は Alarm → SNS → 中継 Lambda → Slack。** 実体は `sst.config.ts` の「監視」ブロックと
`src/functions/alarmRelay.ts`、回帰テストは `src/__tests__/alarmRelay.test.ts`（8ケース）。

**設計判断**

- **メール購読を採らなかった。** SNS のメール購読は**購読確認リンクのクリック**が要る＝
  IaC で完結せず、ステージを作り直すたびに手作業が復活する。通知先も既にフィードバック通知が
  流れている Slack と分断される。
- 🔴 **トピックは2本要る。** CloudWatch アラームのアクションは**アラームと同じリージョン**に
  なければならず、**CloudFront のメトリクスは us-east-1 にしか出ない**。→ us-east-1 と
  ap-northeast-1 に1本ずつ立て、**中継 Lambda 1本**に集約した（SNS → Lambda のクロスリージョン
  配信は既定有効リージョン間では公式サポート。購読リソースは**トピック側のリージョン**で作る）。
- 📌 **provider を使い回さず `AlarmsUsEast1` を新設した。** 既存の `WafUsEast1` の論理名を
  共用に変えると、それを使っている web ACL が置き換え対象になりうる。web ACL は CloudFront に
  関連付いていて削除が遅く脆いので触らない。provider は AWS 上のリソースではないので2つでも無害。
- 🔴 **SES の `Reputation.*` は production でだけ作る。** アカウント全体のメトリクスなので、
  dev にも作ると soak 中に同じ事象で2回鳴り、しかも dev が本番の送信評判で鳴る。
- **`src/lib/slackNotify.ts` は流用しない。** あれは `r.ok` を見ず失敗を握り潰す。
  ユーザー操作をブロックしない目的では正しいが、**アラート中継でそれをやると
  「鳴ったのに届かない」が無音で起きる**。

**dev での実測**

| 確認したもの | 実測 |
|---|---|
| アラーム（ap-northeast-1） | 4本（cron-relay-errors / web-server-errors / web-server-throttles / alarm-relay-errors） |
| アラーム（us-east-1） | 1本（cloudfront-5xx・`DistributionId` + `Region: Global`） |
| **SES の2本** | **dev には作られない**（`isProd` ゲートの負の対照） |
| 購読 | 両リージョンとも confirmed（`PendingConfirmation` ではない）。**us-east-1 のトピックが ap-northeast-1 の Lambda を指す** |
| Lambda リソースポリシー | `sns.amazonaws.com` × `SourceArn` 2本（Main / Global）に限定 |
| **クロスリージョン配信** | ✅ **手動 publish と実アラーム遷移の両方で到達を確認**（下記） |
| `treatMissingData` | INSUFFICIENT_DATA → **自力で OK へ遷移**（約2分）＝ `notBreaching` が効いている |
| 中継の消費 | Max Memory 80MB / 128MB・実行 2〜37ms |

🔑 **クロスリージョンは「構造」ではなく「配信」で確かめた。** 購読が存在することと
実際に届くことは別（教訓27 と同型）。us-east-1 のトピックへ手動 publish して
ap-northeast-1 の中継が起動することを見たうえで、さらに **us-east-1 の
`siko-dev-cloudfront-5xx` が INSUFFICIENT_DATA → OK に遷移した本物の通知**が
同じ経路で届いたことも確認した。

🔑 **`SLACK_WEBHOOK_URL` は placeholder 付きで宣言し、`SECRET_NAMES` には入れていない。**
あの配列は値が無いと `sst deploy` 自体が落ちるので、混ぜると 13 でも投入を強いられる。
実測でも**未設定のままデプロイは通り**（Lambda の env は `SLACK_WEBHOOK_URL: ""`）、
発火時に**ペイロード全文を CloudWatch に残したうえで例外**になった（5回）。
＝ **Slack に出ないだけで内容は失われない**。
🔴 値は deploy 時に env へ焼き込まれる＝ **`sst secret set` だけでは効かず再デプロイが要る**
（9 の `PREVIEW_BASIC_AUTH` と同じ性質）。

**✅ 最後の1ホップ（中継 → Slack）も実測済み**

`SLACK_WEBHOOK_URL` を dev に投入して再デプロイし、両経路から publish して確認した。

| 経路 | 中継のログ | 結果 |
|---|---|---|
| us-east-1 → ap-northeast-1 | `forwarding: 🔴 ALARM *siko-dev-cloudfront-5xx* _[dev]_` | **例外なく完了** |
| ap-northeast-1（同一） | `forwarding: ✅ OK *siko-dev-cron-relay-errors* _[dev]_` | **例外なく完了** |

🔑 **「正常終了」が到達の証明になるのは、コードが 2xx 以外を必ず例外にしているから。**
`r.ok` を見ない実装（`src/lib/slackNotify.ts` の形）だと、この観測は何も証明しない。
**検証可能性は実装の性質**であって、後から観測手段を足して得られるものではない。

📌 実行時間は 2〜37ms から **約 2.5 秒**へ増えた（Slack への HTTPS 往復＋コールド起動 130ms）。
timeout 30 秒に対して十分な余裕がある。Max Memory は 91MB / 128MB。

✅ **Slack の画面で3件（ALARM 1・OK 2）の到達をオーナーが目視確認済み**。
📌 **ここだけは AWS 側からは確認できない。** 中継の正常終了が示すのは
「Slack API が 2xx を返した」ことまでで、**投稿先チャンネルが期待どおりか**は分からない
（webhook の向き先を間違えても 2xx は返る）。**経路の検証と宛先の検証は別物**なので、
新しい webhook を使うときは1回だけ人の目で確かめる工程を残す。

**ここまでで 10 は完了＝進捗 15/21。**

---

### 2026-08-01 — 11（Route53 の TTL を 60s へ）

**依存 F を満たすための、コード変更を伴わない Route53 の操作。** 対象は
**切替で値が変わる2本だけ**（apex の A と www の CNAME）。ACM の検証 CNAME と
SES DKIM の3本は 13 で書き換えないので触っていない。

**変更前後（同じ手段＝権威 NS への `dig` で測った）**

| レコード | 変更前 | 変更後 | 値 |
|---|---|---|---|
| `sikocoffee.com` A | **300s** | **60s** | `216.198.79.1`（不変） |
| `www.sikocoffee.com` CNAME | **500s** | **60s** | `724b9301c41a7c8f.vercel-dns-017.com.`（不変） |

計画に「www=500s / apex=300s」と書いてあった値と**実測が一致**した（教訓10 の
「状態表は実体より先に古くなる」が起きなかった例）。変更は `UPSERT` 2件の
1バッチで、`ChangeInfo` が `INSYNC` になるまで待ってから**権威 NS 4本すべてに問い合わせ**、
4本とも 60s／値が不変であることを確認した。本番も無傷（www 200 / apex 308→www）。

🔑 **TTL の引き下げは「打った瞬間」には効かない。** 打つ前にレコードを取った
リゾルバは**旧 TTL のあいだ**それを保持し続けるので、60s が世界中で効くのは
最短でも旧 TTL（www の 500s）が失効したあと。これが依存 F の理由そのもので、
**「変更が INSYNC になった」は「短い TTL が効いている」の証明ではない**（教訓27 と同型）。

🔴 **ただし 24 時間という数字は 500s から出たものではない。** TTL を守らない
リゾルバ・独自に下限を設けるリゾルバ・OS やブラウザ側のキャッシュがあるため、
**60s を宣言しても実際の切り戻し時間はそれより長くなりうる**。24 時間は
その不確かさを吸収するための余裕であって、計算値ではない。
→ **13 で「TTL が 60s だからロールバックは1分」と見積もらないこと。**
   期待できるのは「5〜8分が1分台に**近づく**」であって、保証ではない。

📌 **13 の最速実行可能時刻は 2026-08-02 17:50 UTC（＝ 8/3 02:50 JST）以降。**
先に打ったので 13 の日程は自由に選べる状態になった（依存 F は解消済み）。
引き下げっぱなしのコストは Route53 のクエリ課金だけで、実測 103K req/月の
規模では誤差（$0.40/百万クエリ）。

**ここまでで 11 は完了＝進捗 16/21。次は 12（`domain` 設定＋apex 308/HSTS）。**

---

### 2026-08-01 — 12（`domain` 設定＋apex→www の 308 と HSTS）

実体は `sst.config.ts` の「本番ドメインと apex 正規化」ブロックと **`src/lib/apexRedirect.ts`**、
回帰テストは `src/__tests__/apexRedirect.test.ts`（13ケース）。

#### 🔴🔴 計画に無かった発見: `dns` を有効のままにすると **deploy がそのまま DNS 切替になる**

計画には「**`dns` は有効のままでよい。`dns: false` にする必要があるのは非対応 DNS
プロバイダの場合だけ**」と書いてあった。**これは誤りだった。** SST のソースを読んで確定した:

```
.sst/platform/src/components/aws/cdn.ts  createDnsRecords()
  → domain.name と domain.aliases の **すべて** について dns.createAlias()
.sst/platform/src/components/aws/dns.ts  createAlias()
  → ["A","AAAA"] を CloudFront への ALIAS として作成
     _createRecord() の allowOverwrite は args.override（**既定 undefined**）
```

＝ `dns` を既定のままにすると、**production を deploy した瞬間に
`www.sikocoffee.com` と `sikocoffee.com` の A/AAAA が CloudFront を向く**。
13 の手順「production デプロイ → **検証** → DNS 切替」は、この構成では成立しない。
検証する前に切り替わってしまうからである。

しかも `allowOverwrite` が既定 false で、**現に www には CNAME・apex には A が存在する**ので、
実際には**デプロイが RRSet の衝突で落ちる**公算のほうが高い（www は CNAME と A の共存自体が
禁止されている）。つまり結果は「予告なく本番が切り替わる」か「デプロイが落ちる」の二択で、
**どちらも受け入れられない**。

→ **`dns: false` ＋ `cert`（0-b のワイルドカード ARN）を採用した。**
SST は「alternate domain name を distribution に設定する」ところまでをやり、
**Route53 のレコードは作らない**。切替も切り戻しも Route53 の UPSERT で人が行う。

🔑 **11 で TTL を 60s にした意味は、この構成でだけ生きる。** レコードが IaC 管理下にあると、
ロールバックは「`domain` を外して再デプロイ」になり CloudFront の更新待ちで数分〜十数分かかる。
管理外に置けば切り戻しは **UPSERT 1回＝秒**で、60s の TTL がそのまま効く。
📌 **教訓6（IaC 管理下のリソースを CLI で触らない）は当てはまらない。** あれは
**SST が作ったリソース**の話で、最初から SST の外に置くと決めたものには適用されない
（9.5 の OIDC ロールを `sst.config.ts` に入れなかったのと同じ整理）。

📌 **副作用**: `domain` を付けると SST が `*.cloudfront.net` 宛を自動で 403 にする
（`CF_BLOCK_CLOUDFRONT_URL_INJECTION`）。**13 の事前検証を CloudFront の URL では行えない**。
→ `curl --resolve www.sikocoffee.com:443:<配信IP> https://www.sikocoffee.com/...` で
SNI と Host を本番ドメインのまま当てる。**これが 13 の検証手順の前提になる**ので先に書いておく。

#### 検証が dev でできない唯一のタスクなので、単体テストを検証手段にした

`domain` は production にしか付かない＝ **`sikocoffee.com` という Host が dev の
CloudFront に届くことはない**。5・6・9 でやった「dev に当てて curl で測る」が
**原理的にできない**。加えて `sst.config.ts` は **CI で型検査されない唯一のファイル**である。

→ リダイレクト本体を **`src/lib/apexRedirect.ts` に切り出し**、
**生成される関数本体を `new Function` で実際に評価する**テストを書いた。
「文字列に `308` が含まれること」を見るだけのテストにはしていない（それは「書いた」の
確認であって「動く」の確認ではない＝教訓27 と同型）。

**負の対照を含む13ケース**: www 宛は素通り（ここで返すと無限ループ）／CloudFront ドメインは素通り／
Host ヘッダ欠落でも例外を投げない（投げると 500）／`SikoCoffee.COM` も 308／
パスのパーセントエンコード保存／クエリ保存／**同名パラメータ（`multiValue`）を落とさない**／
クエリ無しで `?` を付けない／`${` と バッククォートを含まない（SST の interpolate に食われる）／
`let`・`const`・アロー関数を使わない（CFF ランタイム）。

🔑 **テスト自体にも負の対照を取った。** 実装に3つの変異を入れて、**落ちること**を確認している:

| 変異 | 結果 |
|---|---|
| `308` → `301` | **2件 failed** |
| `toLowerCase()` を外す | **1件 failed** |
| `multiValue` 分岐を殺す | **1件 failed** |

＝ このテストは通ることではなく**壊れたときに落ちること**まで確かめてある。
`check:sst` も同様に、`dns: 'yes'` を入れて **TS2322 が出ること**を確認した（教訓19）。

#### そのほかの設計判断

- **308 であって 301 ではない。** 301/302 はメソッドを GET に変えてよいことになっており、
  apex 宛の POST が黙って GET になる。`next.config.ts` も `permanent: true`＝308 なので同値。
- **HSTS の値は `next.config.ts` の `securityHeaders` と同一**（`max-age=63072000; includeSubDomains; preload`）。
  テストで値そのものを固定してあるので、片方だけ直る事故が落ちる。
- **`domain.redirects` は使わない**（既定方針どおり）。SST の `HttpsRedirect` は
  S3 website リダイレクト＋CloudFront で **Response Headers Policy が付かない＝HSTS が乗らない**。
- **クエリの組み立ては AWS 公式の正規化サンプルと同じ形**（`multiValue` があればそちらが正）。
  📌 `?foo`（値なし）は CFF 側で `foo: {value: ''}` になるため `?foo=` に正規化される。
  実害のない差だが、**完全な素通しではない**ことは記録しておく。
- **9 と 12 は排他**（9＝非本番のみ／12＝本番のみ）なので注入口の取り合いは起きない。
  🔴 両方を要するステージができたら**文字列を連結する**こと（9 からの申し送りどおり）。

**⚠️ 12 は「実装済み・未実測」である。** apex の 308 も HSTS も `domain` も、
**production ステージが存在しない今は一度も動いていない**。実測は 13 で行う
（教訓27: 型が通ったことも、テストが通ったことも、「本番の CloudFront でそう動く」の証明ではない）。

#### 🔴 #123 のマージ後、最初の `SST Deploy (dev)` が落ちた（トップレベル import）

**PR は全チェック緑（lint / tsc / vitest 293 / e2e / check:sst）だったが、main へマージした
直後のデプロイが失敗した。**

```
── ① ツールチェーンの確認 ──        ✓
── ② AWS 資格情報（CI）──            ✓ arn:aws:sts::…/siko-coffee-github-deploy/GitHubActions
── ③ sst deploy ──
✕  Your sst.config.ts has top level imports - this is not allowed.
   Move imports inside the function they are used and do a dynamic import
```

原因は 12 で足した `import { … } from './src/lib/apexRedirect'`。**SST は設定の
トップレベル import を禁止**しており、`run()` の中で `await import(...)` にする必要がある。

🔑 **dev は無傷。** ③ の設定読み込み時点で落ちているので**何も適用されていない**
（Lambda の `LastModified` が実行時刻に更新されていないことで確認）。部分適用ではない。

🔴 **手元の検査は4つとも通っていた。** `eslint` / `tsc --noEmit` / `vitest` / **`check:sst`**。
とくに `check:sst` は「`sst.config.ts` が CI で型検査されない」問題に対して #108 で用意した
ものだが、**これは型の検査であって SST の実行時制約は守備範囲外**だった。
＝ **検査を足したこと自体は正しかったが、その射程を実際より広く見積もっていた**（教訓18 の再演）。

✅ **対処は「直す」だけでは足りないので、止まる場所を作った**（`scripts/check-sst-config.mjs` /
`npm run check:sst-config`）。**CI の `Lint & Type Check` ジョブに入れてある**のが要点で、
`SST Deploy` は **main への push でしか走らない**ため、そこだけに頼ると
**マージするまで分からない**（今回まさにそうなった）。

負の対照つきで確認した:

| 状態 | `check:sst-config` | `check:sst`（tsc） |
|---|---|---|
| トップレベル import あり（＝落ちた状態） | **exit 1** | **exit 0**（素通り） |
| 動的 import に修正後 | exit 0 | exit 0 |

＝ **塞いだ穴がそのまま実証されている**（新しい検査だけが反応し、既存の検査は反応しない）。

#### 📌 このセッションで書いた日付が1日ずれていたので訂正した

11・12 の記録を最初 **2026-08-02** と書いたが、実際は **2026-08-01** だった。
気づいたのは GitHub Actions の `createdAt` が `2026-08-01T18:13Z` だったため。
独立した4つの時計（ローカル `date` / GitHub / AWS の HTTP `Date` / Cloudflare）が
すべて **2026-08-01 Sat** で一致し、**Route53 の `SubmittedAt` も `2026-08-01T17:50:31Z`** だった。

→ **11 の実施は 2026-08-01 17:50 UTC**、したがって **13 の最速は 2026-08-02 17:50 UTC
（＝ 8/3 02:50 JST）**。当初「8/3 17:50 UTC 以降」と書いたのは1日ぶんの誤りで、
**切替可能な時刻を丸一日遅く見せていた**。

🔑 **絶対日付を記録するときは、記録した本人の時計を疑う。** 教訓5 で「依存は絶対日付にする」と
決めたが、**その絶対日付の出所を確かめる手順は決めていなかった**。
依存 F のように**日付そのものが判断材料になる**項目では、
**操作した対象（ここでは Route53 の `SubmittedAt`）が返す時刻を正本にする**のがよい。
そちらは「その API から見た事実」であり、こちらの時計がずれていても正しい。

**ここまでで 12 は実装完了＝進捗 17/21。次は 13（production デプロイ → 検証 → DNS 切替）。**

---

### 2026-08-01 — 13 の事前点検で見つかった2つの穴

13 は依存 F により **2026-08-02 17:50 UTC 以降**まで実行できないので、
その間に **「当日詰まる要因」を実測で潰す**ことにした。結果、2件見つかった。
手順書は `docs/pour-over-13-runbook.md` に独立した文書として置いた。

#### 🔴 穴①: production のシークレットが **0本**

```
$ npx sst secret list --stage production
✕  No secrets found
```

`sst deploy --stage production` は **`SECRET_NAMES` の7本が1本でも欠けると落ちる**。
＝ **13 はそのままでは1行目から進まなかった。**

📌 Vercel 本番側には7本とも存在する（`vercel env ls production` で名前を確認）。
やるべきは「作る」ではなく「**移す**」。

🔴 **しかも作り直してはいけない。** soak（14）の間は **AWS と Vercel の両方が本番を担う**ので、
乱数系を作り直すと**どちらに当たったかでユーザーの体験が割れる**:
`AUTH_SECRET` と `ADMIN_SESSION_SECRET` は**ランダムにログアウト**、
`ORDER_TOKEN_SECRET` は**切替前にメールで送った注文照会リンクが片方で 403**、
`CRON_SECRET` は Vercel 側の cron が 401 になる。
📌 `sst.config.ts` の「**本番と同じ値を dev に入れない**」という方針は **dev の話**で、
production は Vercel と**一致していなければならない**。ここだけ向きが逆になる。

#### 🔴🔴 穴②: `sst.config.ts` に配線されているシークレットが **7本しかなかった**

計画の 13 の欄には「シークレットは Vercel 本番の30本と突合済みで**過不足なし**」と書いてある。
だがこれは **値が Vercel に在ることの確認**であって、
**`sst.config.ts` の `environment` に配線されていることの確認ではなかった**。
実際に Lambda へ渡っていたのは `...secretEnv`＝ **`SECRET_NAMES` の7本だけ**で、
残りは「任意」としてコメントアウトされたままだった。

**このまま production を deploy すると「デプロイは成功するのに機能が欠けた本番」ができる。**
消費側を1つずつ grep して確認した:

| 欠ける変数 | 読む場所 | 起きること |
|---|---|---|
| `GOOGLE_CLIENT_ID/SECRET` | `src/lib/auth.ts` | `oauthEnabled.google` が false ＝ **Google ログインが黙って消える** |
| `LINE_CLIENT_ID/SECRET` | 同上 | **LINE ログインが消える** |
| `ADMIN_TOTP_SECRET` | `src/lib/adminTotp.ts` | TOTP 秘密が null |
| **`ADMIN_TOTP_REQUIRED`** | `api/admin/auth/route.ts` | `=== 'true'` が false ＝ **admin がパスワードのみで通る** |
| `NEXT_PUBLIC_SENTRY_DSN` | `sentry.server.config.ts` | dsn が undefined ＝ **サーバ Sentry が無効**（依存 D が崩れる） |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | `src/app/layout.tsx` | GA を描画しない |
| `INSTAGRAM_ACCESS_TOKEN` | `src/lib/instagram.ts` | 初期トークン（依存 E・L） |

🔴 **`ADMIN_TOTP_REQUIRED` だけ質が違う。** 他は「機能が消える」だが、これは
**防御が消える**（フェイルオープン）。しかも**サイトは正常に見える**ので気づけない。
`src/app/api/admin/auth/route.ts` は「秘密鍵が未設定なら**フェイルクローズ**」を
わざわざ実装してあるのに、**フラグ自体が届かなければその分岐に入らない**。
＝ **フェイルクローズの設計は、その判断材料が届いていることが前提**である。

#### 対処: `SECRET_NAMES` に足すのではなく、既定値付きの別配列にした

```ts
const OPTIONAL_SECRET_NAMES = [ … 11本 … ] as const
const optionalSecretEnv = Object.fromEntries(
  OPTIONAL_SECRET_NAMES.map((name) => [name, new sst.Secret(name, '').value]),
)
```

🔑 **`SECRET_NAMES` に足すのは誤り。** あの配列は**値が無いと `sst deploy` が落ちる**ので、
足すと **dev にも本番用の秘密の投入を強いる**ことになり、
「本番と同じ値を dev に入れない」という既存の方針と正面から衝突する。
既定値 `''` なら **dev は今までどおり（機能オフ）／production だけ実値**にできる。
📌 同じ形は 10 の `SLACK_WEBHOOK_URL` で先に使っている（＝新しい発明ではなく既存パターンの適用）。
⚠️ 消費側が**すべて falsy ガード**（`Boolean(a && b)` / `x || null` / `=== 'true'` /
`{x && <C/>}`）であることを grep で確認したうえで `''` を「無効」の意味に使っている。

#### 今回は**マージ前に**差分を実測した（前回の反省）

12 でトップレベル import を踏んだ直後なので、「CI が緑」で終わらせずに `sst diff --stage dev` を回した:

- 追加されるのは **`environment.variables` の11本だけ**。他は再ビルドに伴う通常の入れ替わり。
- **`sst secret list --stage dev` は元の9本のまま**＝ `diff` は state を変更していない（副作用なしを確認）。

📌 ついでに `sst secret list` が**値を伏せたまま長さを出せる**ことも確認できた
（`len=64` など）。教訓32 の「伏せる」と「測る」の使い分けは、この形で実行できる。

---

### 2026-08-02 — 6 の後始末（`WAF_STAGES` から `'dev'` を外す）

**やったこと**: `sst.config.ts` の `WAF_STAGES` を `['production', 'dev']` → `['production']` に。
dev の web ACL（`AdminWaf-a3068a4`）は次の dev デプロイで削除される。

**判断の根拠**:

| 論点 | 結論 |
|---|---|
| dev に WAF を入れた目的は何だったか | **6 のルールが効くことを production の外で実測すること**。2026-07-31 に完了済み（公開パス 200 のまま／`/admin` `/admin/login` が 202 challenge／`/api/admin/auth` 40連打で T+45s 以降 403／`/%61dmin` `/Admin` も 202）。目的を果たした ACL に月$8 は払わない |
| 外すと dev が無防備になるか | **ならない**。9 の CloudFront Function（Basic 認証＋`noindex`）は WAF とは別に全パスへ掛かったままで、dev はドメインを張っていない（`*.cloudfront.net`）。失うのは「Basic 認証を突破した相手に対する admin のレート制限と geo deny」だけ |
| 費用 | $5/ACL＋$1/rule×3＝**月$8/ステージ**。dev と production が並ぶと月$16 で**予算通知（$12）を超える**。ただし**時間割の課金**なので数日の重複なら実額は 1日約$0.27（予測値で通知が鳴ることはある） |
| 実施のタイミング | **13 より前**。計画では 5-5（切替後）だったが、先に外せば production ACL との重複期間がゼロになる。先に外して困ることは無い |

🔴 **代償**: `WAF_STAGES` に `'dev'` が無いと `adminWaf` の**構築ごとスキップされる**ため、
ルール定義を壊しても **dev のデプロイは素通りし、production の `sst deploy` で初めて落ちる**。
#124 のトップレベル import と同じ構図（教訓「デプロイでしか落ちない失敗」）。
→ **WAF のルールをいじるときは一時的に `'dev'` を足して実測し、確認できたら外す。**

📌 **副作用: dev の `/admin*` の応答が変わる。** WAF は CloudFront Function より先に評価される
ので、以前は資格情報の有無に関わらず 202（challenge）だった。今は 9 の Basic 認証がそのまま
出る＝**資格情報なしで 401 / ありで 200**。上の 2026-07-31（9）の節にある
「`/admin*` は資格情報の有無に関わらず 202 のまま」は**この変更以前の観測**である。

⚠️ **13 への影響**: dev で先に試す道が無くなったので、**13 の production 検証が WAF の初回実測**
になる。手順書 5-5（`WAF_STAGES` から `'dev'` を外す）は本作業で消化済み。

---

### 2026-08-02 — 13 の 2（production デプロイ）と 3（切替前検証）

🔑 **DNS には一切触れていない**（12 の `dns: false`）＝この節の作業中も**本番トラフィックは Vercel のまま**。
手順4（DNS 切替）は依存 F の門（2026-08-02 17:50 UTC）まで打っていない。

#### 前提の実測（着手直前）

| # | 条件 | 実測 |
|---|---|---|
| 0-2 | 証明書 | `ISSUED` / `sikocoffee.com`+`*.sikocoffee.com` / 2027-02-11 / `InUseBy` は空 |
| 0-3 | 本番 DynamoDB | **16本**（`list-tables` の17件目は SST が作った dev の revalidation テーブル） |
| 0-4 | production の secret | **17/17・すべて非空**。`ADMIN_PASSWORD_HASH` は **168**（教訓37 の欠落が直っている）、`ADMIN_TOTP_REQUIRED` は `len=4` |
| 0-5 | main が緑 | run 30725206853 success（#130） |

📌 **`MAIL_FROM` は `len=37` と出るが 36文字**。`Sikō` の `ō` が UTF-8 で2バイトで、`awk` の
`length()` が数えているのは**バイト数**。長さで検査するときは文字数と混同しないこと。

#### 1回目のデプロイは失敗した（原因2つ・無関係）

🔴 **① main リポジトリの `node_modules` が古かった。** `@aws-sdk/client-s3` と
`@aws-sdk/s3-request-presigner`（#106 で追加）が **package.json と lockfile には有るのに実体が無く**、
`npm run build` が `Module not found` で落ちた。
**教訓26 の「worktree の node_modules は固まる」と同じ罠だが、踏んだのは worktree ではなく main リポ。**
「デプロイは main リポから」という原則は**この罠からは守ってくれない**（→ 教訓38）。
→ `npm ci`（npm 11）で復旧。lockfile は汚れない（`git status` clean を確認）。

🔴 **② 資格情報が、表示された期限より早く死んだ。** `deploy.sh` の ② は
「期限 **00:46:44** UTC」と表示したが、**00:39:58 の時点で `aws sts get-caller-identity` が
既に `ExpiredToken`**（環境に残った `AWS_*` は0本＝教訓33 の再発ではない）。
結果 `AvatarCdnCdnWaiter` が `GetDistribution` で 403 になった。

⚠️ **1回目は部分適用で終わった**（CloudFront 2本・S3 3本・Lambda@Edge・CronV2 4本・
SNS/アラーム・**`AdminWaf` web ACL** まで作られ、**Web 本体だけ未完**）。
さらに **state ロックが残った**（異常終了で解放されない）＝ `npx sst unlock --stage production` が要る。

#### 2回目（`npm ci` → 再ログイン → unlock → 再実行）で成功

`✓ Complete` / exit 0。`deploy.sh` ④ の画像最適化検証も通過（sharp は **Linux arm64 ネイティブ**）。
**production の CloudFront は `d38zi1bm4zf9e3.cloudfront.net`**（alias に apex と www・`Deployed`）。

🔑 **再実行の前に `npm run build` を単体で回して exit 0 を確認した。**
資格情報の窓が実測で10〜15分しかないので、**ビルド失敗で窓を溶かさない**ための順序。

#### 3-a〜3-i の実測（**全項目合格**）

| # | 実測 |
|---|---|
| 3-a | `/` = **200** |
| 3-b | `/shop` 200 / `/shop/catalog` 200 / `/account` **307 → `/login`** |
| 3-c | apex `/shop?a=1` = **308** ＋ `location: https://www.sikocoffee.com/shop?a=1`（クエリ保持）＋ `strict-transport-security: max-age=63072000; includeSubDomains; preload` |
| 3-d | 200 の応答に **`x-robots-tag` も `www-authenticate` も無い**（負の対照・合格） |
| 3-e | server / image-optimizer とも **`AWS_IAM`**、Function URL 直叩きは**両方 403** |
| 3-f | 下記 |
| 3-g | `/shop` の抽出が **Vercel と完全一致**（ブラジル/エチオピア/コロンビア 各6）＝本番テーブルを向いている |
| 3-h | ap-northeast-1 に **6本**（dev は4本＝ **SES の `Reputation.*` 2本が新規**）＋ us-east-1 に `cloudfront-5xx` |
| 3-i | production のスケジュール **4本すべて `DISABLED`** |

🔑 **3-b の `/account` 307 は異常ではない。手順書の「200」が不正確だった。**
未ログインだと `/login` へ飛ぶのが正しく、**同じ手段で測った Vercel 本番も 307 → `/login`**。
**期待値が合わないときは、まず同じ手段で変更前を測る**（[[feedback-verification-baseline]] の実践）。

#### 3-f（WAF）は production が初回の実測 — dev と挙動が違った

`WAF_STAGES` から dev を外した（#130）ので、**production が唯一 web ACL を持つステージ**。

✅ **合格した内容**（`get-sampled-requests` で**どのルールが撃ったか**まで確定させた）:
- `AdminUiBotChallenge` → **CHALLENGE** 4件（`/admin` `/admin/login` `/%61dmin` `/Admin`・国は `JP`）
  ＝ **`URL_DECODE`+`LOWERCASE` の2段変換が production でも効いている**
- `AdminLoginRateLimit` → **BLOCK**（POST `/api/admin/auth`）
- `AdminGeoRestrictJp` → **0件**（日本からは撃たない＝負の対照）
- **scope-down も確認**: ブロック中も `/admin` は 202・`/` は 200・`/api/admin/orders` は 401（アプリ応答）
- ルール設定は `Limit: 30` / `EvaluationWindowSec: 60` / `AggregateKeyType: IP`（Vercel の live 設定と一致）

🔴 **dev と違ったのは発火と解除のタイミング。**
dev は「40連打は全部素通り → T+45s 以降 403」だったが、production は **1発目から403**、
そして **解除まで約15分**かかった（連打 01:04:05 → 解除は 01:19:06〜01:19:51 の間）。
⚠️ **観測の交絡を潰してある**: 30秒ごとの自分のプローブが延長している可能性を排除するため
**01:14:06 から完全に無負荷**にしたが、**それでもさらに5分以上ブロックが続いた**。
📌 **なぜ即座に発火したかは断定できていない。** ACL 作成（00:35）から連打（01:04）まで30分空いて
いたので「dev の遅延は ACL 作成直後だったせい＝教訓22 は恒久的な性質ではない」という説明は
立つが、**未検証の仮説として書いておく**。
🔑 **運用上の帰結**: 想像より**発火は早く・解除は遅い**。13 当日に admin ログインを連打して
自分が締め出されると **15分待つ**ことになる。防御が緩む方向ではないので切替の可否は左右しない。

#### 途中で立った別の疑いと、それを潰した実験

`/api/admin/auth` の 403 には**2つの説明が付いた** — WAF のブロックか、アプリの Origin 検査か。
さらに悪い可能性として「**POST がエッジで壊れている**」（5 の `oac-with-edge-signing` の失敗）もあった。
これは Stripe webhook・NextAuth・フォーム送信に及ぶのでレート制限より重大。

**区別する実験**（[[feedback-verification-baseline]]「2つの説明が付くなら区別する実験を先に」）:

| 実験 | 結果 | 分かること |
|---|---|---|
| 403 のヘッダと body を見る | `server: CloudFront` / `x-cache: Error from cloudfront` / CloudFront の HTML | **エッジ生成**。アプリなら JSON |
| Origin ヘッダの有無で変えて叩く | どちらも同じ 403 | アプリの Origin 検査**ではない** |
| `get-sampled-requests` | `AdminLoginRateLimit` の **BLOCK** | **どのルールか確定** |
| scope-down 外への POST（`/api/feedback`） | **AWS 400 / Vercel 400 で一致** | **POST は壊れていない**（疑いを排除） |

#### admin ログインも Vercel と同一挙動

| リクエスト | AWS | Vercel |
|---|---|---|
| POST `/api/admin/auth` body `{}` | **500** | **500** |
| POST `/api/admin/auth` 誤ったパスワード | **401** `{"error":"パスワードが違います"}` | **401** 同一 |

📌 **空 body の 500 は移行で入った不具合ではない**（両側一致＝元からの挙動）。
✅ 誤パスワードで「パスワードが違います」まで到達している＝ **`ADMIN_PASSWORD_HASH`（教訓37 で
161→168 に直したもの）が production で正しく読めている**ことの実証。教訓37 が残した
「そのパスワードのハッシュかは投入後に本人が確かめる工程」は、ここで半分回収できた
（正しいパスワードでの成功は TOTP 登録後）。

#### 残っている手作業

⏳ **`/admin/settings` で TOTP を登録し直す**。`ADMIN_TOTP_REQUIRED=true` を入れてあるので、
登録しないと **AWS 側の admin ログインがフェイルクローズで塞がる**。切替の前後どちらでもよいが、
**切替後に気づくと締め出される**。
✅ **2026-08-02 に完了**（`totp_last_step` に step が記録されている＝検証が実際に通った証拠）。

---

### 2026-08-02 — 13 の 4（**DNS 切替**）✅ **本番は AWS で稼働**

**`SubmittedAt: 2026-08-02T19:39:15Z`**（Route53 が返した時刻＝正本。教訓5 の「絶対日付は
操作した対象が返す時刻を正本にする」に従う）。**進捗 18/21。**

#### 切替直前の点検（すべて取り直した）

| # | 確認 | 結果 |
|---|---|---|
| 依存 F | 11（2026-08-01 17:50 UTC）から24時間 | ✅ 実行時 **19:28 UTC**＝門は1時間38分前に開いていた |
| 0-5 | main が緑 | ✅ 直近3 run とも success |
| §3-2 | production(`10e8229`) と `origin/main` のコード差分 | ⚠️ **出力あり**だが `sst.config.ts` の**コメントのみ**＝機能差ゼロ→再デプロイ不要 |
| 3-a/b | `www/` `/shop` `/shop/catalog` `/account` | 200 / 200 / 200 / **307**（Vercel も 307＝一致） |
| 3-c | apex `/shop?a=1` | **308** → `https://www.sikocoffee.com/shop?a=1` ＋ HSTS（Vercel と完全一致） |
| 3-d | **負の対照**（9 の漏れ） | ✅ `x-robots-tag` 無し・`www-authenticate` 無し |
| 3-e | Function URL | server / image-optimizer とも **`AWS_IAM`**、直叩き **403** |
| 3-g | 本番データ | エチオピア・コロンビア・ブラジル（Vercel と一致） |
| 3-i | production の cron | 4本とも **DISABLED** |
| — | CAA | `amazon.com` を含む5件（切替後 www は自ゾーンで CAA 評価になるので更新の前提） |

📌 **§3-2 のチェックは偽陽性を出した。** 判定が「`git log -- src/ sst.config.ts …` の出力が
空か否か」という**パス指定だけの粗さ**なので、コメント追記でも「コードが動いた」と出る。
→ **出力が出たら中身を `git diff` で見る**まで含めて手順とする（本作業で runbook を訂正）。

#### 🔴 runbook §4 が誤っていた — 1回目の UPSERT は拒否された

```
An error occurred (InvalidChangeBatch):
[RRSet of type A with DNS name www.sikocoffee.com. is not permitted because
 a conflicting RRSet of type CNAME with the same DNS name already exists in zone sikocoffee.com.]
```

runbook はこう書いていた:

> www は既存が CNAME なので、A（ALIAS）への UPSERT で型が変わる。
> **Route53 は同名の CNAME と A を共存させないため、UPSERT で置き換わる。**

**前半は正しく、後半が誤り。** 共存させないのは事実だが、その帰結は「UPSERT が置き換える」
ではなく **「拒否する」**。型をまたぐ差し替えは**同一バッチ内で `DELETE`＋`CREATE`** が要る。

✅ **実際に打った change batch**（apex は型が同じなので UPSERT のまま）:

| Action | Name | Type | 内容 |
|---|---|---|---|
| `UPSERT` | `sikocoffee.com.` | A | ALIAS → `d38zi1bm4zf9e3.cloudfront.net`（`Z2FDTNDATAQYW2`） |
| `DELETE` | `www.sikocoffee.com.` | CNAME | TTL 60 / `724b9301c41a7c8f.vercel-dns-017.com.`（**既存と完全一致**が要る） |
| `CREATE` | `www.sikocoffee.com.` | A | ALIAS → 同上 |

🔑 **救ったのは change batch のアトミック性。** 拒否された時点で **apex も www も無傷**である
ことを `list-resource-record-sets` で実測してから修正版を打った。もし部分適用される API
だったら、**apex だけ CloudFront・www だけ Vercel** という状態が本番に出ていた。
＝ **3レコードを1バッチにまとめたのは正しい**（www が引けない窓も生まれない）。

#### 切替後の確認（5-1・実 DNS＝`--resolve` 無し）

**権威 NS 4本すべて**で apex・www とも `143.204.80.{7,32,76,95}`、**旧 CNAME は消滅**。

| 確認 | 結果 |
|---|---|
| `www/` `/shop` `/shop/catalog` `/account` | 200 / 200 / 200 / 307 |
| apex `/shop?a=1` | **308** ＋ `location` ＋ HSTS |
| **3-d 負の対照** | ✅ `x-robots-tag` 無し・`www-authenticate` 無し |
| 配信元の直接証拠 | `via: … (CloudFront)` / **`x-amz-cf-pop: KIX56-P4`**（大阪） |
| 3-g 本番データ | エチオピア・コロンビア・ブラジル |
| 3-f WAF | `/admin` **202**（challenge）／`/shop` 200 |

🔑 **`x-amz-cf-pop` は「AWS が配信している」ことの直接証拠**で、HTTP ステータスの一致
（Vercel も同じ 200/307/308 を返す）**だけでは切替の成否を判定できない**。
＝ 切替の検証には**両者で必ず異なる値**を1つ入れること。

---

### 2026-08-02 — 13 の 5（後始末 5-1〜5-4）と、そこで起きた2つの障害

#### やったこと

| # | 内容 | PR |
|---|---|---|
| 5-1 | 実 DNS での再検証（全項目合格） | — |
| 5-4 | `ci.yml` の `matrix.stage` に `production` | #134 |
| 5-2 | Vercel に `AVATAR_*` 3本 ＋ IAM 確認 | — |
| 5-3 | `CRON_STAGES` に `'production'` ＋ **Vercel の発火窓の外へずらす** | #135 |
| — | cron 403 の修正（2回に分かれた） | #136 → **#137** |
| — | `CRON_SECRET` のローテーション | （コード変更なし・`sst secret set` ＋再デプロイ） |

**5-2 の前提は2つとも失効していた**（詳細は `pour-over-leftovers.md`）:
③ IAM は Vercel のキーが元から `AdministratorAccess` で満たされていた／
② 「本番のアイコンが 503」は **DNS 切替そのものが解消していた**（AWS 側に SST が3本注入済み）。
＝ 残った意味は**切り戻し時のパリティ**だけ。🔑 **積み残しは「なぜ要るか」を持たないと腐る。**

**5-3 の「切替後なら安全」も誤りだった**。DNS 切替は Vercel の cron を止めないので、
二重実行は 15（解約）まで続く。判断すべきは「切替が済んだか」ではなく**「二重実行を許容できるか」**。
🔴 **ずらし幅は「指定時刻」ではなく「発火窓」で決まる**（Vercel Hobby は**1時間**の flexible window。
最初 30分ずらす案を書いたが**窓の内側で無意味**だった）。

#### 🔴 障害1: production の cron が全滅（403）— #136 では直らず #137 で決着

詳細は**教訓41**。要点だけ:
**Function URL の `AWS_IAM` は「① `InvokeFunctionUrl`＝URL を使う許可」と
「② `InvokeFunction`＝関数を実行する許可」の2本を要求する。**
#136 は①だけを足して「直った」と判断し、**403 が続いた**。
dev の残骸 `FunctionURLAllowInvokeAction` の Action は**②**であって①ではなく、**似た名前を読み違えた**。
✅ #137 で決着。以後 cron は連続 200、アラームも自力で OK へ復帰。

#### 🔴🔴 障害2: **CloudFront の 5xx が3回スパイクしていたのに、当日は誰も（私も）気づかなかった**

**存在に気づいたのは、オーナーが Slack のスクリーンショットを見せてくれたから**である。
私は同じ夜に「アラーム6本すべて OK」と報告していた。**両方とも私の確認方法の誤りに由来する。**

**実測した全エピソード**（`describe-alarm-history` / `get-metric-statistics`・**すべて UTC**）:

| # | ALARM → OK | 5xx 率（実数） | 直前の出来事 |
|---|---|---|---|
| A | 08-02 01:24 → 01:40 | 01:15 **25%** / 01:20 **50%**（低トラフィック） | **13-2 の production 初回デプロイ**（01:00-01:01） |
| B | 08-02 19:55 → 20:01 | 19:50 **25.2%** / **302 req** | **DNS 切替の11分後**（19:39:15） |
| C | 08-02 21:03 → 21:18 | 20:55 **38.0%** / **287 req** | **#136 のデプロイ中**（20:51-20:56） |

平常時は5分あたり **2〜10 req** なので、B・C は **30〜100倍のバースト**を伴っている。
推定エラー応答数は B が約76件、C が約109件。

**切り分けの結果（すべてエラーゼロ）**:

| 見た先 | 結果 | 分かること |
|---|---|---|
| server Lambda `Errors` | **0**（呼び出しは 9 / 14 回のみ） | アプリは 5xx を返していない |
| server Lambda `Throttles` | **0** | 同時実行の枯渇でもない |
| server のログ | エラー・500 の記録なし | 同上 |
| image-optimizer | **呼び出し 0** | 画像経路ではない |
| Lambda@Edge（`WebEdgeFn`・4リージョン） | **`Errors` 0**（`INIT_START` は複数リージョンで有り） | 署名関数は失敗していない |
| CloudFront Function（12 の apex 正規化） | **呼び出し 302 / 287・エラー 0** | CFF でもない |

🔴 **CloudFront が 302 req を受けたのに server Lambda は 9 回しか呼ばれていない**
＝ **5xx はオリジンに到達する前にエッジで生成されている。**

🔴🔴 **そして、それ以上は追えない。** `aws cloudfront get-monitoring-subscription` は
**`NoSuchMonitoringSubscription`**（追加メトリクス未設定＝502/503/504 の内訳が無い）、
**標準アクセスログも未設定**（R-4 の未着手項目）。
＝ **原因の特定は原理的に不可能で、次に同じことが起きても同じく分からない。**

📌 3件に共通するのは「**CloudFront のキャッシュが空の状態で、初めてトラフィックが流れた瞬間**」。
A は初回デプロイ直後、B は DNS 切替直後、C はデプロイによるキャッシュ無効化直後。
**仮説どまりであることを明記する**（裏を取る手段が無いため）。

🔑 **負の対照が1つ取れた: デプロイ単独では起きない。**
`#134`（20:01-20:06）・`#135`（20:25-20:30）・`#137`（22:26-22:32）、および
`CRON_SECRET` ローテーション後の**手動デプロイ（08-03 01:1x UTC）**では
**5xx は1件も出ていない**（22:40 UTC 以降のスパイクはゼロを実測）。
＝ **「デプロイすれば必ず 5xx」ではない。** 5xx が出た3回はいずれも
**同時に 300 前後のリクエストバーストが来ていた**（平常の30〜100倍）。
→ 疑うべきは「デプロイ」ではなく **「キャッシュが空の状態 × バースト」の組み合わせ**。
ただし**バーストの正体（どのクライアントが何を要求したか）はアクセスログが無いので不明**。

#### 🔑 この障害から得た、手法そのものの誤り2件 → 教訓42・43

---

### 2026-08-03 — C-1: クライアント側 Sentry の `environment`（soak 中に「どちらで起きたか」を言えるようにする）

#### なぜ今やったか（着手前に理由を測り直した）

Pour Over 1 で server と edge は `environment` を持ったが、**クライアントだけが未タグのまま**だった
（`STAGE` も `VERCEL_ENV` も `NEXT_PUBLIC_` が無く、ブラウザ用バンドルに入らないため別タスクに切り出された）。
🔑 **soak（14）は AWS と Vercel の両方が本番を担う**ので、タグが無いと
**クライアント由来のエラーがどちらで起きたのか区別できない**。
＝ この負債は soak 期間に**いちばん高くつく形**で効く。

🔴 **この失敗は静かで、しかも「事故」の顔をしていない。** クライアントで `getStage()` を呼んでも
例外は出ず `undefined` が返るだけなので、**「ステージ不明」が既定値のように見える**。

#### やったこと

| 変更 | 内容 |
|---|---|
| `next.config.ts` | `env: { NEXT_PUBLIC_STAGE: process.env.STAGE ?? process.env.VERCEL_ENV ?? '' }` |
| `src/lib/stage.ts` | `getClientStage()` を追加（`getStage()` はクライアントで使えない旨も明記） |
| `src/instrumentation-client.ts` | `environment: getClientStage() ?? 'development'` |
| `src/__tests__/stage.test.ts` | 回帰5件（空文字を未設定として扱う／サーバ変数にフォールバックしない） |

🔑 **`getStage()` と同じ式を、実行時ではなく「ビルド時」に評価している。**
AWS では SST が build プロセスへ `STAGE` を渡し、Vercel ではビルド時に `VERCEL_ENV` が入る。
📌 **これは docs ではなく SST のソースで確かめた**（`platform/src/components/base/base-ssr-site.ts` の
`buildApp` が `environment: { ...process.env, ...(environment ?? {}) }` として build の env に流し込む）。教訓34 と同じ姿勢。

📌 **Vercel が自動公開する `NEXT_PUBLIC_VERCEL_ENV` は使わなかった。** あれはプロジェクト設定の
トグル依存で、`isVercelPlatform()` の `VERCEL` と同じ「必ずあるとは言い切れない」弱さを持つ。
**自前でビルド時に焼き込めば、その不確かさを1つ持ち込まずに済む**（＝依存する外部条件を減らした）。

#### 🔑 検証は「テストが緑」で止めず、**実ビルドの成果物**を見た

vitest が固定できるのは**読み出し側の意味論だけ**で、
**値がバンドルに焼き込まれること自体は単体テストでは確かめられない**（教訓27 と同型＝
「型が通った」「テストが緑」は「読まれている」の証明ではない）。
→ **本番ビルドを3回回し、`.next/static/` の中身を直接見た**:

| ビルド時の env | 生成された客体 | 何の対照か |
|---|---|---|
| `STAGE=c1sentinelaws` | `…4511541925642240",environment:"c1sentinelaws",…` | **AWS 経路**の正の対照 |
| `VERCEL_ENV=c1sentinelvercel` | `…4511541925642240",environment:"c1sentinelvercel",…` | **Vercel 経路**の正の対照 |
| どちらも未設定 | `…environment:(void 0)??"development",…` | **負の対照**（空文字にならないこと） |

🔑 **センチネル値を使ったのは、`production` のような実在する値だと
「焼き込まれた」と「たまたま他所に出てきた」を区別できないから。**
バンドルを grep して確かめる種類の検証では、**探す文字列自体を一意にしておく**必要がある。
📌 3本目で分かったこと: `env` に空文字を渡すと Next.js は**キーごと落とす**（`(void 0)` になる）。
`getClientStage()` の `|| undefined` はどちらの実装でも正しく効く。

🔴 **未検証で残るもの**: Sentry のダッシュボードに実際に `environment: production` の
クライアントイベントが並ぶところまでは見ていない（**デプロイ後に人が見る工程**）。
「バンドルに入った」までが機械で言えることの限界。教訓36 と同じ線引き。

---

### 2026-08-03 — 14（soak）初日の実測

切替（`2026-08-02T19:39:15Z`）から約21時間。**状態だけでなく履歴を、両リージョンで**測った（教訓42・43）。

#### 結論: 新しい異常はゼロ。ただし**まだ一度も走っていない cron が2本ある**

| 対象 | 実測 | 判定 |
|---|---|---|
| アラーム（**2リージョン12本**） | 状態は全 OK。**履歴の状態遷移は3件**で、すべて 08-02 の既知分（5xx の B・C ＋ cron 403） | 🟢 **08-02T22:36Z 以降 18時間、遷移ゼロ** |
| CloudFront 5xx | 24h で非ゼロは2バケットのみ＝**B・C と同一**。以降ゼロ | 🟢 |
| CloudFront リクエスト | **1,050 req / 24h** | 🟢 平常 |
| cron `release-reservations` | **109回連続 200**（08-02T22:35Z〜）。10分間隔が `cron(5/10 …)` どおり | 🟢 |
| cron `cleanup-pending` / `po-timeouts` | **48時間 実行なし** | 🔴 **下記** |
| cron `instagram-refresh` | 未実行（初回は 08-09 03:30Z）。`refreshedAt` は `2026-08-01T00:21:11Z` のまま＝失効 2026-09-30 | 🟢 予定どおり |
| server Lambda | 248 invocations / **コールド率 55.2%** | ⚠️ **B-2 の判断材料が揃った** |

#### 🔴 `cleanup-pending` と `po-timeouts` は production で**まだ一度も成功していない**

どちらも日次 20:00 / 20:20 UTC で、**5-3 の有効化（#135 のデプロイ 08-02 20:25-20:30）がその時刻を過ぎた後**だった。
翌日の枠＝ **2026-08-03T20:00Z / 20:20Z が初回**。

🔑 **5-3 の検証計画にこの2本が入っていなかった。** 当時書いたのは
「① `release-reservations` は有効化の5〜10分後に撃つ ② `instagram-refresh` は 08-09」の2段で、
**日次2本は「そのうち走る」として扱われていた**。実際には有効化のタイミングの都合で
**丸1日ぶん空いていた**のに、`release-reservations` の 200 を見て「cron は健全」と言えてしまう。
🔴 **1本の実行実績を他の本の根拠にしない** — これは 08-02 に Vercel 側で得た教訓
（「Vercel の cron は本ごとにまだら」）と**まったく同じ形**で、移設先でも成立した。
📌 サービス影響は無い。soak 中は Vercel の cron が生きており、**元々動いていたのはこの2本**である。

#### 🔴 集計の窓が修正を跨ぐと、直った事実が数字に埋もれる（教訓42 の時間方向の続き）

24時間で数えると cron は **200 が109回・403 が36回**で、素直に読めば「まだ2割が失敗している」。
実際は **403 の最後が 08-02T22:28:43Z、200 の最初が 08-02T22:35:45Z**、
#137 のマージが **22:26:37Z** ＝ **綺麗に分かれており、修正後の失敗は1件も無い**。
🔑 **窓の中に修正が入っているなら、合計ではなく「修正の前後で分けた並び」を見る。**
合計は「直っていない」にも「直った」にも読めてしまい、**どちらに読むかは先入観が決める**。

#### 🟢 R-4（アクセスログ）が初めて「原因を言える」側で働いた

24h の内訳は **308×108 / 301×48 / 200×46 / 404×22 / 307×1 / 000×1 ＝ 5xx はゼロ**。
🔑 **`301` が48件あるのは異常ではなかった。** 12（apex 正規化）は **308** のはずなので一瞬疑ったが、
ログの `cs-protocol` を見ると **48件すべて `http`** ＝ CloudFront の redirect-to-https による 301 で、
アプリの 308 とは別の層。**R-4 が無ければ「301 が出ている」で止まり、
12 が壊れた疑いを晴らせなかった**（08-02 の 5xx がまさにその状態だった）。
📌 中身はほぼ**脆弱性スキャナ**（`/.env` `/wp-config.php` `/phpinfo.php` `/.gitconfig`
`/xmlrpc.php` `/composer.json` `/.cursor/rules`）。負の対照として https で直接叩き、
**4本とも 404**であることを確認した（200 が無いこと）。

#### ⚠️ B-2（warmer）の待ち条件が満たされた — 本番のコールド率は **55.2%**

| | 本番（24h・n=248） | 参考: dev（7 の実測時） |
|---|---|---|
| コールド率 | **55.2%**（137/248） | 15.6% → 3.2% |
| コールド Duration | p50 **1,157ms** / p90 1,281ms / max 2,728ms | p50 1,068ms |
| ウォーム Duration | p50 **124ms** / p90 351ms | p50 51ms |
| `maxMemoryUsed` | p50 158MB / max 220MB（割当 2048MB） | 230MB |

🔑 **dev の 3.2% とは桁が違う。** 理由はトラフィックの薄さで、
**1,050 req/24h のうち Lambda に届くのは 248**（CloudFront が約76%を吸っている）。
＝ **実ユーザーが来るときはほぼ必ずコールドを踏む**（p50 で約9倍・1秒強の上乗せ）。
📌 **判断はオーナーに委ねる**。数字は揃ったが、この 248 の大半はスキャナで、
**実ユーザーのために払うかどうか**はコストの話（`warm` は常時ウォーム分の課金が乗る）。
7 と同じく「1デプロイで2変数動かさない」ので、やるなら **B-1（arm64）とは別に**測る。

---

### 2026-08-03（続き） — C-1 の本番実測 → C-2 / R-9 / soak の終了条件

#### C-1 は本番の実ブラウザで確認できた（PR #141 マージ後）

`SST Deploy (dev)` `(production)` とも success。本番ページで `window.__SENTRY__` を辿り、
クライアントの実効設定が **`environment: "production"`** であることを確認した。
＝ PR に「残る未検証（デプロイ後に人が見る工程）」と書いた項目を実測で閉じた。
📌 デプロイ後の 5xx とアラーム遷移も**ゼロ**（08-02 は3回ともデプロイ／切替の直後だったので意図して見た）。

#### 🔴 その実測が C-2 の範囲を広げた — 100% は edge **と client** の2か所だった

同じプローブが **クライアントの `tracesSampleRate: 1`** を返した。
積み残しには「C-2 = `sentry.edge.config.ts`」と**1か所として**書かれていたが、実際は2か所。
🔑 **「探しに行った項目」ではなく「ついでに見えた値」で見つかった。**
実効設定をまとめて読み出すと、**調べようとしていなかった隣の値まで一度に検算できる**。

対処: 率の決定を **`tracesSampleRateFor(stage)`** に集約し、server / edge / client の3ファイルを
そこへ寄せた（本番 10% / それ以外 0%）。**server の式が元から正解**だったのでそれを昇格させた形。
🔑 **なぜ soak 中に効くか**: 本番トラフィックの大半は脆弱性スキャナ（同日実測）。
100% 送信は **価値の無いトレースでクォータを先に使い切り、本当に見たいエラーを落とす**。

**検証は C-1 と同じく成果物で、両方向**:

| ビルド | クライアントチャンクの実体 |
|---|---|
| `STAGE=production` | `function sb(){return"production"}` ／ `tracesSampleRate:.1*("production"===sb())` |
| `STAGE=dev` | `tracesSampleRate:0`（定数に畳まれる） |
| 負の対照 | **`tracesSampleRate:1` の出現は 0 件** |

📌 minifier は `stage === 'production' ? 0.1 : 0` を **`.1*(...)`（真偽値との乗算）**に書き換える。
`grep 'tracesSampleRate:[0-9.]*'` だけ見ると `.1` で切れて**式の残りを見落とす**ので、
**区切りまで含めて取る**こと。

#### R-9: 半分は実施、半分は「やらない」に降格（理由を測り直した）

- ✅ **Access Analyzer（外部アクセス）を有効化** — `scripts/bootstrap-access-analyzer.sh`。
  **ap-northeast-1 と us-east-1 の2つ**（Analyzer は**リージョン単位**で、片方だと
  Lambda@Edge・WAF・CloudFront 系が母集団から抜ける＝教訓43 と同じ穴）。冪等性は2回目の実行で実測。
  🔑 **採用理由が一般論ではない**: 教訓41 で 8 の検証を無効にした
  **dev の `Principal:"*"` 残骸は、まさにこの Analyzer が挙げる対象**。
  あのとき有効なら一覧に載っていた。**「残骸だから無害」は測定ではなく分類**だった、の再発防止にあたる。
  ⚠️ 作成直後の findings 0件は**初回スキャン前**なので根拠にしない（教訓27 と同型）。
- ⬇️ **IAM パスワードポリシーは見送り**。測ったら **IAM ユーザーは1人（`shun`）・MFA 済み**で、
  効く対象がほぼ無い。`MaxPasswordAge` を入れれば**唯一の管理者を締め出しうる**。
  🔑 **「無料だから」はやる理由にならない**（維持と注意の対象は増える）。
  5-2・5-3 と同じ「**一般論のまま持ち越された作業は、理由を測ると消える**」の3例目。

#### 🔴🔴 Access Analyzer が**初回スキャンで教訓41 の残骸を挙げた**（有効化した当日）

有効化の理由に書いた「あのとき有効なら一覧に載っていた」が、**その場で裏取りされた**。

| リージョン | 検出されたリソース |
|---|---|
| ap-northeast-1 | **`siko-coffee-dev-WebServerApnortheast1Function`** / **`siko-coffee-dev-WebImageOptimizerFunction`** / `siko-coffee-github-deploy`（設計どおり＝GitHub OIDC を信頼） |
| us-east-1 | `siko-coffee-github-deploy`（IAM はグローバルなので両方に出る） |

**dev の2関数には `Principal:"*"` の statement が2本ずつ残っている**（教訓41 の「2本ペア」の両方）:

| Sid | Action | Condition | 効くか |
|---|---|---|---|
| `FunctionURLAllowPublicAccess` | `lambda:InvokeFunctionUrl` | `lambda:FunctionUrlAuthType = NONE` | ❌ **不活性**（実際の AuthType は `AWS_IAM`） |
| `FunctionURLAllowInvokeAction` | `lambda:InvokeFunction` | `lambda:InvokedViaFunctionUrl = true` | ⚠️ 条件は成立するが、①が無いと到達できない |

🟢 **production は対照的に 4 statement・`Principal:"*"` はゼロ**（`Service: cloudfront` 2本＋
CronRelay ロール 2本）。「production は最初から protection 付きで作られ残骸が無い」を実測で再確認。

🔑 **現時点では不活性だが、放置してよい理由にはならない。**
- **#137 は cron を直したが、残骸は消していない**＝ **dev は今も構造的に production より緩い**。
  「dev で実測検証済み」という根拠は、**8 のときと同じ弱さを今も持っている**。
- `AuthType` を一度でも `NONE` に戻すと ① が即座に復活し、**Function URL が公開に戻る**。
  不活性さが**別の設定に依存している**＝それ自体が罠。
🔑 **「残骸だから無害」は測定ではなく分類**（教訓41）の続き。今回**測って**「無害だが
パリティを壊している」と分かった＝ **無害さと、無害である理由は別に確かめる**。

✅ **除去済み（2026-08-03T17:50Z 頃・オーナー判断のうえ実施）。dev と production のパリティが回復した。**

| 対象 | 除去前 | 除去後 | production（対照） |
|---|---|---|---|
| dev server | statement 6 / `Principal:*` **2** | **4 / 0** | **4 / 0**（同型） |
| dev image-optimizer | statement 4 / `Principal:*` **2** | **2 / 0** | — |

**負の対照・不変条件はすべて維持**:
- Function URL 直叩き **403**（除去前も 403＝**ベースラインを先に取ってある**）
- `AuthType` は **`AWS_IAM`** のまま（除去で緩んでいない）
- 🔑 **決め手は dev の cron**。歴史的に残骸へ依存していたのがここだから。
  **17:55:07Z（除去後）に `release-reservations` が `status=200`** ＝
  #137 が入れた明示の2本ペアだけで通ることを実測した。
  ⚠️ 直前の 17:45:07Z も 200 だったが**それは除去前**＝根拠にしない。
  **窓を除去時刻より後に切ってから数えた**（教訓42 の「窓が変更を跨ぐと混ざる」を今回は先回りした）。

📌 **未確認が1つ残る: 次の dev デプロイで SST が作り直さないか。** 残骸なら作り直されないはずで、
**#142 のマージが自動的にその実験になる**（`matrix.stage` に dev が含まれるため）。


#### 🔴 14（soak）に終了条件が無かった → S-1〜S-6 を新設

正本に書いてあったのは「Vercel を生かす」＝ soak 中の**禁止事項**だけで、
**いつ終わるのか・何が満たされたら 15 へ進めるのか**がどこにも無かった。
🔑 **終了条件の無い観測期間は両方向に転ぶ**（早すぎる解約／惰性の長期化。後者は
15 が止まると決済再開と E-4 まで止まる）。詳細は `pour-over-leftovers.md`。
📌 現況は **S-1 が 1/4**（cron 4本のうち成功は `release-reservations` のみ）で、
最短の到達見込みは **2026-08-09〜08-10**。

---

## 教訓

他の作業にも移植できる形で残す。

### 1. 「無言で失敗する」ものは、手順書ではなく実行可能な形で防ぐ

`next/image` の件は **npm 10 でビルドすると壊れるのにデプロイは成功する**という性質だった。
Next.js が変換の例外を握りつぶすためログにも残らない。
最初の対策は「手順書に npm 11 必須と書く」だったが、**作業マシンの npm は実際に 10 のままで、
再発条件が揃っていた**。`engines` を書いても警告にしかならない。

→ **壊れうる場所そのものにゲートを置く。** `scripts/deploy.sh` に前後処理を閉じ込め、
入口を1つにした。「手順を覚えている人だけが正しく実行できる」状態を残さない。

### 2. 「残骸」は稼働状況を実測してから判定する

Amplify アプリは棚卸しで「旧構成の残骸」に分類されていた。実際は
**`main` の autoBuild が有効で、調査当日もビルドが成功し、公開コピーが 200 を返していた**
（通算124ジョブ／直近はすべてドキュメント PR）。しかも `AdministratorAccess-Amplify` を持つ
サービスロールが push のたびに動いていた。

→ **「使っていないはず」は状態ではなく推測。** `list-*` で存在を見るだけでなく、
最終ビルド時刻・ロールの最終使用日時・実際の HTTP 応答まで見る。

### 3. 前提の修正は「直したら試す」までがワンセット

CAA に `amazon.com` を足した時点では「依存 H 解消」と書けたが、**実際に証明書を要求すると
www は `CAA_ERROR` で失敗した**。原因は自分のゾーンではなく **Vercel 側の CAA** だった。

```
www.sikocoffee.com → CNAME → 724b9301c41a7c8f.vercel-dns-017.com
                              CAA: sectigo / globalsign / letsencrypt / pki.goog（amazon.com なし）
```

RFC 8659 は「検証対象がエイリアスなら CNAME 先で CAA を評価する」と定める。
つまり **CAA は自分のゾーンだけ見ればよいものではない。** 移行元が DNS ホスティングを
兼ねている場合、この依存が残る。

しかも 12 の時点では www はまだ Vercel を向いている必要がある（証明書が無いと CloudFront で
HTTPS を張れない＝鶏と卵）。**TTL 引き下げ・WAF・アラームを済ませた後で詰まるところだった。**

→ **前提を直したら、その場で本番と同じ形で試す。** 試験発行は数分で、追加コストもゼロだった。

### 4. 削除は順序と再利用を意識する

- Amplify の domain association を先に消さないと、その検証レコードが消せない状態になっていた。
- 一方で association を消しても **Amplify は検証 CNAME を自動削除しなかった**（手動で消す必要があった）。
- そして **ACM の検証トークンは決定的**で、証明書を作り直すと同じ名前が復活する。
  「孤児だから消してよい」と「消したら二度と要らない」は別の話。

### 5. 依存は、可能なら相対順序ではなく絶対日付にする

「8 → 15（Instagram トークンは月次 cron で延長。60日止まると恒久失効）」は正しいが、
実際に効くのは **「失効は 2026-08-30、次の更新機会は 2026-08-01」**という日付だった。
実測（`refreshedAt` と `expiresIn`）から出せる。
✅ **その 8/1 の機会は実際に成功し、失効は 2026-09-30 へ後退した**（上の「依存 L の確認」の節）。
＝ 日付にしておいたおかげで**当日に確認すべきことが一意に決まった**。

→ **順序制約のうち、時間が理由のものは日付に変換しておく。** 監視方法も一緒に書く。

### 6. IaC 管理下のリソースを CLI で触らない

権限の許可リストを作る際、WAF・SNS・CloudWatch・EventBridge（SST の管理外に自分で作るもの）は
許可し、**CloudFront と Lambda の設定変更は意図的に除外**した。CLI で直接いじると Pulumi の
state と実体がずれ、次の `sst deploy` が意図せず巻き戻すため。

→ **「危ないから禁止」ではなく「管理主体が別だから禁止」。** 理由が違えば例外の扱いも変わる。

### 7. 調査ツールの射程を先に確かめる

Vercel の runtime ログで cron の実行有無を追おうとしたが、**`since=24h` と `since=1h` の結果が
完全に一致**した＝保持は約1時間で、cron の実行時刻は射程外だった。
「ログが無い」は「実行されていない」の証拠にならない。

→ **道具の限界を測ってから結論を出す。** 同じ理由で「Hobby は cron 2本まで」という仮説も
公式ドキュメントで否定した（現在は100本/プロジェクト）。

### 8. 疑いは実測で潰す（悪い方にも良い方にも転ぶ）

`protection: "oac-with-edge-signing"` は Host ヘッダを書き換えるため、CSRF チェック・NextAuth・
パスキー・checkout が全部壊れるのではないかと疑った。実際には
**ORP が元から `Managed-AllViewerExceptHostHeader` で、CFF が `x-forwarded-host` に退避しており
壊れない**ことが、ポリシーの確認と dev への実プローブで分かった。

副産物として「**直叩きでは CFF を通らないので `x-forwarded-host` を偽装できる**」という
別のリスクが見つかり、タスク5を最優先にする根拠が増えた。

→ **疑いを寝かせない。** 潰しに行くと、たいてい別のものが出てくる。

### 9. 「置き換え」は、移行期に両方が生きることを勘定に入れる

`VERCEL_ENV` → `STAGE` は字面どおりなら単純な置換だが、**14（soak）の間は AWS と Vercel の
両方が本番を担う**。素直に置換すると **`STAGE` を持たない Vercel 本番が preview テーブルを向き**、
本番サイトが空のデータを読む。実際には置換ではなく `STAGE ?? VERCEL_ENV` の**併存**が正解で、
消せるのは Vercel を解約した後（16）だった。

→ **移行タスクの「旧を新に置き換える」は、たいてい「新を足す」→「両方で動かす」→「旧を消す」の
3段である。** 消す段を最初から別タスクとして順序表に書いておく（今回は 16 の削除リストに ⑥ として追加）。

### 10. 状態表は実体より先に古くなる

第0群は4件とも終わっていたのに、実行順の表・`sst.config.ts` の索引・後始末メモの
**3か所が「未」のまま**残っていた（作業した本人以外には、どれが本当か判別できない）。
一方で「まだ終わっていない」と書かれた作業が実は済んでいた例もあった。

→ **着手前に、記録ではなく実環境に問い合わせる。** 今回は予算・CAA・Amplify・証明書を
`aws` CLI と `dig` で数分で確認できた。**状態は書いた場所の数だけ古くなる**ので、
完了を書くときは正本1か所に寄せ、他所からは参照させる。

### 11. 観測は「2系統に出す」まで含めて1つの機能

タスク2 で開けてみると、cron 4本の失敗は**どれも1系統にしか出ていなかった**。3本は Sentry だけ
（DSN 未設定・ネットワーク遮断・CSP のどれかで消える）、`instagram-refresh` は `console.error` だけ
（しかも fetch が非 200 のときの1本のみで、`fetch()` の例外と `PutCommand` は裸）。
**どちらも「観測している」と書けてしまう**のに、片方が落ちた瞬間に無音になる。

→ **失敗の通知先は必ず2系統**（プロセスの標準出力＋外部サービス）。外部サービスは
環境変数1本で無効化されうる前提で書く。この教訓は移行に固有ではないので
メモリ側（`feedback-error-visibility`）にも寄せてある。

### 12. 「実行されたか」と「実行されて0件か」は別の情報

`release-reservations` の件は、**データ側の副作用（`reservedG` が変わらない）から
「実行されていない」を逆算する**しかなかった。ログに「開始した」「終わって0件だった」が
出ていれば数秒で切り分けられた話で、逆算に費やした調査は丸ごと不要だった。

→ **定期実行するものは、成功時こそ件数つきで記録する。** 異常時だけ書くログは
「異常が無かった」と「動いていなかった」を同じ姿（無言）にしてしまう。
タスク2 の `cronDone` はこのために入れた（EventBridge 移行後は CloudWatch だけで判別できる）。

### 13. 握り潰す `catch` は「想定内の失敗」を名指しで許す

`cleanup-pending` の `catch {}` は「条件不一致（すでに paid）はスキップ」のつもりだったが、
実際には**スロットリングも権限不足も同じ穴に落ちて**いた。結果は「毎回 `deleted: 0`」で、
正常なのか壊れているのかを区別できない。`instagram-refresh` の `GetCommand` も同じ形で、
こちらは「項目なし」を想定していたが**項目なしは例外にならない**ため、
握り潰していたのは**本物の異常だけ**だった。

→ **`catch` で無視してよいのは、名前で特定できる想定内の失敗だけ**
（今回は `ConditionalCheckFailedException`）。それ以外は必ず報告に回す。
「想定していたケースが、そもそも例外にならない」というズレも同時に疑う。

### 14. 確認に使う指標が「変更前でも同じ値」を返さないか、先に確かめる

タスク3 の期待結果は「`/_vercel/insights/script.js` の 404 が消える」だったので、
`next dev` の HTML から `_vercel` を grep して「消えている」ことを確認した。**通ったつもりだった。**
実際には **dev モードは別のスクリプト（`va.vercel-scripts.com` の debug 版）を読む**ため、
その文字列は**変更前でも出ていなかった**。つまりあの grep は、何も検証していなかった。

気づけたのは、逆方向（`VERCEL_ENV` を与えたら出るか）を試したときに**それでも出なかった**ため。
片方向だけ見ていたら、そのまま「検証済み」として PR を出していた。

→ **「変わったこと」を確認する前に、「変わる前はどうだったか」を同じ手段で測る。**
ベースラインが取れない指標（＝変更前後で同じ値になる指標）は、検証に使ってはいけない。
両方向を試すのは、その安上がりな代用になる。

### 15. 方式を替えると「順序が担保していた安全性」が黙って外れる

タスク4 は「Blob に置く」を「S3 に置く」に替えただけのつもりだったが、
サーバ経由 → presigned に替えた時点で **検閲 → 保存** が **保存 → 検閲** に逆転していた。
Blob 版で「落ちた画像は保存されない」を保証していたのは**コードではなく順序**で、
その順序は移送の対象として意識に上らない。

しかも対策には強さの差がある:

| 対策 | 強さ |
|---|---|
| 同一バケットの `pending/` を CDN のビヘイビアで塞ぐ | **運用**で保証（設定を1つ間違えると公開される） |
| バケット自体を分ける | **構造**で保証（公開される場所に未検閲物を置けない） |

→ **「同じことを別の方式で」やるときは、旧方式で*何が何を*保証していたかを先に書き出す。**
特に**順序・経路・置き場**が変わるなら、そこに寄りかかっていた保証は必ず作り直す。
作り直すときは、運用で守る形より**構造で守れないか**を先に探す。

### 16. 実行順は「依存」だけでなく「その時点で存在するもの」でも決まる

タスク4 の依存関係（B: 5 と 4）は満たしていたのに、着手して初めて
**「4 の時点では AWS の production ステージがまだ無い」**という壁に当たった。
アップロード先と公開経路をサイト本体より先に用意する必要があり、
「サイトの CloudFront に相乗りする」という自然な設計が**そもそも選べなかった**。

依存表は「A の後に B」という**相対順序**しか表現しておらず、
「B が動くには C が存在している必要がある」という**存在条件**を持っていなかった。

→ **実行順を組むときは、各タスクが要求する土台がその時点で存在するかまで確認する。**
移行では「切替前は旧環境が唯一の本番」という状態が長く続くので、
**切替より前に入るタスクは、旧環境だけで成立するか**を必ず問う。

### 17. 同じ箇所を触る PR を並行させない（squash マージとスタック PR）

タスク3 と 4 はどちらも `docs/` の同じ場所に追記するため、4 を 3 の上に積んだ。
結果2つ困った: ① **CI が走らなかった**（`ci.yml` の `pull_request` は `branches: [main]` 限定で、
base が別ブランチだと lint も E2E も対象外）② 3 が **squash マージ**された瞬間に
「まとめられた1コミット」と「元のコミット」が並んで**衝突した**。

解消は `git rebase --onto origin/main <旧base> <ブランチ>` で、squash 済みのコミットを落として
新しい main に載せ直すだけ。**衝突の中身を解く必要はなかった**（重複していただけなので）。

→ **同じファイルの同じ箇所を触るなら、並行させず順に出す。** 積むなら
**CI がその base で走るか**を先に確かめ、squash マージ運用なら
「マージ後は解決ではなく `--onto` で載せ替える」と覚えておく。

### 18. 「検査対象から外してある」ものは、外した理由ごと風化する

`sst.config.ts` は `tsconfig.json` の `exclude` に入っている。理由は正当で
（`$config` / `sst` / `aws` のグローバルは `sst install` が生成する gitignore 対象の
`.sst/platform/config.d.ts` から来るため、CI には存在しない）、コメントにも
「検証は `npx sst install` 後にローカルで行う」と書いてあった。

問題は、**その「ローカルで行う」に実行可能な形が無かった**こと。専用の tsconfig も
npm script も無く、`.sst` は誰の作業ツリーにも生成されていなかった（main リポジトリにも
worktree にも無かった）。つまり **インフラ定義そのものである1ファイルだけが、
誰にも型検査されないまま何度も編集されていた**。

→ **除外は「検査しない」ではなく「別の経路で検査する」と読み替える。**
除外した瞬間に、その代替経路を**コマンド1つで走る形**にしておく
（今回は `tsconfig.sst.json` ＋ `npm run check:sst`）。教訓1と同じ構図で、
違いは「壊れうる場所」ではなく「見えなくなる場所」にゲートを置く点。

### 19. 型検査も「効いていること」を負の対照で確かめる

`protection: 'oac-with-edge-signing'` を足して `tsc` が通ったが、それだけでは
**「プロパティが検証された」のか「そもそも見られていない」のか区別できない**
（`include` を1つ書き間違えるだけで後者になる）。そこで値をわざと
`'bogus-value-xyz'` に替えて走らせ、`TS2322` で落ちることを確認した。
エラーに union の全候補が出るので、**正しい綴りであることまで同時に裏が取れた**。

→ **教訓14（ベースラインを取る）は型検査にも当てはまる。** 通ったことより
「落ちるべきものが落ちるか」のほうが情報量が多い。負の対照は数十秒で済む。

### 20. 「本番で使い始める」タスクは、本番の受け皿が出来る時点より前倒しできない

4 は第1群（13 より前）に置かれ、手順②は「`AVATAR_*` を **Vercel 側にも**入れる
（soak 期間は同じバケットを共有する）」と書いてあった。しかし soak は 14 で、
**そこで共有される「同じバケット」とは production ステージのバケット**である。
それが出来るのは 13。つまり **4 の②は、13 より前には原理的に実行できない手順**だった。

実際に取れる道は3つで、どれも代償がある:

| | 代償 |
|---|---|
| dev のバケットに本番を向ける | 本番ユーザーの画像が dev 名義に入る。dev は 5〜9 の検証で作り直す場所で、`sst remove --stage dev` がユーザーデータを消す |
| production ステージを前倒しでデプロイ | 13 より前にサイト本体の CloudFront・server Lambda・Lambda@Edge が本番 DynamoDB 権限つきで無人稼働する |
| **13 まで 503 のまま据え置く**（採用） | アイコンの新規設定だけができない。本番の `avatarUrl` 保持者は **0件**なので実害はほぼ無い |

→ **教訓16（存在条件）の続き。** 16 は「B が動くには C が存在している必要がある」だったが、
今回はさらに **「タスクの一部分だけが後段の存在条件に縛られる」**形だった。
実行順表は**タスク単位**でしか順序を持てないので、**手順の中に後段依存が混ざっていないか**を
書く時点で点検する。混ざっているなら、その手順は**別タスクとして後段に切り出す**
（今回は 4 の②③を 13 の直後へ移すのが正しかった）。

### 21. 検査の「経路」が測りたいものを通っているか（教訓14 の再発）

5 の検証で「Origin 詐称が 403 になるか」を見ようとして
`/api/account/avatar/upload-url` に POST したが、**正しい Origin も詐称も欠落も全部 401** だった。
CSRF チェックは `src/middleware.ts` の `matcher`（`/admin/*` と `/api/admin/*`）にしかなく、
**このルートはそもそも middleware を通らない**うえ、ルート側が最初に `auth()` を見るためである。
つまり3通りとも同じ値を返す＝**何も判別していない指標**だった。

`/api/admin/*` に替えたら 404 / 403 / 403 に割れ、初めて意味のある検証になった。

→ 教訓14 は「変更前後で同じ値」を戒めていたが、今回は **「条件を変えても同じ値」**という
別の顔だった。共通しているのは **指標が測定対象に反応するかを先に確かめていない**こと。
→ **プローブを撃つ前に「この経路は測りたいコードを通るか」を確認する。**
反応することは、**わざと落ちる条件を1つ混ぜれば**その場で分かる。

### 22. 「効いていない」と「まだ効いていない」を、時間を置かずに判定しない

6 のレート制限をデプロイ直後に検証したとき、`/api/admin/auth` への **80連打が全部 405** で
素通りした。設定は正しいのに「移行に失敗した」と読める結果である。
実際は AWS のレートベースルールが **約30秒ごとに直近の窓を再集計する**ためで、
同じプローブを **T+45s に撃ち直したら 40/40 が 403** になった。

Vercel の `fixed_window` は窓の境界で即座に切り替わるので、この遅れは移行で新しく現れた性質だった。

→ **状態が非同期に伝播する統制（WAF・CDN・DNS・IAM）は、1回の観測で結論を出さない。**
→ 判定する前に「この仕組みの状態は何秒で伝わるか」を先に調べ、**その周期をまたいで2回測る**。
教訓14・21 は「指標が反応するか」を問うていたが、これは **「いつ反応するか」** を勘定に入れる話。
1回目の素通りを設定ミスと解釈して config をいじり始めていたら、正しい設定を壊していた。

### 23. 成否の判定に使っている値が、本当にそのコマンドの成否か

7 のデプロイを `npm run sst:deploy -- --stage dev 2>&1 | tail -60` の形で流したところ、
**「exit code 0」＝成功**として返ってきた。実際にはビルドが
`Module not found: @aws-sdk/s3-request-presigner` で落ちており、**何もデプロイされていなかった**。

原因はシェルの仕様で、**パイプラインの終了ステータスは最後のコマンド（`tail`）のもの**だからである。
`deploy.sh` 側は `set -euo pipefail` で正しく異常終了していたのに、`| tail` がそれを 0 に塗り替えていた。
気づけたのは exit code ではなく、**出力本文を読んだこと**と、
**`aws lambda get-function-configuration` で `MemorySize` がまだ 1024 のままだったこと**の2点による。

→ **長い出力を読みやすくするための `| tail` / `| head` / `| grep` が、失敗を成功に見せる。**
   実行系のコマンドはパイプせずそのまま流すか、`${PIPESTATUS[0]}` を明示的に見る。
→ より一般に、**「終わったこと」と「意図した状態になったこと」は別々に確かめる。**
   デプロイの成否は終了ステータスではなく、**変えたはずの属性を AWS に問い合わせて**確定させる。
   これは教訓10「状態は書いた場所の数だけ古くなる」の実行時版にあたる。

### 24. 計画が名指ししたコンポーネントが、実装時点でも推奨とは限らない

計画には「**`sst.aws.Cron` の実体は EventBridge Scheduler ではなく Rules**（ソースで確認・
従来の記述は誤り）」と、わざわざ**訂正済みの事実**として書いてあった。実装のためにもう一度
4.17.1 のソースを開いたら、その `Cron` に **`@deprecated Use CronV2 instead`** が付いており、
後継の `CronV2` は `scheduler.Schedule` を作る＝**「Scheduler ではない」は非推奨の側の話**だった。

結論（中継 Lambda が要る）は変わらなかったが、そのまま `Cron` を使っていれば
非推奨コンポーネントの上に cron 基盤を作り、`timezone` と `retries` も得られなかった。

→ **「ソースで確認済み」と書かれた前提ほど、次に触るときは確認の“範囲”を疑う。**
   前回は「実体は何か」を確かめており、**「これを使うべきか」は確かめていなかった**。
→ ライブラリの API を指す記述には、**確認した日付とバージョン**に加えて
   **非推奨でないこと**まで含めて残す（教訓10 の「状態は古くなる」の API 版）。

### 25. 1つのヘッダに2つの認証情報は載らない

5 で Function URL を IAM 認証にした結果、8 の中継は `Authorization` に **SigV4 の署名**を入れる。
ところが cron ルートは Vercel Cron の **`Authorization: Bearer <CRON_SECRET>`** を検査していた。
「認証を1段足す」つもりが、**既存の認証情報の置き場を奪っていた**。

気づいたのは実装中で、デプロイして 401 を見てからではなかったが、
**計画のどこにも書かれていなかった**（「CRON_SECRET と二重の防御になる」とだけ書いてあった）。

→ **認証方式を足すときは、鍵の強さではなく「搬送路」が空いているかを先に見る。**
   ヘッダ・クエリ・Cookie は有限の資源で、標準ヘッダほど先客がいる。
→ 対処は `x-cron-secret` への退避だが、**退避先を署名対象に含める**ところまでが1組
   （含めないと「経路上で差し替え放題の平文ヘッダ」になり、二重化のつもりが穴になる）。

### 26. 「npm 10 で入れる」は、そのマシンの npm 10 が同じ CPU とは限らない

教訓（既存）として「**依存の導入は npm 10、npm 11 は `sst deploy` のときだけ**」を守り、
worktree で `npm ci` を npm 10 で流した。テストは全部通ったのに **`npx sst install` が
「sst-darwin-arm64 が無い」で落ちた**。

原因は nvm の構成で、このマシンで npm 10 を持つ Node（v22.16.0）が **x64 ビルド**、
npm 11 を持つ Node（v22.17.0）が **arm64 ビルド**だったこと。`npm ci` は実行中の Node の
`process.arch` に従って optional な**プラットフォーム別パッケージ**を選ぶので、
`sst-darwin-x64` と `@img/sharp-darwin-x64` が入り、arm64 版が入らなかった。

対処は arm64 の npm で不足分だけを足すこと（`npm i --no-save --no-package-lock
sst-darwin-arm64@… @img/sharp-darwin-arm64@…`）。**lockfile と package.json は無変更**を
`git status` で確認した。プラットフォーム別パッケージは prebuilt バイナリで postinstall を
持たないため、npm 11 で入れても教訓の前提（install スクリプトが飛ぶ）に抵触しない。

→ **「どの npm か」を指定する運用ルールは、暗黙に「どの Node か」も決めている。**
   バージョンだけでなく **`node -p process.arch`** まで込みで一致しているかを見る。
→ 症状は「テストは通るのにツールだけ動かない」。**インストールの成否は
   `added N packages` ではなく、必要なバイナリの実在で確かめる**（教訓23 の同型）。

✅ **決着（2026-07-31）。この事故を生んだ運用ルールごと廃止した。**
`package.json` に `allowScripts` を置いて npm 11 でも postinstall が走るようにしたので、
**npm 10 を使う理由が無くなった＝ x64 の Node を踏むこともない**。以後 **npm は 11 に統一**
（`sst deploy` のゲート①とも初めて矛盾しなくなった）。詳細は教訓28。
さらに調べると、**そもそもこのルールは最初から不要だった**（同上）。この教訓が残す価値は
「運用ルールは暗黙に Node も決めている」という一般則の方で、そちらは有効なまま。

### 27. 「型が通った」は「読まれている」の証明ではない

AvatarCdn（`sst.aws.Router`）に noindex を足すとき、`edge` を **Router の直下**に書いた。
`npm run check:sst` は通り、`sst deploy` も **exit 0 で成功**した。それでも
**CloudFront Function は1つも作られなかった**。

原因は Router に2つのモードがあること。`routes` を**インラインで書いた場合**（`handleInlineRoutes`）
SST が読むのは**ルートごとの `edge`** だけで、直下の `args.edge` を読むのは
後から `route()` で足す `handleLazyRoutes` の方だった。`RouterArgs` には直下の `edge` が
**確かに定義されている**ので型検査は何も言わない。正しい位置は
`routes: { '/*': { bucket, edge: {...} } }`。

教訓19 で「型検査も負の対照で確かめる」と書いたが、今回はその負の対照（不正な型 → TS2322）も
**ちゃんと出ていた**。型は「その形が受理される」ことしか言わず、
**「その値が実装に読まれる」ことは言わない**。デプロイの成功も同じで、
無視された設定はエラーにならない。

→ **設定を足したら、それが作ったはずの実体を AWS に問い合わせる**（教訓23 の一般形）。
   今回は `aws cloudfront list-functions` が変更前と同じ2行のままだったので気づけた。
   応答ヘッダだけを見ていたら「CloudFront の伝播待ちか」と誤診して時間を溶かしていた。
→ 同じ形の罠は**同名プロパティが複数の階層にあるライブラリ全般**にある。
   ドキュメントの例が「どちらの階層の話か」を確かめること。

### 28. 教訓26 の回避策には、正面から効く設定があった

npm 11 が install スクリプトを飛ばす件は、`npm install-scripts approve <pkg>` で
**`package.json` の `allowScripts` に許可を書ける**（実測: `esbuild` / `@sentry/cli` /
`fsevents` / `unrs-resolver` の4件が列挙された）。これを入れれば
「**依存導入は npm 10、deploy は npm 11**」という使い分け自体が要らなくなり、
教訓26 の「npm 10 の Node が x64 だった」問題も同時に消える。

今回は 9 のスコープ外なので**入れていない**（1つの PR で2つのことを確かめない）。
→ **別タスクとして起票する。** ここに書いたのは、次に npm の使い分けで詰まった人が
   「回避策を洗練させる」方向へ行かないようにするため。**回避策が育ってきたら、
   回避している当の仕組みに正面の設定が無いかを一度探す。**

---

✅ **決着（2026-07-31・Pour Over 本編とは独立した作業／21タスクの番号は動かしていない）。**

`package.json` に `allowScripts` を入れた。**使い分けは廃止し、npm は 11 に統一**した。

```json
"allowScripts": {
  "@sentry/cli": true, "esbuild": true, "fsevents": true, "unrs-resolver": true
}
```

📌 **バージョンを焼き込まない形（`"pkg": true`）にした。** 既定の
`npm install-scripts approve` は `"esbuild@0.25.4": true` と**バージョン込み**で書き、
依存を上げるたびに陳腐化する（4件はすべて**推移的依存**＝ Next / eslint-config-next /
@opennextjs/aws / vite 由来なので、上げた本人が allowScripts を思い出す見込みが薄い）。
`--no-allow-scripts-pin` を付けると版に依存しない形で書ける。
**引き換えに「将来の版の postinstall も無審査で走る」**が、esbuild は
そもそもビルド中に実行されるバイナリで、install スクリプトだけ止めても防御にならない。
陳腐化して**黙ってスキップに戻る**方が実害が大きいと判断した。

⚠️ 実測でわかった npm 11.18.0 の癖:
- `npm install-scripts approve --all` は **optional 依存の `fsevents` を拾わない**（名指しが要る）。
  一方 `npm ci` の警告には出る＝**警告と `ls` の対象がずれている**。
- `--dry-run` は **実際に `package.json` を書き換える**。dry run として信用しない。

🔑 **調べてわかった本当のこと: この使い分けは、最初から不要だった。**
`allowScripts` 無し・npm 11・clean install で**同じ4件を測り直した**ところ、全部揃っていた:

| 確認対象 | postinstall スキップ | 実行 |
|---|---|---|
| `esbuild --version` | 0.25.4 | 0.25.4 |
| `@sentry/cli` の `getPath()` → 実行 | sentry-cli 2.58.6 | 同左 |
| `require('fsevents')` | 可 | 可 |
| `@unrs/resolver-binding-darwin-arm64` | 有 | 有 |

4件とも **optional なプラットフォーム別パッケージ**でバイナリを解決するため、postinstall は
実質 no-op（`@sentry/cli` の postinstall は `@sentry/cli-darwin` が在れば何もしない。
CDN 取得は在庫が無いときのフォールバック）。**教訓26 で「npm 10 で入れたから在った」と
記録したバイナリは、npm 11 でも同じように在った。**

→ 🔴 **教訓26 の実害（arch 不一致で `npx sst install` が落ちる）は、
   不要な回避策を守ったせいで生じていた。** 回避策そのものがコストではなく、
   **回避策が別の前提（この場合は Node の CPU）を持ち込むこと**がコストだった。
→ 🔴 **「変更後に在ること」は効果の証拠にならない。「外したら無いこと」を同じ手段で見る。**
   教訓23（`added N packages` で判定しない）に従ってバイナリの実在まで見ていたのに、
   **負の対照が無かったため誤った結論に達した**＝ 手続きが正しくても因果は取り違えられる。
   教訓19 の「負の対照」を、検査ではなく**依存**に適用すべきだった。
→ 📌 `@sentry/cli/sentry-cli` を実在確認の対象にしたのも誤り。**プラットフォーム別パッケージを
   持つ依存は、固定パスではなくパッケージ自身の解決関数（`getPath()` 等）で確かめる。**
   固定パスはフォールバック経路の産物で、正常時には存在しないことがある。

**検証**（すべて npm 11.18.0 / arm64・clean `npm ci` から）:
`npm ci` の allow-scripts 警告が消えた（8行 → 0行）／`npx sst install` が成功
（**教訓26 で落ちた当のコマンド**）／`check:sst`・`lint`・`test`（30ファイル・272件）・
`check:cron`・`check:toolchain` がすべて exit 0。
CI は `actions/setup-node` の Node 22＝**npm 10.9.x** で、`allowScripts` を**黙って無視して
全スクリプトを実行する**ため無影響（スクラッチで実測。npm 11 に上がっても正しく動く）。
`sst:deploy` のゲート①（npm 11 以上）とは矛盾しない。OpenNext の `installDependencies` は
自前の一時ディレクトリで `npm install sharp` を打つので `allowScripts` は届かないが、
sharp 0.35 は prebuilt で install スクリプトを持たず影響しない。

### 29. クロスビルドの「アーキテクチャ指定」は、効くフラグと効かないフラグがある

9.5 の**初回 CI デプロイ**（2026-08-01）で、image-optimization Lambda に
`@img/sharp-linux-x64` が入った。Lambda は arm64 なので sharp が読めず、
`next/image` が原本をそのまま返す状態になった（dev で実測: **216 B → 31,590 B**、
`cache-control` も失敗経路の指紋 `max-age=14400`）。

`open-next.config.ts` には **`arch: 'arm64'` と明示してあった**。それでも x64 が入った。

原因は OpenNext の `installDependencies`（`dist/build/installDeps.js`）が
`arch` を **`--arch=`** として渡していること。これは node-gyp / prebuild-install の系譜の
フラグで `npm_config_arch` を立てるだけであり、**optional 依存の絞り込みには効かない**。
sharp 0.35 系は `@img/sharp-<os>-<cpu>` の optional 依存で解決されるので、効くのは **`--cpu`**。
指定が無ければ npm は**ビルドしたマシンの CPU** で選ぶ。

**負の対照つきの実測**（arm64 の Mac 上）:

| 指定 | 入ったもの |
|---|---|
| `--arch=arm64` のみ | `sharp-linux-arm64`（＝**ホストが arm64 だから通っていただけ**） |
| `--arch=arm64` ＋ `--cpu=x64` | **`sharp-linux-x64`**（＝ `arch` は選択を制御していない） |
| `--cpu=arm64` | `sharp-linux-arm64`（ホストに依らず確定） |

→ 🔴 **同じ概念に見える2つのフラグ（`--arch` と `--cpu`）が別の機構に効く。**
   `os`・`libc`・`arch` を並べて書いてあると「3点セットが揃っている」ように見えるが、
   **揃っているのは名前だけ**だった。設定の並びの見た目を根拠にしない。
→ 🔴 **「ホストの属性が黙って混ざる」設定は、ホストを変えるまで露見しない。**
   Apple Silicon の Mac から打っている間ずっと正解が出ていたので、
   **1年打ち続けても気づけなかった**。教訓26（npm 10 を持つ Node が x64 だと x64 の
   optional 依存が入る）と**同じ穴**で、あのときは「npm のバージョン」に注意が向いていて
   「CPU がどこから来るか」という一般則まで抽象化できていなかった。
   → **クロスビルドの設定は「指定したから効いている」ではなく
     「別 CPU のホストで同じ結果になるか」で確かめる。**
→ ✅ **検査が仕事をした。** `npm run sst:deploy` の ④（`verify:image-optimizer`）が
   ジョブを赤にしたので、壊れたものが「デプロイ成功」のまま残らなかった。#96 で
   一度踏んだからこそ置いた検査で、**別の原因から来た同じ症状を捕まえた**
   ＝ 症状に対して検査を置くのは、原因を1つ潰すより射程が広い。
→ ⚠️ **ただし検査は `sst deploy` の後にある。** 壊れた成果物は**一度 dev に適用されてから**
   赤くなった（`WebImageOptimizerFunction` は Updated 済み）。13（本番切替）では
   これは「本番に一度出てから気づく」を意味する。
   → ✅ **対処: 静的に分かる分だけ `check-build-toolchain.mjs`（＝ ① デプロイ前）へ移した。**
     `arch` と `additionalArgs` の `--cpu` が食い違っていたら**適用前に**止まる
     （負の対照2種で exit 1 を実測）。成果物を見ないと分からないこと
     （npm が実際に何を入れたか）は従来どおり ④ が受け持つ。
     🔴 **2つの検査は射程が違うので、どちらも消さないこと。**
     ①は「設定の矛盾」を早く・安く捕まえるが、設定が正しくても環境要因で壊れる場合は
     見抜けない。④は必ず捕まえるが、適用の後になる。
→ 📌 診断文言も直した。従来は `os/arch/libc` の不一致を疑わせる案内だったが、
   **今回それらは一致していた**ので原因に辿り着けない。別 CPU のパッケージが入っている
   場合は `--cpu` の不足を名指しするようにした。**「よくある原因」を指す固定文言は、
   別の原因で同じ症状が出たときに積極的に人を迷わせる。**

### 30. ロググループ名は関数名から導けない（SST v4）

`/aws/lambda/<関数名>` を決め打ちで引いて **`ResourceNotFoundException`** を踏んだ。
SST は**ロググループを関数とは別のランダム接尾辞で作り**、`LoggingConfig` で結び付けている。

```
関数名        siko-coffee-dev-AlarmRelayFunction-nufmtvtf
ロググループ  /aws/lambda/siko-coffee-dev-AlarmRelayFunction-ffmdukos   ← 接尾辞が違う
```

正しい経路は `aws lambda get-function-configuration --query LoggingConfig`。

🔴 **これは単なる不便ではなく誤診の温床。** 「ログが無い」を「呼ばれていない」と読むと、
実際には正常に動いているものを壊れていると判断する。**宛先を確かめる前に不在を結論にしない。**
教訓14（指標が反応するか）の裏返しで、**見ている場所が正しいか**を先に問う話。

### 31. 通知系の故障は、その通知系では通知できない

`alarm-relay-errors`（中継 Lambda 自身の Errors）が実際に **ALARM に遷移し、
その通知もまた同じ中継を通ろうとして失敗した**。設計時にコメントへ「既知の死角」と
書いていたことが、初日にそのまま実演された形。

🔑 **これは実装のバグではなく構造の帰結**なので、押し出し（push）を増やしても解けない。
中継を二重化しても「二重化した両方が死ぬ経路」（＝ Slack 側の障害・webhook の失効）が残る。

→ **埋めるのは引き（pull）側**。soak（14）の点検項目に入れる:

```bash
aws cloudwatch describe-alarms --state-value ALARM --query "MetricAlarms[].AlarmName"
```

📌 一過性の失敗（Slack の 5xx・スロットル）なら次の呼び出しで復旧して**遅れて届く**ので、
自己監視のアラーム自体は無駄ではない。効かないのは**恒久的な故障のとき**だけ、と切り分けておく。

✅ **この「効く側」も実測できた（同日）。** webhook を投入して中継が直った後、
`alarm-relay-errors` は自力で ALARM → OK に戻り、**その復旧通知は中継を通って届いた**:

```
13:40 UTC  中継が壊れている → ALARM に遷移 → 通知は届かない（死角の実演）
13:44 UTC  webhook を投入して再デプロイ
13:50 UTC  ALARM → OK（"1 datapoint [0.0] was not greater than or equal to the threshold"）
13:50 UTC  [alarm] relay forwarding: ✅ OK *siko-dev-alarm-relay-errors* _[dev]_   ← 届いた
```

🔑 **つまり「壊れたことは分からないが、直ったことは分かる」という非対称がある。**
沈黙は正常と故障のどちらでもありうるが、**復旧通知が来たら、それは
「その間なにかを取りこぼしていた」ことの事後的な証拠**になる。引き（pull）側の点検で
拾うべきなのは、この沈黙している期間のほう。

### 32. 「保存された」と「正しい値が保存された」は別

`sst secret set` は成功し、`sst secret list` にも `SLACK_WEBHOOK_URL` が出た。しかし
デプロイは中継 Lambda を**一切更新しなかった**。値が**空文字**で保存されていたためで、
SST から見れば placeholder の `''` から変化していない＝更新不要、という判定は正しかった。

原因は投入コマンドの `read -rs`（非エコー読み取り）が値を拾えていなかったこと。
`printf '%s' "$url" | sst secret set ...` は**空文字でも何事もなく成功する**。

🔴 **より悪かったのは確認方法のほうだった。** 秘密を伏せるつもりで
`sed -E 's/[=[:space:]].*$/ = <redacted>/'` を通したので、**空の値も 81 文字の値も
同じ `<redacted>` になった**。＝ **確かめようとしていた性質そのものを、確認の手段が消していた。**
長さを出す形（`awk` で `=` 以降の length）に変えて即座に判明した。

```
SLACK_WEBHOOK_URL: length=0    ← 投入直後（壊れていた）
SLACK_WEBHOOK_URL: length=81   ← 検証付きコマンドで入れ直した後
```

🔑 **秘密を扱う検証では「値を出さない」と「何も分からない」の間に線を引く。**
長さ・接頭辞・ホスト名・件数は、値を露出せずに正誤を判定できる。
[[feedback-verification-baseline]] の「変えたはずの属性を実環境に問い合わせる」の変種で、
**問い合わせても、返ってきたものを潰したら意味がない**。

📌 対処として、投入コマンド自体に形式検査を入れた（`case "$url" in https://hooks.slack.com/*)`）。
**空文字が静かに通る経路を残さない**のが本筋で、確認の改善はその次。

### 33. 回避策として環境に入れたものが、後続コマンドの分岐を黙って変える

`sst secret set` は `scripts/deploy.sh` を経由しないので、0-a の②（`login_session` を
SST が解釈できない問題）が手動に戻る。そこで
`eval "$(aws configure export-credentials --format env)"` を打った。

その **1時間後、同じシェルで `npm run sst:deploy` が `ExpiredTokenException` で落ちた。**
`deploy.sh` の②はこう分岐している:

```bash
if [[ -n "${AWS_ACCESS_KEY_ID:-}" ]]; then   # CI とみなして展開をスキップ
```

CI（OIDC で環境変数に入っている）を想定した条件だが、**手で展開して期限切れになった
ローカルのシェルも同じ枝に落ちる**。結果、`deploy.sh` は自前の新鮮な資格情報を取りに行かず、
腐った値を使い続けた。**`aws` CLI 単体では通る**ので「AWS にログインしていない」にも見えない。

🔑 **回避策には寿命があり、寿命が切れたことは回避策自身からは見えない。**
一時的に環境へ入れた値は、それを前提にしていない別のコマンドの判定材料になりうる。

→ ~~**別タスクとして起票**（10 のスコープ外）~~ → ✅ **2026-08-01 に回収済み（下記）。**

#### 33-b. 直しにいって、同じ枝にもう1つバグが見つかった

条件は **`GITHUB_ACTIONS` / `CI`** に変え、**ローカルでは無条件に展開し直す**ようにした。
起票時に併記していた「`AWS_CREDENTIAL_EXPIRATION` を見て期限切れなら展開し直す」案は**採らなかった**。
BSD/GNU の `date` 差を跨ぐ日付計算が要るうえ、**「残り3分だが期限内」という穴が残る**ため。
展開自体は1秒で終わるので、無条件のほうが安く確実だった。

**そして修正中に、同じ枝のこの行が検証になっていないと分かった**:

```bash
echo "✓ $(aws sts get-caller-identity --query Arn --output text)"
```

コマンド置換が失敗しても、終了ステータスは `echo` のもの（＝0）になる。
`set -euo pipefail` は**素通りする**。つまりこの行は、
**認証できていないときに空の ARN で `✓` を出して次へ進む**行だった。
＝ 教訓33 の本体（腐った資格情報を使う）に対して、**その直後に置いてあった「検査」が
何も検査していなかった**ので、二重に気づけなかった。

🔴 **教訓23 と同じ穴で、違いは搬送路だけ。** あのときはパイプ（`| tail`）、今回はコマンド置換。
**「`| tail` に通さない」という具体形で覚えていたので、コマンド置換では発火しなかった。**
→ 一般形は **「成否を見たいコマンドを、終了ステータスを飲む構文の中に置かない」**。
  受けるときは **`if ! var="$(cmd)"; then`** の形にする。
→ しかも `$(cmd)` の失敗は**黙って空文字**になるので、`✓ ` だけが残る＝
  **失敗時に最も誤解を招く形の出力**になっていた。

**負の対照つきの実測**（期限切れの `AWS_*` を環境変数に置いて ② だけを駆動）:

| コード | 出力 | 資格情報 | rc |
|---|---|---|---|
| 修正前・ローカル | `✓ `（**ARN が空**） | **腐ったまま** | **0**（＝ `sst deploy` へ進む） |
| 修正後・ローカル | `✓ 展開しました（arn:…/shun / 期限 …）` | 取り直された | 0 |
| 修正後・CI 相当（`GITHUB_ACTIONS=true`・有効な資格情報・`~/.aws` 無し） | `✓ arn:…/shun` | 環境変数のまま | 0 |
| 修正後・CI 相当（資格情報が無効） | `✗ 環境変数の資格情報で認証できませんでした。` | — | **1** |

併せて、取り直す前に `unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
AWS_CREDENTIAL_EXPIRATION` を入れた（古い `AWS_SESSION_TOKEN` だけが残って
静的キーの profile と食い違う事故を塞ぐ）。

→ 🔴 **「変数が設定されている」は「その値が有効」の証明にならない。**
   環境変数には**期限も出自も書かれていない**。`-n "$AWS_ACCESS_KEY_ID"` が答えているのは
   「誰かがいつか入れたか」であって、「今使えるか」ではない。
   → **状態を条件にするなら状態そのもの（`GITHUB_ACTIONS`）を見る。
     状態の副産物（資格情報が在ること）で代用しない。**
→ 🔴 **この状況は今後も再発する。** `sst secret set` のように
   **`deploy.sh` を経由しないコマンド**を打つたび、②は手作業に戻るため。
   → **対処: 手動展開が必要な理由と「残しっぱなしにしない」を `deploy.sh` 冒頭に書いた。**
     再発する運用は、注意で防がずに**スクリプト側で吸収する**（今回は無条件展開がそれ）。
→ 📌 **CI を壊さないことの確認は「CI を再現して」行った。** `HOME` を空ディレクトリに
   差し替え、その環境で `aws configure export-credentials` が実際に
   `The config profile (default) could not be found` で落ちることまで確かめている。
   ＝ **この枝を飛ばす必要が本当にあること**を、想像ではなく実測で固定した。

### 34. IaC の「宣言した対象」と「実際に書き換える範囲」はずれる

12 で `domain` を設定するとき、計画には **「`dns` は有効のままでよい」** と書いてあった。
書いた本人（＝過去の自分）は「`domain` はディストリビューションに
alternate domain name を足す設定」だと思っていた。実際には SST の `Cdn` は
**Route53 のレコードまで作る**。つまり `domain` は CloudFront の設定ではなく、
**CloudFront と DNS の両方を動かす設定**だった。

これが効いたのは、**その差が手順の順序を壊すから**である。
13 は「production デプロイ → **検証** → DNS 切替」の3段で、
**切替が最後にあることが安全性の源**（検証で問題が出たら切り替えなければよい）。
`dns` が有効だと、**1段目が3段目を兼ねてしまう**＝検証の機会が消える。
リソースが1つ余計にできる、という程度の話ではなかった。

🔑 **一般形: 「この設定は何を作るか」ではなく「この設定は何を書き換えるか」を確かめる。**
特に **DNS・証明書・IAM のような共有資源**は、コンポーネントの宣言範囲の外に見えるのに
実際には触られることがある。触られた瞬間に**他のタスクの前提が消える**。

🔑 **そして確かめる先はドキュメントではなくソースだった。** SST のドキュメントは
`dns: false` を「非対応 DNS プロバイダ向けの回避策」として説明していて、
**「レコードを作らせたくないとき」という用途を書いていない**。嘘ではないが、
こちらの用途からは見えない書き方になっている。`cdn.ts` の `createDnsRecords()` と
`dns.ts` の `createAlias()` を読んで初めて、`allowOverwrite` が既定 false であることまで含めて確定した。

📌 **教訓6（IaC 管理下のリソースを CLI で触らない）との関係を混同しないこと。**
今回の結論は「Route53 のレコードを **IaC の管理下に置かない**」で、一見すると逆向きに見える。
だが教訓6 は **SST が作ったもの**を手で触るなという話で、
**最初から管理外に置くと決めたもの**には及ばない（9.5 の OIDC ロールと同じ）。
判断の軸は「IaC か手作業か」ではなく、**壊れたときにどちらが速く戻せるか**である。
ここでは切り戻し速度（UPSERT 1回＝秒 vs 再デプロイ＝数分〜十数分）が決め手になった。
＝ **11 で TTL を 60s へ下げた投資は、この選択とセットで初めて回収される。**

### 35. 検査を足したら、その検査の**射程**を書き添える

`sst.config.ts` は `tsconfig.json` の exclude に入っていて **CI で型検査されない唯一のファイル**
だった。これは #108 で問題として認識し、`tsconfig.sst.json` ＋ `npm run check:sst` を用意して
「塞いだ」ことにしていた。

12 でその穴から**別のものが落ちた**。トップレベル import は **SST の実行時制約**であって
型の問題ではないので、`check:sst` は当然のように **exit 0** を返す。
手元では eslint・tsc・vitest・check:sst の**4つとも緑**で、
**main へマージして初めて `SST Deploy` が赤くなった**。

🔑 **「この検査は何を見るか」ではなく「この検査は何を**見ないか**」を書く。**
`check:sst` に足りなかったのはコードではなく**但し書き**だった。
「`sst.config.ts` の検査」という名前が、実際の射程（型のみ）より広く読めてしまっていた。

🔑 **検査は「壊れたことが分かる場所」ではなく「壊す前に止まる場所」に置く。**
今回の再発防止（`check:sst-config`）を `SST Deploy` ジョブではなく
**`Lint & Type Check` ジョブ**に入れたのはこのため。deploy は
**main への push でしか走らない**ので、そこに置くと「マージするまで分からない」まま変わらない。
🔴 9.5 以降は **main への push＝デプロイ**なので、**PR で止まらない検査は実質「本番で止まる検査」**になる。

📌 **新しい検査には負の対照をセットで残す。** `check:sst-config` は
「トップレベル import ありで **exit 1**、同じ状態で `check:sst` は **exit 0**」を
実測して記録した。これがあると、**その検査が何を追加で捕まえるのか**が後から読んで分かる
（＝射程が文章ではなく実測で残る）。教訓19・教訓21 と同じ方向。

### 36. 秘密を「伏せて」確認すると、伏せた側の情報で判定してしまう

13 の準備で production のシークレットを Vercel から移そうとした。
`vercel env pull` でファイルに落とし、`sst secret load` に渡す——という段取りで、
**あと1コマンドのところまで行った**。

止まったのは、投入前に**長さを測った**からである。

```
ADMIN_PASSWORD_HASH   len=13
ADMIN_SESSION_SECRET  len=13
AUTH_SECRET           len=13
CRON_SECRET           len=13
...                   len=13
```

**別々の秘密が全部同じ長さになることはない。** 確かめると、対象18本の
**相異なる値はちょうど1つ**で、`AUTH_SECRET` と `STRIPE_SECRET_KEY` の sha が一致した。
＝ **Vercel CLI が復号せず、全項目に同じプレースホルダを書いていた**
**プレースホルダの正体はリテラル `[SENSITIVE]`** だった。

**そのまま流していたら production の18本すべてが同じ固定文字列になっていた。**
しかも **`sst deploy` は成功する**。壊れるのはデプロイではなく、
**ユーザーのログイン（`AUTH_SECRET`）と注文照会リンク（`ORDER_TOKEN_SECRET`）**である。
soak 中は AWS と Vercel の両方が本番を担うので、**片方に当たった人だけが壊れる**。

🔑 **教訓32 の続き。** あのときは「空文字で保存されたのを `<redacted>` 表示のせいで見逃した」だった。
今回は**投入する前**に同じ形の罠に当たっている。共通しているのは
**「秘密だから隠す」と「隠したものは確認もできない」を同一視していた**こと。
→ **長さ・ハッシュ・接頭辞・重複の有無は、値を一切露出せずに測れる。**
  秘密の検証で使うべきはこちらであって、`<redacted>` ではない。

🔑 **とくに「重複の有無」は強い。** 個々の値が正しいかは分からなくても、
**別々であるべきものが同一だと分かれば、それだけで異常が確定する**。
中身を知らないまま正しさを否定できる、という点で秘密の検査に向いている。

✅ **手順書に書くのではなく、実行可能な形にした**（教訓1）。
`scripts/check-secret-file.mjs` ＋ `npm run check:secret-file` が
`sst secret load` の**前に**止める: 値の重複／空文字／入れてはいけない値の混入
（`AWS_*`・`STRIPE_*`・`BLOB_*`・ビルド時にしか効かない `SENTRY_ORG|PROJECT|AUTH_TOKEN`）／
必須7本の欠落。出力は key・length・sha の先頭8桁だけで、値は出さない。

負の対照つきで確認した:

| 入力 | 結果 |
|---|---|
| 全部同じプレースホルダ（＝今回引いたもの） | **exit 1**「値が重複している」 |
| `AWS_ACCESS_KEY_ID` / `STRIPE_SECRET_KEY` 混入 | **exit 1**「投入してはいけない値」 |
| 18本すべて相異なる正常系 | exit 0 |

#### 🔴 最初の診断は誤っていた（その日のうちに訂正）

当初これを「**Vercel CLI がエージェント実行を検知して伏せた**」と診断し、
「オーナー本人が対話的ターミナルでやること」と手順書に書いた。**誤りだった。**
オーナーが自分のターミナルで実行しても**同じ `[SENSITIVE]` が返った**。

正しくは **Vercel の環境変数の型 `sensitive`** による。`plain` / `encrypted` と違い
**作成後は誰も復号できない**（ダッシュボードでも REST API でも CLI でも）。
＝ **「取り方」の問題ではなく「もう取れない」**。

🔑 **同じ観測に2つの説明が付くとき、区別する実験を先にやる。**
「エージェントだから伏せられた」と「型が sensitive だから伏せられた」は
最初のデータ（全部同じプレースホルダ）では**区別できていなかった**。
区別する実験は「**人間のターミナルで同じことをする**」で、
オーナーが偶然それをやったから割れた。**こちらから先に頼むべきだった。**
📌 プレースホルダの中身（`[SENSITIVE]`）を最初に見ていれば1回で分かった。
**「秘密かもしれないから見ない」が、秘密でないと確定した値にまで及んでいた**
（`AUTH_SECRET` と `STRIPE_SECRET_KEY` が同一な時点で実在の秘密ではないと確定していた）。

#### 結果として取るべき道が変わった

「Vercel からコピーする（作り直さない）」は**実行不可能**なので、2つに分けた:

- **A. 他システムから復元できる**（Google/LINE のコンソール、Sentry、GA、SES の送信元、
  ドメイン文字列、`true`、そして **`INSTAGRAM_ACCESS_TOKEN` は DynamoDB `siko-coffee-config`
  に実物がある**）
- **B. 読めないので両側を同じ新しい値に回す**（`AUTH_SECRET` / `ADMIN_SESSION_SECRET` /
  `ORDER_TOKEN_SECRET` / `CRON_SECRET` / `REVALIDATE_SECRET`）

**B の代償を本番データで実測したら、ほぼゼロだった**:

| テーブル | 件数 | 意味 |
|---|---|---|
| `siko-coffee-orders` | **0** | `ORDER_TOKEN_SECRET` を回しても**壊れる照会リンクが存在しない** |
| `siko-coffee-auth` | **7** | `AUTH_SECRET` を回しても1回ログアウトするのは数名 |
| `siko-coffee-reservations` / `-subscriptions` | 0 / 0 | 影響なし |

🔑 **「危険だから避ける」の前に規模を測る。** ローテーションは一般には
「既存リンクが死ぬ」「全員ログアウト」という重い操作だが、
**このプロジェクトの現時点では実質無害**だった。決済停止中で注文が無く、利用者も数名のうちに
済ませられる＝ **今がいちばん安いタイミング**でもある。
一般論の重さで判断していたら、無理な回避策を探すことになっていた。

### 37. 「投入できた」と「使える値が入った」は別

13 のシークレット投入で、`ADMIN_PASSWORD_HASH` が **161文字**で来た（正しくは168）。
`<salt>`（32桁hex）と `<hash>`（128桁hex）は正しく、**欠けていたのは先頭の `scrypt:` だけ**
（32 + 1 + 128 = 161 で長さがぴたり合う）。

`src/lib/adminPassword.ts` の `verifyScrypt` は

```js
if (parts.length !== 3 || parts[0] !== 'scrypt') return false
```

なので、この値だと **本番の admin が絶対にログインできない**。しかも症状は
**「パスワードが違う」としか見えない**（設定ミスだと分からない）。

🔴 **既存の検査は全部通っていた。** 空文字でもなく、他と重複もせず、必須も揃っていて、
`✓ このファイルは sst secret load に渡してよい` が出ていた。
＝ **「異常が無いこと」を確かめる検査は、正しい形を知らないと素通りする。**

🔑 **気づけたのは長さを見ていたから。** 168 のはずが 161 で、しかも
**dev の同じ変数が 168** だった。教訓32 以来「伏せずに測る」を続けていたのが効いた。
📌 差が 7 だったのも効いた（`scrypt:` がちょうど7文字）。**ズレの量が原因を名指しした。**

✅ 対処: `check-secret-file.mjs` に **`FORMATS`** を足し、形が決まっているものは
正規表現で止めるようにした（`ADMIN_PASSWORD_HASH` / `ADMIN_TOTP_REQUIRED` /
`MAIL_FROM` / `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_GA_MEASUREMENT_ID` /
`SLACK_WEBHOOK_URL` / `WEBAUTHN_ORIGIN` / `WEBAUTHN_RP_ID`）。
負の対照つきで確認: **今回の161文字は exit 1**、`ADMIN_TOTP_REQUIRED=yes` も exit 1、正常系は exit 0。

🔑 **書けるのは「値を知らなくても判定できる性質」だけ**、という線引きが要る。
「そのパスワードのハッシュか」は検査できないので、**そこは投入後に本人が確かめる工程**として残す。
＝ 機械で見る部分と人が見る部分を分け、**機械側は「知らなくても分かること」を全部やる**。

📌 **同じ日の教訓36 と対になっている。** 36 は「秘密を伏せると確認もできなくなる」、
37 は「測っていたから気づけた」。**測れる性質を増やすほど、秘密のまま検証できる範囲が広がる。**

### 38. 「正しい場所で作業する」は、その場所が最新であることを保証しない

13 の 2 で `sst deploy --stage production` が `Module not found: '@aws-sdk/client-s3'` で落ちた。
原因は **main リポジトリの `node_modules` が #106 より古かった**こと。

🔴 **原則どおりに振る舞っていたのに踏んだ。** 教訓26 は「worktree の `node_modules` は固まる」で、
その対策として「**デプロイはメインリポジトリから**」を守っていた。だが**メインリポジトリの
`node_modules` も、`npm ci` を打たなければ同じように古くなる**。git は `node_modules` を追跡
しないので、`git pull` で最新にしても**依存の実体は付いてこない**。

🔑 **一般化: 「どこで作業するか」の規則は、「その場所の状態が正しいか」を代替しない。**
場所を正しくすると安心してしまい、**状態の検査を省く**ようになる。これが罠の本体。
規則が守るのは「間違った場所を使わないこと」だけで、**正しい場所が正しい状態であることは
別途測る必要がある**。

→ **判定は変わらず `grep <pkg> package.json` と `ls node_modules/<pkg>` の突き合わせ**。
両方に有って実体だけ無ければ環境要因。**デプロイ系を打つ前に `npm ci` を済ませるのが最も安い**
（教訓26 の結論はそのまま main リポにも適用する）。

### 39. 資格情報の「期限」は、いつまで使えるかの保証ではない

同じデプロイで、`deploy.sh` の ② が **「期限 2026-08-02T00:46:44 UTC」と表示した**のに、
**00:39:58 の時点で `aws sts get-caller-identity` が既に `ExpiredToken`** を返した。
7分の食い違い。環境に残った `AWS_*` は0本なので**教訓33 の再発ではない**。

🔴 **害は「落ちること」ではなく「途中で落ちること」。** デプロイは部分適用で終わり、
**state ロックが残った**（異常終了なので解放されない）。次の実行は `Locked` で即死し、
`sst unlock --stage production` が要る。＝ **1つの期限切れが、2つの後始末を生む。**

🔑 **長い処理の前に「窓」を測り、窓に収まらない作業を始めない。**
実測でこのプロジェクトの窓は **10〜15分**しかない。だから 2回目は
**`npm run build` を単体で回して exit 0 を確認してからデプロイした**
（ビルド失敗で窓を溶かさない）。**表示された期限を信じて逆算しない。**

📌 教訓23（`| tail` で終了ステータスが化ける）と同じ構図。**そこに出ている数字が、
自分の知りたい命題を答えているとは限らない。**

### 40. 「制約がある」まで正しくても、**その制約の帰結**は別に確かめる

runbook §4 は「Route53 は同名の CNAME と A を共存させない」まで**正しく**書いたうえで、
帰結を「だから **UPSERT で置き換わる**」と誤った。実際の帰結は **`InvalidChangeBatch` で拒否**。
制約を知っていたのに、**その制約下で API がどう振る舞うか**を確かめていなかった。

🔴 **これは「調べ落とし」ではなく「途中まで調べた」失敗**である。制約を1つ突き止めると
**分かった感**が出て、そこから先を推論で埋めてしまう。埋めた部分は根拠が無いのに、
**根拠のある前半と同じ確信度で書かれる**ので、読み返しても見分けられない。

🔑 **一般化: 「Xできない」という制約から「だからYになる」を導いたら、Y は独立に確かめる。**
同じ制約から複数の帰結がありうる（拒否する／置き換える／片方を消す／エラーにせず無視する）。
**どれになるかは仕様が決めることで、制約からは決まらない。**

→ **手順書に「〜なので〜になる」と書いたら、その「なる」の側に実測の裏付けがあるか見る。**
無ければ **`--dry-run` や無害な等価操作で1回試す**か、**両方の分岐を手順に書く**。
今回は後者で足りた（拒否されたら DELETE+CREATE に切り替える、と書いてあればよかった）。

🔑 **副産物: アトミック性が「誤った手順書」の被害を消した。** 3レコードを1バッチにしたのは
「www が引けない窓を作らない」ためだったが、実際に効いたのは**手順が間違っていたときに
部分適用を防ぐ**という別の効能だった。→ **不可逆な操作は、正しさに自信があるときほど
まとめてアトミックに打つ**（自信は間違いの確率を下げない）。

📌 教訓34（IaC の宣言範囲と実際の書き換え範囲はずれる）と同じく、**確かめる先は
自分の書いた文章ではなく API の応答**。ただし今回は SST ではなく**自分の手順書**が
情報源だったので、**「一次情報だと思っていたものが自分の推論だった」**点がより悪い。

#### 🔴 同じ穴が**切り戻し手順にもあった**（同日中に発見・修正）

runbook §6（ロールバック）も **UPSERT 2本**で書かれていた。切替で www は CNAME → A(ALIAS) に
変わったので、**戻すときも型が変わる＝同じく拒否される**。
**緊急時にしか使わない経路なので、壊れていても普段は誰も気づかない。**

🔑 **一般化: 誤りが1か所で見つかったら、「同じ推論で書いた他の箇所」を探す。**
教訓40 の誤りは「www の型が変わる場面」で発生する。その場面は**切替と切り戻しの2回あり**、
両方を同じ思い込みで書いていた。**バグと同じで、原因が同じなら発生箇所も複数ある。**

🔴 **修正の過程でもう1回同じ罠に入りかけた。** 直した §6 に
`DNSName: d38zi1bm4zf9e3.cloudfront.net`（末尾ドット無し）と書いたが、Route53 が返す実体は
**`d38zi1bm4zf9e3.cloudfront.net.`（ドット付き）**。「Route53 が正規化するから通るはず」は
**まさに教訓40 の推論**である。`DELETE` は完全一致が要るので、外れれば緊急時に止まる。

→ **手順から「書き写す」工程を消した。** `list-resource-record-sets` の出力を `jq` で
そのまま `DELETE` 節にする形に書き換え、**生成されるバッチが現物のコピーになることまで実測**した
（適用はしていない＝適用すれば本番が戻ってしまうため、検証できるのは生成までである点も明記）。

🔑 **「一致が要る値」は人が転記しない。** 転記する限り、正しさは毎回**人の注意力**に依存する。
現物から生成すれば、**一致は構造で保証される**（教訓1「無言で失敗するものは手順書ではなく
実行可能な形で防ぐ」の DNS 版）。

### 41. **検証環境で通っていたのは、検証環境にだけ残っていた「残骸」のおかげだった**

5-3 で production の cron を有効化した直後、初回発火（20:35:43）が
**403 Forbidden**（Function URL の認可エラー）で落ちた。dev では同時刻に **200** で成功している。
**同じコード・同じデプロイ・同じ IAM ロール構成**なのに結果が違った。

#### 切り分け

| 実験 | 結果 | 分かること |
|---|---|---|
| dev の同時刻のログ | **200** | コードの問題ではない |
| 両ステージの ID ベースポリシー | **完全に同一**（`lambda:InvokeFunctionUrl` を各 server の ARN に） | 権限「宣言」の差ではない |
| `aws iam simulate-principal-policy` | **`allowed`** | 🔴 **シミュレータは通ると言う** |
| 両ステージの**リソースベース**ポリシー | **ここだけ違った**（下記） | ← 原因 |

dev の server にだけ、5（`protection`）以前の**残骸**が残っていた:

```
FunctionURLAllowInvokeAction
  Effect=Allow  Action=lambda:InvokeFunction  Principal="*"
  Condition={"Bool": {"lambda:InvokedViaFunctionUrl": "true"}}
```

**`Principal:"*"` で送信元の制限が無い**ので、dev では中継 Lambda がここを通っていた。
production は**最初から protection 付きで作られた＝残骸が無い**ので、CloudFront 向けの
2本しか無く、cron の経路（CloudFront を通さず Function URL を直叩き）は拒否された。

＝ **production の 403 は正しい挙動で、壊れていたのは「dev での検証」のほう。**

#### 何が誤りだったか

`sst.config.ts` にこう書いてあった:

> 🔑 同一アカウントなので**アイデンティティ側だけで足りる**
>   （Function URL のリソースポリシーに足す必要はない）。

**Lambda Function URL の `AWS_IAM` は、同一アカウントでもリソースベース側の許可を要求する。**
「同一アカウントならアイデンティティ側だけで足りる」は多くのサービスで成り立つ一般則だが、
**Function URL では成り立たない**。一般則を、そのサービスで確かめずに適用していた。

🔑 **教訓40 と同じ形である。** 「制約・一般則までは正しい → そこから導いた帰結が誤り」。
違うのは、今回は**検証環境がその誤りを覆い隠していた**こと。だから
「dev で実測検証済み」という**最も信頼していた根拠が、実は無効だった**。

#### 一般化

🔑 **「検証環境で通った」は、検証環境と本番の差が無いことを含意しない。**
とくに**本番のほうが後から作られた**場合、本番は「きれいな初期状態」で、
検証環境には**歴史（＝残骸）**がある。**残骸は緩い方向にしか働かない**ので、
**検証環境のほうが通りやすい**という非対称が生まれる。

🔴 **このプロジェクトは残骸の存在を知っていた。** 5 の記録に
「SST は `WebPublicFunctionUrlAccess*` を実際に削除する。**残骸2本**＋SourceArn 限定の
CloudFront 用2本」と書いてある。**存在は記録したが、それが何かを通していないかは見ていなかった。**
→ 既存の規則「**変更後に在ることは証拠にならない＝回避策は外した状態を1回測る**」
（[[feedback-verification-baseline]]）は、**残骸にも適用すべきだった**。
「残骸だから無害」は測定ではなく分類である。

🔑 **実行可能な形にすると**: **クリーンな環境で1回試す**。今回で言えば、dev に残骸がある以上、
dev の緑は production の緑を保証しない。**残骸のあるステージでの検証は、
残骸を消すか、残骸が効かない経路であることを示すまで完了しない。**

📌 **`simulate-principal-policy` の緑も根拠にならなかった**（見ているのがアイデンティティ側だけ）。
**「権限があるか」を問う道具は、たいてい片側しか見ない。**

📌 型検査の射程も測った（教訓35 の実践）: `aws.lambda.Permission` の
**プロパティ名の誤りは TS2353 で捕まる**が、**`functionUrlAuthType: 'NOPE'` は素通りする**
（値が `string` 型）。＝ **この検査が守るのは名前だけ**で、値の正しさは実物との突き合わせで担保する。

### 42. **「今の状態」は「何も起きなかった」を意味しない — 状態ではなく履歴を見る**

2026-08-02 の夜、私は `aws cloudwatch describe-alarms` で
**「production のアラーム6本すべて OK」**と報告した。その時点では事実だった。
だが**その数時間のあいだにアラームは3回鳴って3回とも自力で戻っていた**。
**自動復旧する仕組みほど、状態を1回見ただけでは何も分からない。**

🔴 **害は「見逃したこと」ではなく「見たと思ったこと」。** 私は確認した気になって
「すべて OK」と報告し、**オーナーに「異常は無かった」と誤って伝えた**。
未確認なら「まだ見ていない」と言えるが、**誤った確認は追加調査の動機を消す**。

🔑 **規則: 復旧しうる対象は、必ず「期間」を指定して履歴を問う。**

```bash
# ✗ 状態（その瞬間だけ）
aws cloudwatch describe-alarms --query 'MetricAlarms[].StateValue'
# ✓ 履歴（期間内に何が起きたか）
aws cloudwatch describe-alarm-history --alarm-name <name> \
  --history-item-type StateUpdate --start-date <T0> --end-date <T1>
```

📌 同じ形は他にもある: Lambda の現在の設定 vs `LastModified`／DNS の現在値 vs 変更履歴／
プロセスの生死 vs ログ。**「今こうなっている」で答えられるのは「今」の問いだけ。**
🔑 **作業の前後で状態が同じでも、途中で変わっていないとは限らない。**
[[feedback-verification-baseline]] の「変更前を同じ手段で測る」の**時間方向の拡張**である。

### 43. **リージョンをまたぐ設計を知っていても、確認は片方で済ませてしまう**

10（CloudWatch Alarms）の記録には、私自身がこう書いていた:

> 🔴 **トピックは2本**（CloudWatch のアクションはアラームと同一リージョン必須／
> **CloudFront のメトリクスは us-east-1 のみ**）

にもかかわらず、確認は **`--region ap-northeast-1` だけ**で行い、
**`siko-production-cloudfront-5xx` が一覧に出てこないことに気づかなかった**。
「6本すべて OK」の**6本という数字自体が、片方のリージョンしか数えていなかった**。

🔴 **数を数えたことが、かえって安心の根拠になった。** 「全部見た」と言えてしまうのは、
**母集団を自分で狭めていることに気づかないから**である。

🔑 **規則: 「全部」と言う前に、母集団の定義を実物に問い直す。**
リージョン・アカウント・ステージ・パーティションをまたぐ設計では、
**列挙コマンドを1回打っただけの結果を「全部」と呼ばない。**

```bash
# アラームは2リージョンに散っている（CloudFront 系は us-east-1）
for r in ap-northeast-1 us-east-1; do
  aws cloudwatch describe-alarms --region $r \
    --query "MetricAlarms[?contains(AlarmName,'siko')].[AlarmName,StateValue]" --output text
done
```

📌 教訓30（ロググループ名は関数名から導けない）と同じ構図で、
**「見つからなかった」と「そこには無い」を区別していなかった**。

### 44. **原因を追えるかどうかは、事故が起きる前に決まっている**

CloudFront の 5xx について、オリジン・Lambda@Edge・CloudFront Function まで潰したところで
**調査が行き止まりになった**。理由は単純で、**証拠が保存されていなかった**から:

- `aws cloudfront get-monitoring-subscription` → **`NoSuchMonitoringSubscription`**
  （追加メトリクス未設定＝**502 / 503 / 504 の内訳が存在しない**）
- **標準アクセスログも未設定**（R-4 の未着手項目）

🔑 **「あとで調べればよい」は、記録が残る設定になっている場合にだけ成り立つ。**
観測性の項目を「余裕ができたらやる推奨タスク」に置くと、**必要になった瞬間には必ず間に合わない**。
今回、R-4 は「推奨タスク」の1行だったが、**実際には切替当日に必要だった**。

🔑 **規則: 不可逆な変更（DNS 切替・本番デプロイ）の前に、
「これが失敗したとき、何を見て原因を言えるか」を1つずつ挙げ、
挙げられないものがあればその観測手段を先に作る。**
Pour Over は 10（アラーム）で「**壊れたことに気づく**」までは作ったが、
「**壊れた理由を言える**」ための記録は作っていなかった。**検知と診断は別の投資である。**

---

## 2026-08-01 のまとめ — **同じ形の失敗が6回起きた**

この日は 11・12 を終えて 13 の準備をした。作業そのものより、**踏んだ罠が全部同じ形**
だったことのほうが後で効く。並べると1つの規則にまとまる。

| # | 何が起きたか | 表面上の見え方 | 実際に壊れていたもの |
|---|---|---|---|
| 1 | `sst.config.ts` にトップレベル import | eslint・tsc・vitest・`check:sst` が**全部緑** | `sst deploy` だけが落ちる（#124） |
| 2 | 任意シークレット11本が未配線 | **デプロイは成功する** | ソーシャルログイン・Sentry・GA が無言で消える（#125） |
| 3 | `SLACK_WEBHOOK_URL` が web に未配線 | **デプロイは成功する** | 6か所の Slack 通知が無言で止まる（#128） |
| 4 | `vercel env pull` が `[SENSITIVE]` を返す | **ファイルは正常に見える** | 18本すべてが同じ固定文字列になるところだった |
| 5 | `ADMIN_PASSWORD_HASH` の `scrypt:` 欠け | **既存の検査を全部通過** | 本番 admin が絶対にログインできない（#129） |
| 6 | `vercel env add --force` | **exit 0 が4本とも返る** | 実際に更新されたのは1本だけ |

### 🔑 規則: **「成功した」と「意図した状態になった」は別の命題である**

6件すべてで、**手元の合図は緑**だった。緑が嘘をついたのではなく、
**緑が答えていた質問が、こちらが訊きたかった質問と違った**。

- `tsc` が答えたのは「型が合うか」で、「SST が読めるか」ではない（1）
- `sst deploy` が答えたのは「作れたか」で、「機能が揃っているか」ではない（2・3）
- ファイルの存在が答えたのは「取得できたか」で、「中身が本物か」ではない（4）
- 検査の `✓` が答えたのは「異常が無いか」で、「正しい形か」ではない（5）
- exit code が答えたのは「コマンドが終わったか」で、「変わったか」ではない（6）

→ **確認したい性質を、その性質そのものに問い合わせる。**
   デプロイなら AWS に `LastModified` を訊く。DNS なら権威 NS 4本に `dig` する。
   Vercel の更新なら `created` を見る。**代理指標で満足しない。**

### 🔑 規則: **秘密は「伏せる」のではなく「測る」**

4 と 5 はどちらも秘密の値で、どちらも**値を見ずに検出できた**。

- 4 … **別々であるべきものが同一**（sha が一致）→ 中身を知らずに異常を確定できる
- 5 … **長さが 168 でなく 161**、しかも差が 7（`scrypt:` の長さ）→ **ズレの量が原因を名指しした**

`<redacted>` に潰す確認方法だと、**どちらも見つからなかった**。
長さ・ハッシュ・接頭辞・重複・正規表現は、**秘密のまま検証できる性質**である。
教訓32 →36 →37 は全部この話で、**測れる性質を増やすほど、秘密のまま確かめられる範囲が広がる。**

### 🔑 規則: **検査は「壊れたと分かる場所」ではなく「壊す前に止まる場所」に置く**

1 は `SST Deploy` が捕まえたが、それは **main への push でしか走らない**＝
**マージするまで分からなかった**。9.5 以降は **main への push＝デプロイ**なので、
**PR で止まらない検査は実質「本番で止まる検査」**である。
→ 再発防止（`check:sst-config`）は `Lint & Type Check` ジョブに入れた。

同じ理由で、4・5 の防止は**手順書ではなくスクリプト**にした（`check-secret-file.mjs`）。
手順書は読まれないことがあるが、`npm run` は止まる。教訓1 の再確認。

### 🔑 規則: **「危険だから避ける」の前に規模を測る**

秘密のローテーションは一般に「既存リンクが死ぬ」「全員ログアウト」という重い操作で、
避けようとすると無理な回避策を探すことになる。実際に測ったら
**`orders` 0件・`auth` 7件・`reservations`/`subscriptions` 0件**だった。
＝ **この時点では実質無害**で、しかも決済停止中の今が**いちばん安いタイミング**だった。
一般論の重さではなく、**自分のデータの重さ**で決める。

### 🔑 規則: **同じ観測に2つの説明が付くなら、区別する実験を先にやる**

`[SENSITIVE]` を最初「エージェント検知」と診断し、手順書に
「オーナー本人が対話的ターミナルでやること」と書いた。**誤りだった**（型が `sensitive`
なだけで、誰がやっても読めない）。区別する実験は「人間のターミナルで同じことをする」で、
**こちらから先に頼むべきだった**。
📌 プレースホルダの**中身を見れば1回で分かった**。`AUTH_SECRET` と `STRIPE_SECRET_KEY` が
同一な時点で**実在の秘密ではないと確定していた**のに、「秘密かもしれないから見ない」を
そこまで引きずっていた。**慎重さも、適用範囲を間違えると判断を鈍らせる。**

### 副産物: 「必要そうに見えるが要らない」が2本あった

`ADMIN_TOTP_SECRET` と `INSTAGRAM_ACCESS_TOKEN` は、どちらも
**DynamoDB を先に読み、無ければ env** という実装だった。そのテーブルは Vercel と AWS が
共有するので、**env に入れるより DynamoDB に任せるほうが soak の同期が自動で取れる**。
→ **判断軸は「Vercel にあるか」ではなく「消費側が何を先に読むか」。**
同様に `CRON_SECRET` は**経路が交差しない**ので一致不要だった。
**移行対象は、移行元にある物の一覧ではなく、移行先の消費側から決める。**
