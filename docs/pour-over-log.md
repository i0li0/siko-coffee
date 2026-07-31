# Pour Over 実施記録

**計画の正本は [aws-migration-feasibility.md](./aws-migration-feasibility.md)。** こちらは
「実際に何をして、何が分かったか」を時系列で残す実行ログ。計画は先の話を、ここは済んだ話を扱う。

目的は2つ。①次に触るとき「なぜこうなっているか」を再調査せずに済ませる
②同じ形の失敗を他の作業でも避けられるよう、教訓を移植可能な形にしておく。

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
| dev の web ACL（6） | `AdminWaf-a3068a4` / us-east-1 / scope `CLOUDFRONT`<br>⚠️ **ステージごとに1枚できる**（$8/月）。`WAF_STAGES` で作るステージを絞る |
| dev の cron（8） | EventBridge Scheduler 4本 → 中継 Lambda `siko-coffee-dev-CronRelayFunction-*` 1つ<br>⚠️ **production は DISABLED で作られる**。有効化は `CRON_STAGES` に `'production'` を足す＝ **13 の DNS 切替後** |
| デプロイの入口 | **`npm run sst:deploy -- --stage <stage>`**（素の `npx sst deploy` を打たない） |

### 🔴 消してはいけない DNS レコード

**`_c84c530444dc328407ddf8a6cf46916b.sikocoffee.com`（CNAME）**

上記ワイルドカード証明書の検証レコード。これを消すと ACM の自動更新が止まる。
一度「Amplify 由来の孤児」として削除したが、**ACM の検証トークンはドメイン＋アカウントに対して
決定的**なため、証明書を作り直した際に同じ名前が再利用され、現在は現役になっている。

### 期限のあるもの

| | 期限 | 確認方法 |
|---|---|---|
| Instagram 長期トークン | **2026-08-30 失効** / 次の更新機会 **2026-08-01 00:00 UTC（Vercel の月次・この1回きり）** | `siko-coffee-config` の `INSTAGRAM_ACCESS_TOKEN` の `refreshedAt`（Vercel のログは不要）<br>🔴 8 で AWS 側を**週次**にしたが、production のスケジュールは 13 まで DISABLED なので、それまで頼れるのは Vercel の月次だけ |
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

### 9.5 GitHub Actions ＋ OIDC で `sst deploy` を自動化（2026-08-01・🔶 実装のみ／未検証）

🔶 **この項目はまだ「済」ではない。** コードは入ったが、**AWS 側のロール作成と
CI からの実デプロイが未実施**なので、進捗は 13/21 のまま据え置いている。
このプロジェクトの完了基準は「実測で確かめた」ことであり、
**ワークフローの文法が通ったことは、デプロイできたことの証明ではない**（教訓27 と同型）。

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

**🔴 残っている完了条件②**

マージ後、`deploy` ジョブが dev へ実際にデプロイして緑になることを確認する。
成否は **AWS 側に問い合わせて**確定させる（教訓23）。例えば server Lambda の
`LastModified` が CI 実行時刻に更新されているか。

**次への申し送り（13 で必ず読む）**: `matrix.stage` に **`production` を足すのは DNS を
切り替えた後**。先に足すと本番ステージが CI から先に作られ、13 の「production デプロイ →
検証 → DNS 切替」という順序が飛ぶ。`CRON_STAGES` に production を足すのが 13 の後なのと同じ理由。

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
