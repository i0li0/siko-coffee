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
- **最終実測日: 2026-08-20**（S-3 の再破綻 → 原因特定 → **C-6 / C-7 の対処を本番稼働まで**）。

## 全体像

| 群 | 本数 | 説明 |
|---|---|---|
| **A. Pour Over 本編の残り** | **3**（14 は S-3 のみ残・15・16） | 21タスクのうち未完のもの。これが終われば Pour Over は完了 |
| **B. 意図的に見送った技術判断** | 4 | やらないと決めたのではなく、**判断材料が揃うまで待っている**もの |
| **C. Pour Over が生んだ小さな負債** | **1**（元7・C-1/C-2/C-4/C-5/**C-6**/**C-7** 完了。残るは C-3） | 移行の過程で生まれ、まだ回収していないもの |
| **D. 推奨タスク（R-1〜R-10）** | 9 | コスト非制約の前提で挙がった改善。R-3 は不採用確定 |
| **E. スコープ外と明記したもの** | 5 | **Pour Over と混ぜないと決めた**もの。完了後に着手する |

---

## A. Pour Over 本編の残り（3本）

進捗 **18.5/21**（15 の①だけ完了）。✅ **13 は完了＝本番トラフィックは AWS（CloudFront）で稼働中**
（切替 `2026-08-02T19:39:15Z`）。🟡 **14（soak）は S-3 以外の5条件を達成**。
🔴 **S-3 は 3回破れた（08-05 / 08-13 / 08-20）が、3回目は同日中に発生源を潰した。**
✅ **現在の起算 `2026-08-20T07:43:45Z`（＝ C-6/C-7 が本番で有効になった時刻）／到達 `2026-08-27T07:43Z`**。
🔑 **前2回と条件が違う**＝ 08-05・08-13 は **λ を下げないままの引き直し**（7日クリアの確率34%・
期待所要21日／教訓60）だったが、今回は **#168 で C-6・C-7 を両方潰してからの引き直し**で、
**#144 以降の発報相当2件はどちらもこの2つに帰着した＝既知の発生源は残っていない**。
**①〜⑤は待たずに進めてよく、待つのは⑥の手前だけ**。
残るは **14 の S-3 ／ 15（決済再開＋Vercel 解約）／ 16（Vercel 依存の撤去）**。

| # | 内容 | いつ | 状態（2026-08-09 実測） |
|---|---|---|---|
| ~~**13-4**~~ | ~~**DNS 切替**~~ | — | ✅ **完了**（`2026-08-02T19:39:15Z`）。🔴 www は **UPSERT では通らず `DELETE`＋`CREATE`** が要った（教訓40） |
| ~~5-1~~ | ~~3-a〜3-h を実 DNS でやり直す~~ | — | ✅ **完了・全項目合格**（`x-amz-cf-pop: KIX56-P4` で AWS 配信を直接確認） |
| ~~5-2~~ | ~~**4 の②③回収**~~ | — | ✅ **完了（2026-08-02）。ただし前提が2つとも変わっていた**（下記） |
| ~~5-3~~ | ~~`CRON_STAGES` に `'production'` ＋ 発火窓ずらし~~ | — | ✅ **完了**（#135 → 403 の修正 #136 → **#137**）。🔴 計画の「切替後なら安全」は誤りだった（下記）。🔴 **有効化が日次枠を過ぎた後だったため `cleanup-pending` / `po-timeouts` の初回は 08-03T20:00Z / 20:20Z**（14 の S-1 で追跡） |
| ~~5-4~~ | ~~`ci.yml` の `matrix.stage` に `production`~~ | — | ✅ **完了**（#134）＝ `[dev, production]`。🔴 **main への push は本番に入る** |
| ~~5-6~~ | ~~Instagram トークンの確認~~ | — | ✅ **完了（2026-08-09T03:30:13Z）**。`cron(30 3 ? * SUN *)` の**初回発火が実測できた**（人の操作ゼロを CloudTrail で確認）＝失効は **2026-10-08**。**以後は AWS の週次（60日で8回）で自走する**ので、15 で Vercel の月次を消してよい |
| **14** | **soak 期間**（Vercel を生かしたまま観測） | — | 🟡 **6条件のうち5つ達成**。🔴 **S-3 は3回破れた**: ①`08-05T19:53Z`（Lambda@Edge throttle・#144）→②`08-13T20:31Z`（自作自演の checkout 503・#166）→③`08-20T02:02Z`（Instagram 署名URL失効・**#168 で対処**）。✅ **現在の起算 `2026-08-20T07:43:45Z`（＝ C-6/C-7 が本番で有効になった時刻。🔴 **後から `LastModified` を叩いても返らない**＝docs のマージでも本番は再デプロイされ前へ進むため、**正本はこの文字列**）／到達 `2026-08-27T07:43Z`**。🔑 **前2回と違い、今回は発生源を潰してからの引き直し**（#144 以降の発報相当2件はどちらも C-6/C-7 に帰着＝既知の発生源は残っていない） |
| **15** | **決済再開 ＋ Vercel 解約** | **着手可** | 🔴 **順序は決済再開が先・解約が後**（不可逆点は解約1か所）。正本は [`pour-over-15-16-runbook.md`](pour-over-15-16-runbook.md)＝計画の手順は**投入先が腐っている**（Vercel の env と書いてあるが本番は AWS）。✅ **①配線 完了（2026-08-13）**＝ 次は**②オーナー作業**（Stripe の webhook URL 確認 → 署名シークレット取得 → `sk_live_` を用意）。🔴 **IAM アクセスキー `AKIAZQY7YB2C3BYMZCYG`（`shun` / AdministratorAccess）の削除を必ず含める**＝解約しても AWS 側に残る |
| **16** | **Vercel 依存の撤去（①〜⑨）** | 15 の後 | 🔴 `vercel.json` だけ消すと **build が全環境で落ちる**（`prebuild` → `check-cron-schedule.mjs`）。📌 計画の表は長く「①〜⑦」と書いていたが**本文には⑧まである**（本作業で訂正） |

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

### 16 の撤去リスト（①〜⑨）

①`redirects()` ②`vercel.json` ③`check-cron-schedule.mjs` + `prebuild` + `check:cron`
④CI の該当ステップ ⑤`hostRedirects.test.ts` ⑥`src/lib/stage.ts` の `?? VERCEL_ENV`（+ `stage.test.ts` の該当ケース）
🔴 **⑥は2か所ある**: `stage.ts`（実行時）と **`next.config.ts` の `env.NEXT_PUBLIC_STAGE`（ビルド時・C-1 で追加）**。
式が同じなので `grep -rn VERCEL src/` だけでは **`next.config.ts` が漏れる**（`src/` の外）
⑦`isVercelPlatform()` と `layout.tsx` の呼び出し＋`@vercel/analytics`/`@vercel/speed-insights` の依存
⑧`src/lib/cronAuth.ts` の `Authorization: Bearer` 形式の受け入れ
🆕 ⑨`src/lib/revalidateAuth.ts` の `Authorization: Bearer` 分岐（#160 で追加・⑧ と同時に消す）

📌 ⑥⑦は `stage.ts` に集めてあるが、**⑥は `next.config.ts` にも1か所ある**（上記）。
🔑 **⑧⑨ は AWS 経路では最初から機能していない**（CloudFront の OAC が `Authorization` を
SigV4 署名で上書きするため・#160）。撤去しても**挙動は変わらない**。
それでも消すのは、残すと「そのヘッダでも通るはず」という誤読を再生産するから。

---

## 🔴 14（soak）の終了条件（2026-08-03 に新設）

**それまで、どこにも定義されていなかった。** 正本（`aws-migration-feasibility.md` の 14）に
書いてあるのは「**Vercel は `main` 自動デプロイのまま生かす**」＝ soak 中の *禁止事項* だけで、
**どれだけ続けるのか、何が満たされたら 15 へ進んでよいのか**が無かった。

🔑 **終了条件の無い観測期間は、両方向に転ぶ。**
早く切り上げれば切り戻し先を失ったまま未検証の経路が残り、
惰性で延ばせば **15 が止まり、その先の決済再開と E-4（ブレンド PF）まで止まる**。
＝ このプロジェクトが繰り返し踏んできた「**積み残しは『なぜ要るか』を持たないと腐る**」
（5-2・5-3）が、いちばん大きな単位で起きうる場所だった。

### 進んでよい条件（全部満たしたら 15 へ）

| # | 条件 | なぜ必要か | 現況（**2026-08-07 更新**） |
|---|---|---|---|
| S-1 | **cron 4本すべてが production で1回以上成功** | 移設先の経路が本ごとに未証明。「1本の 200 を他の本の根拠にしない」 | ✅ **達成（2026-08-09）＝ 4/4**。`release-reservations` ／ `cleanup-pending`（08-03T20:00:04Z）／ `po-timeouts`（08-03T20:20:26Z）に加え、**`instagram-refresh` が 08-09T03:30:10Z に status=200**（所要 3,003ms） |
| S-2 | **`instagram-refresh` が AWS 経由で `refreshedAt` を更新** | 依存 E・L。**60日止まると恒久失効**し手動再認証が要る。**15 は Vercel の月次を消す**ので、その前に AWS 側の更新が実証されている必要がある | ✅ **達成（2026-08-09T03:30:13.314Z）。スケジュール発火であることまで確定**（下記）。`expiresIn` 5,184,000 ＝ **失効は 2026-10-03 → `2026-10-08T03:30Z` へ後退**。＝ **依存 E・L は AWS 側の週次で自走する**ことが実証され、**15 で Vercel の月次を消してよい** |
| S-3 | **アラーム遷移ゼロの連続日数 ≥ 7日** | 週次 cron を1周含むため。**状態ではなく履歴**で見る（教訓42）／**2リージョン**で（教訓43） | 🔴 **起算し直し。`2026-08-13T21:24:19Z`（＝率から件数へ直したアラームが有効になった時刻・`AlarmConfigurationUpdatedTimestamp`）→ 到達 `2026-08-20T21:24Z`**。🔑 **直前の OK 復帰（`20:51:32Z`）を起算にしない**のは、それより前の指標が**まだ壊れたアラームのもの**で「遷移が無かった」と「測れていなかった」を区別できないため。🔑 **事故のたびに起算が後ろへ動く**ので、他が揃っても引き直す |
| S-4 | **5xx スパイクの再発が無い、または原因が説明できる** | 08-02 の3回は**原因未特定のまま**終わった。R-4 が入ったので**次に起きたら説明できる**はず | ✅ **満たした**。08-05 の再発を `LambdaLimitExceeded` ＋ 同時実行クォータ 10 まで説明し、#144 で是正した |
| S-5 | **アイコンのアップロードを本番で1回通す** | 4 の presign→PUT→検閲→公開が**本番では未実測**（dev のみ）。15 の後に壊れていると分かっても Vercel へ戻せない | ✅ **達成（2026-08-08）。🔴 1回目は失敗し、本番でしか出ない不具合を1本見つけた**（CSP の `connect-src` に S3 が無く、ブラウザが presigned PUT を送信前にブロック＝ PR #153 で修正）。修正後に4段すべてを実測: 公開バケットに実体 162,792 bytes ／ Rekognition `DetectModerationLabels` **ちょうど1回** ／ `pending/` **0件**（後片付け済み）／ DynamoDB の `avatarChangedAt` `avatarUrl` が更新され `avatarPreset` は削除 |
| S-6 | **B-2（warmer）と B-1（arm64）の採否を決める** | soak を待っていた判断。**未決のまま 15 へ進むと待った意味が消える** | ✅ **達成（2026-08-04・オーナー判断）**＝ B-2 は soak 明けに採用、B-1 は soak 明けに単独で測って判断 |

📌 **期間そのものは条件ではない。**
🔴 ~~S-3 が実質の下限（7日＝ 2026-08-09 以降）で、S-1・S-2 も 08-09 に揃う。
最短で 2026-08-09〜08-10 あたりが 15 の開始可能日~~ ← **失効**（08-02T22:36Z 起算のままの数字）。
**S-3 の起算が 08-05T19:53Z に後退したため、実質の下限は `2026-08-12T19:53Z`**
＝ **15 の開始可能日は 08-12 以降**（S-1・S-2 の 08-09 より S-3 のほうが後ろになった）。
🔑 **S-3 は「経過を待つ条件」なので、事故のたびに後ろへ動く。**
**他の条件が揃った時点で S-3 も揃っていると思い込まない**＝毎回いちばん遅いものを引き直す。
✅ ~~🔴 **S-5 だけは人の操作が要る**~~ ＝ **2026-08-08 に実施して達成**。
🔑 **やってよかった典型例**＝ **1回目は失敗し、本番でしか出ない不具合を1本捕まえた**
（CSP の `connect-src` に S3 のオリジンが無く、presigned PUT が送信前にブロックされていた）。
**表示は通っていたので、テストでも目視でも出なかった。** 15 の後に見つかっていたら
Vercel へ戻せないまま直すことになっていた＝ **S-5 を条件に入れた理由がそのまま出た。**
✅ **S-1・S-2 は 2026-08-09 に達成。残る条件は S-3（08-12T19:53Z）だけ。**

### ✅ S-2 達成の実測（2026-08-09）— **今度は「誰が動かしたか」を先に確かめた**

`refreshedAt` が **`2026-08-09T03:30:13.314Z`** に進んだ。スケジュールは
`cron(30 3 ? * SUN *)`（日曜 03:30 UTC）で、**13秒差**。ただし
教訓49 のとおり**値が進んだことだけでは主体を決められない**ので、そこまで測った。

| 測ったこと | 結果 |
|---|---|
| CronRelay のログ | `03:30:10.411Z [cron] relay /api/cron/instagram-refresh start` → `done 3003ms status=200` |
| **CloudTrail（03:00〜04:00Z の `Username=shun`）** | 🟢 **0件＝人の操作は一切なし** |
| 直近の `ConsoleLogin` | **08-08T07:18Z**＝この実行の**約20時間前** |
| 発火時刻とスケジュールの一致 | 03:30:10Z ⇔ `cron(30 3 ? * SUN *)`（13秒差） |

＝ **EventBridge Scheduler が発火した**と確定。
📌 08-04（手動）のときは `ConsoleLogin` の**2分後**に invoke されていた。今回はそれが無い。
🔴 **リクエストID の形は根拠に使っていない**（この実行も孤立形 `d16a77f4-…` だった＝
「孤立＝手動」は誤り。上の訂正を参照）。

### 🔴 S-2 は「達成」と読み違えかけた — トークンは**手動 invoke**で更新されていた（2026-08-08 実測）

`refreshedAt` を引くと **`2026-08-04T17:41:16.339Z`** で、記録されていた
`2026-08-01T00:21:11Z` から進んでいた。**ここで「AWS の週次が動いた＝S-2 達成」と読むのは誤り。**

| 測ったこと | 結果 |
|---|---|
| AWS の schedule | `cron(30 3 ? * SUN *)` UTC・**ENABLED**・最終更新 08-02T20:30Z |
| Vercel の cron | `0 0 1 * *`（毎月1日） |
| **08-04 は何曜日か** | 🔴 **火曜日**＝ **どちらのスケジュールにも当たらない** |
| CronRelay のログ | `08-04T17:41:14Z [cron] relay /api/cron/instagram-refresh start` → `status=200` |
| ~~リクエストID の形~~ | 🔴 **判定材料にならない（2026-08-09 に訂正）。** 当時「`release-reservations` は連番風（`106a72XX-…`）なのにこの1本だけ孤立した `6bd9f0ea-…`」を傍証に挙げたが、**08-09 の“スケジュール”実行も同じ孤立形（`d16a77f4-…`）だった**。連番風に見えたのは**そのスケジュール固有の並び**にすぎない |
| CloudTrail | **`ConsoleLogin`（`shun`）が 17:39:16Z**、invoke が 17:41:14Z、`FilterLogEvents` が 17:41:48Z |

＝ **AWS コンソールから手動でテスト実行された**もの（Lambda の invoke はデータイベントなので
CloudTrail 本体には出ないが、前後の管理イベントで挟める）。
🔴 **結論は正しいが、根拠は CloudTrail の1本だけに絞ること**（上の「リクエストID の形」は誤り）。

**何が実証され、何がまだか:**

- ✅ **アプリ側の経路は実証された** — production Lambda → ルート → Instagram API →
  DynamoDB 書き込みまで通って 200。**ここがいちばん壊れやすい部分**で、それは晴れた。
- 🔴 **EventBridge Scheduler → CronRelay の発火だけが未実証**。ただし
  **同じ中継関数・同じ配線を他3本が実証済み**なので残リスクは小さい。
- 🟢 **副産物**: 失効期限が **2026-09-30 → 2026-10-03** に伸びた（08-04 + 60日）。

🔑 **「値が進んでいた」は「意図した仕組みが動いた」と同じではない。**
このプロジェクトが繰り返している「状態ではなく履歴を見る」の変種で、
**進んだこと自体は本物でも、進めた主体が違えば結論が変わる**。
`refreshedAt` だけを見て S-2 に ✅ を付けていたら、**15 で Vercel の月次を消した後に
「実は AWS の週次は一度も発火していなかった」**という形で表に出ていた。

📌 **08-09T03:30Z（日曜）の実行を確認すれば S-1 と S-2 が同時に片付く。**
トークンは 08-04 更新済み＝Instagram の「24時間以上経過」条件は満たすので更新は通るはず。

### CloudFront 5xx（2026-08-08T07:29Z 実測・負の対照つき）

| 期間 | `5xxErrorRate` Max | `Requests` Sum |
|---|---|---|
| 08-05T07:29Z〜08-06T07:29Z | **100.0**（＝ S-3 を破った 08-05 の事象） | 1,133 |
| 08-06T07:29Z〜08-07T07:29Z | **0.0** | 380 |
| 08-07T07:29Z〜08-08T07:29Z | **0.0** | 190 |

🔴 **負の対照**: 同じクエリをドメイン接頭辞 `d38zi1bm4zf9e3` で撃つと **`[]`（空配列）**。
＝ 正しい `E3FC7N27IY6A73` で引けていることの確認（教訓: **ID を間違えると
エラーではなく空が返り「5xx ゼロ」に読める**）。

⚠️ **直近48hの 0.0 は #144 の効果の証明ではない。** 08-06〜08-07 の枠は
#144 のデプロイ（08-07T06:00Z）より**前**が大半で、そこでも既に 0.0 だった。
#144 が効いている根拠は従来どおり「**ビヘイビアから Lambda@Edge が 0 本になった**」であって、
「その後 5xx が出ていない」ではない。

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

## C. Pour Over が生んだ小さな負債（残り1本・元7本）

移行の過程で生まれ、まだ回収していないもの。いずれも**実測で現存を確認済み**。

| # | 内容 | 影響 | 確認 |
|---|---|---|---|
| ~~C-1~~ | ~~**`src/instrumentation-client.ts` に `environment` が無い**~~ | ✅ **完了（2026-08-03）**。`next.config.ts` の `env` が **ビルド時に `STAGE ?? VERCEL_ENV` を焼き込み**、`getClientStage()` が読む。**実ビルド3本の成果物で確認**（AWS 経路・Vercel 経路の正の対照＋未設定時が `(void 0)??"development"` の負の対照）。🔴 残るのは**デプロイ後に Sentry のダッシュボードを人が見る**工程 | `grep -n "environment" src/instrumentation-client.ts` |
| ~~C-2~~ | ~~**`sentry.edge.config.ts` の `tracesSampleRate: 1`**~~ | ✅ **完了（2026-08-03）**。🔴 **対象は edge だけではなく client との2か所だった**（本番の実ブラウザで `__SENTRY__` を読み `tracesSampleRate: 1` を実測して判明）。率の決定を `tracesSampleRateFor()` へ集約し3ファイルを揃えた（本番10% / それ以外0%）。🔑 soak 中のトラフィックは大半がスキャナなので、100% 送信は**本当に見たいエラーが落ちる**形でクォータを食う | `grep -rn "tracesSampleRate" sentry.*.config.ts src/instrumentation-client.ts` |
| C-3 | **`BLOB_READ_WRITE_TOKEN` が Vercel 本番 env に残存** | **死んだ env**。4 で S3 へ移したのでコードは `@vercel/blob` を一切参照していない（grep 0件）。実害は無いが、16 の掃除対象 | `grep -rn "BLOB_READ_WRITE_TOKEN\|@vercel/blob" src/ package.json` が空 |
| ~~C-4~~ | ~~🔴 **state に残っている平文シークレットの後始末とローテーション**~~ ✅ **完了（2026-08-08）** | 🔴🔴 **2026-08-08 に「完了」と書いたのは誤りだった（同日中に訂正）。①はまだ塞げていない。**<br>**何が本当か（99オブジェクト全走査・実測）**: `app/` 85件 **平文0**／`snapshot/` 7件 **平文0**／🔴 **`eventlog/` 7件は全件が平文**（production は**17本すべての値**・dev は9本・各ファイルに STS セッショントークン2本）。<br>🔴 **うち4件は 2026-08-08T08:04 / 08:09 のデプロイが書いた＝残骸ではなく継続中**。**#146 は `app/` にしか効いていない。**<br>✅ **②の削除自体は本物で有効**: 1,355件 2,341.9MB → 253件 86.8MB（**1,102件・2,255MB を削除**）。`app/` の現行2本は保持、`lock/`/`update/`/`secret/` は不変、delete marker 68→68。**消した対象が違ったのではなく「終わった」の判定が早すぎた。**<br>🔴 **誤判定の原因**: 「ラベルでなく中身の形を探す」として `"ASIA`（引用符付き）を対照にしたが、**`eventlog/` は JSON ではなく `NAME,,,VALUE` のカンマ区切り**で引用符が付かず、一致0を「値なし」と読んだ。**正しい検出は `SST_SECRET_[A-Z0-9_]*,,,` と STS トークンの `IQoJb3JpZ2lu`**（教訓52）。<br>✅✅ **①②③すべて完了（2026-08-08）＝ C-4 は終了。**<br>**③ローテーション実施**: `SLACK_WEBHOOK_URL` / `GOOGLE_CLIENT_SECRET` / `LINE_CLIENT_SECRET`（オーナーが各コンソールで再発行）＋ `CRON_SECRET` / `REVALIDATE_SECRET` / `ORDER_TOKEN_SECRET`（`openssl rand -hex 32`）の**6本を1回のデプロイでまとめて反映**。`AUTH_SECRET`・`ADMIN_*` は**据え置き**（全ユーザーのセッション切れ／管理者パスワードと TOTP 再登録に見合わない）。<br>📌 **`ORDER_TOKEN_SECRET` の影響範囲を先に測った＝注文0件・予約0件・サブスク0件**＝ **実害ゼロ。決済停止中の今がいちばん安い**（「危険だから避ける」の前に規模を測る）。<br>✅ **実測**: デプロイ成功 → **`eventlog/` は 0 件**（＝**新しい値が S3 に残っていない**＝①②③の順序が効いた）→ ローテーション後の初回 cron が **status=200**（＝ `CRON_SECRET` が中継と server で揃っている・かつて 403 で壊れた箇所）→ 本番 200・アラーム7本とも OK で遷移0。<br>✅ **原因を特定し、デプロイごとの自動削除まで入れた（08-08）**。<br>**原因**: `eventlog/` の平文は **Pulumi の debug 診断1行**（`diagnosticEvent.message`・23KB）で、`RegisterResource RPC finished: … WebBuilder …` が **RPC 応答の構造体をそのまま文字列化**したもの。**`$util.secret()` は保存に効くがこの debug ログはマスクを通らない**＝ #146 で塞げなかった理由。🔴 **`sst deploy` に止めるフラグは無い**（`--verbose` は増やす方向のみ）。<br>**対処**: `scripts/purge-sst-eventlog.sh` を追加し、唯一の入口 `scripts/deploy.sh` から **`trap … EXIT` で**呼ぶ（**失敗時こそ debug が多い**ため成功時だけでは足りない）。CI も `npm run sst:deploy` を通るので1か所で足りる。dev で**正常系 exit 0・異常系 exit 1 でも後始末が走る**ことを実測。<br>⚠️ **完全な封じ込めではない**（書き込み〜削除の数秒は S3 上に存在）。併せて lifecycle も `eventlog/` 30日→**1日**・`snapshot/` 7日を新設（`scripts/harden-sst-state-bucket.sh`・冪等）。🔴 **`Days:1` は「1日で消える」ではない**（非同期バッチで最大+24h／最小値1＝即時削除は作れない）。<br>🔴 **恒久策は upstream 側**（debug 診断に secret マスクを通すか、`...process.env` を渡さない）＝ **こちらでは閉じられない**。詳細は [`sst-state-env-leak.md`](sst-state-env-leak.md) §対処② | 🔴 **`grep -c SST_SECRET_` では判定できない**（名前にも一致する）<br>`aws s3api get-object --bucket sst-state-ntadsuobcmvm --key <eventlog のキー> f.json` → `grep -o 'SST_SECRET_[A-Z0-9_]*,,,' f.json \| wc -l`（0 なら値は無い）<br>**🔴 落としたファイルは平文なので確認後すぐ消す** |
| ~~C-5~~ | ~~**`brace-expansion` の high 勧告が `overrides` に塞がれて自動修正されない**~~ ✅ **完了**（2026-08-20 実測: open alert **0本**・`Dependabot Updates` の失敗は 08-07 が最後） | **Dependabot は止まっていたのではなく、失敗し続けていた**（`Dependabot Updates` が 08-05・08-07 と連続 failure・**PR は1本も出ない**）。勧告は `>=5.0.9` を要求するのに `package.json` の `"minimatch@^10": { "brace-expansion": ">=5.0.8 <6" }` が下限を 5.0.8 に留めていた（ログ: `The latest possible version that can be installed is 5.0.8 because of the following conflicting dependency`）。**直すのは下限を `>=5.0.9 <6` に締め直すだけ**だが、🔴 **メジャー跨ぎの override は eslint を `TypeError: expand is not a function` で壊した前科がある**ので `npm ci` ＋ `npm run lint` を通してから入れる。教訓48 | `gh api repos/i0li0/siko-coffee/dependabot/alerts --jq '.[] \| select(.state=="open")'`<br>`gh run list --workflow "Dependabot Updates" --limit 10` |
| ~~**C-6**~~ | ~~🔴🔴 **Instagram の署名付き画像URLが失効し `/_next/image` が 500 を返す**~~ ✅ **完了（#168・2026-08-20T07:43:45Z 本番稼働）** | **ユーザー可視のバグ**（トップの Instagram セクションの画像が壊れる）＋ **S-3 を破る発生源**。実測: 08-17T01:10Z に1件・**08-20T01:55Z に6件でアラーム発報**。<br>**原因**: `/` の応答が `s-maxage=2, **stale-while-revalidate=2592000**`（**30日**）で、CloudFront のキャッシュポリシー（Min0/Default0/**Max 1年**）がそれを尊重する。**Instagram の署名寿命は約5日8時間**（`oe` を復号して実測）。**HTML の陳腐化寿命 > 署名の寿命**になった瞬間に 500 が出る。<br>🔴 **低トラフィック（99〜2,498 req/日）が緩和ではなく悪化要因**＝アクセスの少ないエッジほど何日も古い HTML を配る。<br>📌 **Lambda の `Errors` は 0**（アプリが 500 を返している）＝ Lambda メトリクスだけでは見つからない。<br>✅ **入れたもの（#168）**: `/` を **6時間ごと**に CloudFront から無効化する cron（`CronRefreshHome` / `cron(42 0/6 * * ? *)`）。🔑 **SWR は変えられないと判明した**＝ `s-maxage=2, stale-while-revalidate=2592000` は **OpenNext のハードコード**（`core/routing/util.js`）で `next.config.ts` からも `revalidate` からも変えられず、ヘッダ書き換えには origin-response の Lambda@Edge が要る＝ **C-7 のリスクを自分で増やす**ため却下。無効化なら全エッジのコピーを消せる（6時間 ≪ 署名寿命5日）。📌 **専用 Lambda を作らず `CronRelay` に相乗り**＝新規 Lambda は新規アラームを要し、**新規アラームは必ず `INSUFFICIENT_DATA → OK` の遷移を1回作る**＝ S-3 の観測面が増えるため。✅ **実測**: 手動実行で `{"invalidationId":"ICN698DLYK3FSRX364JJWBLAE3"}`・CloudFront 側に `Paths:["/"]`・ログに `invalidate done 1542ms`。⚠️ **スケジュール発火はまだ未確認**（手動実行は「スケジュールが引く」証明ではない） | Logs Insights（`siko-production-cloudfront-access-logs`）で `filter \`cs-uri-stem\`='/_next/image' and \`sc-status\`>=500`<br>`curl -sI https://www.sikocoffee.com/ \| grep -i cache-control` |
| ~~**C-7**~~ | ~~🔴 **未知パスへのスキャンが Lambda@Edge の同時実行クォータ（10）を枯渇させ 503 になる**~~ ✅ **完了（#168）** | 実測: 08-13T17:50Z に**単一IP `35.252.127.169` が SEA900 経由で 1,208 req/5分**（`/.env` `/.ssh/id_ecdsa` `/.claude.json` 等の秘密ファイル探索）→ `LambdaLimitExceeded` 503 が12件。<br>🔴🔴 **#144 は静的アセットの経路を外しただけで、デフォルトビヘイビア（未知パス）は今も Lambda@Edge を通る**＝ 08-07 の「クォータ引き上げは不要」の前提が欠けていた（教訓59）。<br>📌 **枯渇した枠は共有**なので、同じ5分に来た本物のリクエストも 503 になる＝「スキャナが受けるだけ」は誤り。<br>✅ **入れたもの（#168）**: WAF に `SiteWideRateLimit`（priority 3 / Block / **600 req / 300秒 / IP**）。🔑 **閾値はアクセスログ7日分の実測から決めた**（1IP・5分あたり）: **1,208**=止めたいスキャナ／597・559=ボット／**290〜315**=常連の分散スクレイパ（6IP・EU エッジ・同一UA）／174以下=その他。600 は**スキャナだけを跨ぎ、常連ボットにも実ユーザーにも届かない**位置。300 まで下げれば分散ボットも止まるが誤検知が現実的（オーナー判断で不採用）。✅ **負の対照**: `/`・`/shop`・`/legal/privacy` とも 200。⚠️ **`BlockedRequests` の継続観測はこれから** | `aws service-quotas get-service-quota --region us-west-2 --service-code lambda --quota-code L-B99A9384`<br>`aws wafv2 get-web-acl --scope CLOUDFRONT --region us-east-1 --name AdminWaf-1a5556d --id <id> --query 'WebACL.Rules[].Name'` |
---

## D. 推奨タスク R-1〜R-10（9本・R-3 は不採用確定）

`aws-migration-feasibility.md`「推奨タスク」が正本。**コスト非制約の前提**で挙がったもので、
Pour Over の完了条件ではない。**実測で状態が分かるものは下に書いた。**

| # | 内容 | 現況（2026-08-02 実測） |
|---|---|---|
| R-1 | **CloudFront Response Headers Policy** | パリティ退行の直接の対処。静的ヘッダを配信層へ寄せる |
| R-2 | **CloudWatch RUM** | 🔑 **切替で Speed Insights を失う**＝これがその代替。失う前の基準値は**デスクトップの RES 97 / LCP 2.66s のみ**（モバイルは元からデータ無し） |
| ~~R-3~~ | ~~CloudFront 継続的デプロイ~~ | **❌ 不採用確定**。切り戻しは DNS を戻すだけで足りる（11 の 60s TTL で回収済み） |
| **R-4** | **観測の土台（CloudFront standard logging v2 / 追加メトリクス / DLQ / Synthetics canary）** | ✅ **standard logging v2 は完了（2026-08-03）**＝ `sst.config.ts` の「診断（R-4）」ブロック。**dev・production の両方**で CloudFront のアクセスログを **CloudWatch Logs**（`siko-<stage>-cloudfront-access-logs`・保持30日）へ配信。**「作れた」で止めず、実際にログが届き 404 を診断フィールド付きで引けるところまで実測した**（下記）。残りは**追加メトリクス**（メトリクスごと課金なので予算と併せて判断）・DLQ・Synthetics canary。<br>🔴 昇格の理由: 2026-08-02 に 5xx が3回スパイクしたが、**ログも内訳メトリクスも無いため原因を特定できないまま終わった**（教訓44）。**検知（10）と診断は別の投資**<br>🔴🔴 **【2026-08-20】この診断は 08-03 に1回引かれたきり17日間引かれず、その間に未知の障害2件（08-13 のスキャナ・08-17 の Instagram 失効）が記録されたまま気づかれなかった。**さらに 08-20 の調査では **`DistributionConfig.Logging` が `Enabled:false` なのを見て「ログが無い」と誤結論した**（**v2 は legacy のフィールドを使わない＝`false` が正常**）。✅ **存在確認は受け手側から**: `aws logs describe-log-groups --region us-east-1 --log-group-name-prefix siko-`。→ 教訓58。**未了項目に「アラーム通知に Logs Insights クエリを同梱する」を追加**（引くことを人の記憶に依存させない） |
| R-5 | **SES を運用できる状態にする**（SPF・DMARC・MX・custom MAIL FROM・configuration set） | 🟡 **一部完了（2026-08-10）**。✅ **configuration set + イベント宛先は #161 で本番稼働**＝**1通ごとのバウンス・苦情が Slack に届く**（dev / production の両方をメールボックスシミュレータで実測）。残りは **DMARC の `rua=` / custom MAIL FROM / MX** で、いずれも**オーナー判断待ち**。詳細は[下記](#r-5-の内訳2026-08-10-実測) |
| R-6 | コールドスタート対策（＝ B-2 の warmer） | B-2 と同一。soak 待ち |
| R-7 | 実行ロールと同時実行を絞る | `ses:*` と `cloudfront:CreateInvalidation` の `Resource: "*"` を限定 |
| R-8 | 配信まわりの小改善 | **実測: IPv6 = `false` / `CustomErrorResponses` = 0件 / HTTP version = `http2`**（http3 でない）。Origin Shield も未設定 |
| R-9 | アカウントのガバナンス | ✅ **Access Analyzer は完了（2026-08-03）**＝ `scripts/bootstrap-access-analyzer.sh` で **ap-northeast-1 と us-east-1 の2つ**（リージョン単位なので片方だと母集団が欠ける・教訓43）。冪等性も2回目の実行で実測。<br>⬇️ **IAM パスワードポリシーは「やらない」に降格した（理由を測り直した結果・下記）**。有料は GuardDuty / Config / Security Hub |
| R-10 | 掃除 | 下記 |

### R-5 の内訳（2026-08-10 実測）

「SES を運用できる状態にする」は5つの別々の作業で、**進み方が違う**ので分けて書く。

| # | 項目 | 実測 | 状態 |
|---|---|---|---|
| ① | SPF | `v=spf1 include:amazonses.com ~all` | ✅ 済 |
| ② | DKIM | CNAME 3本・`DkimAttributes.Status = SUCCESS` | ✅ 済 |
| ③ | **configuration set + イベント宛先** | 以前は **0件** → `siko-<stage>-emails` が両ステージに存在 | ✅ **#161 で完了** |
| ④ | **DMARC の `rua=`** | `v=DMARC1; p=none;` **のみ**＝ 届け先が無い | ⏳ **未決**（下記） |
| ⑤ | **custom MAIL FROM** | `MailFromAttributes` に `MailFromDomain` 無し | ⏳ 未決 |
| ⑥ | **MX** | **無し**＝ `@sikocoffee.com` 宛は誰にも届かない | ⏳ 未決 |

```bash
dig +short TXT _dmarc.sikocoffee.com          # ④
dig +short MX sikocoffee.com                  # ⑥（空なら無し）
aws sesv2 get-email-identity --email-identity sikocoffee.com --region ap-northeast-1 \
  --query 'MailFromAttributes'                # ⑤
aws sesv2 list-configuration-sets --region ap-northeast-1   # ③
```

#### 🔴🔴 ④ で分かったこと: **Gmail を `rua` の宛先にはできない**

「`rua=mailto:siko.is.coffee@gmail.com` と書けば済む」と考えたが、**成立しない。**

**RFC 7489 §7.1（External Destination Verification）**: レポート先が DMARC レコードの
ドメインと**別ドメイン**の場合、**受け側のドメイン**が
`<送信元ドメイン>._report._dmarc.<受け側ドメイン>` に `v=DMARC1` を publish していないと、
準拠したレポーターは**送信を拒否する**。

実測（2026-08-10）:

| 確認したもの | 結果 |
|---|---|
| `sikocoffee.com._report._dmarc.gmail.com` | **無し** |
| `_report._dmarc.gmail.com`（ワイルドカード的なもの） | **無し** |
| `sikocoffee.com._report._dmarc.dmarcian.com` | 無し（＝**登録後に先方が publish する**仕組み） |

🔑 **設定しても1通も届かないまま「設定済み」に見える。**
このプロジェクトが繰り返し踏んできた「**宣言したのに配線されていない**」
（#125・#128・#160）と同じ形が、DNS の側で起きる。

⚠️ **自ドメイン宛（`dmarc@sikocoffee.com`）なら外部宛先認可は不要**だが、
**⑥ の MX が無いので受信できない**。＝ **④ と ⑥ は独立ではなく、④の選択肢が⑥を決める。**

#### ④ の選択肢（2026-08-10 時点・**未決のまま保留**）

| | 内容 | 代償 |
|---|---|---|
| **A** | DMARC レポートサービス（Postmark DMARC Digests / dmarcian / URIports。無料枠あり） | 登録すると先方が `_report._dmarc` を publish するので**外部宛先認可が成立**し、XML でなく人が読めるサマリが届く。作業は **DNS 1レコード**。トレードオフは**ドメインの認証状況を第三者に渡す**こと。🔴 **アカウント作成はオーナーが行う** |
| **B** | SES 受信で自前（MX → SES inbound → S3） | `dmarc@sikocoffee.com` が成立し、**⑥ も同時に埋まる**。データは自分の AWS 内。🔴 **生の DMARC XML は読めない**ので、解析まで書かないと **S3 にゴミが溜まるだけ** |
| **C** | B ＋ Lambda で XML を解析して Slack へ | #161 の中継に相乗りできる。いちばん手がかかるが「読まれないレポート」にならない |
| **D** | やらない | 送信量が 0〜少数のうちはレポートの情報量も少ない。R-9 の IAM パスワードポリシーと同じ「理由を測ったら消えた」に倒れる可能性 |

📌 **SES 受信（inbound）は ap-northeast-1 で使えることを確認済み**
（`aws ses list-receipt-rule-sets --region ap-northeast-1` が成功・ルールセットは 0 件）
＝ B / C はリージョンの制約では詰まらない。

#### 📌 ⑤ が効くのは「SPF alignment」だけ

custom MAIL FROM が無いと Return-Path は `*.amazonses.com` になるので、
**SPF は amazonses.com に対して整合し、`sikocoffee.com` には整合しない**。
ただし **DKIM alignment は通っている**（`d=sikocoffee.com`）ので、**DMARC 自体は DKIM で pass する**。
＝ ⑤ は「壊れているものを直す」ではなく「**片肺を両肺にする**」作業。優先度はその分低い。

### 🔴 R-9: IAM パスワードポリシーは「やらない」（2026-08-03・前提を測り直して降格）

「無料で今すぐできる2件」と書いていたが、**実測したら片方は守る対象がほぼ無かった**。

| 測ったこと | 結果 |
|---|---|
| IAM ユーザー総数 | **1人**（`shun`） |
| そのうちコンソールログインを持つ | **1人** |
| MFA | **有効（1デバイス）** |

＝ パスワードポリシーが効く対象は **MFA 済みの単独ユーザー1人だけ**で、実質は書式の強制にすぎない。
しかも 15（Vercel 解約）で `AKIAZQY7YB2C3BYMZCYG` を消すため、**資格情報は減る方向**にある。
🔴 **`MaxPasswordAge` を入れると強制ローテーションが走り、唯一の管理者が締め出されうる**＝
**入れる価値より事故の目のほうが大きい**。

🔑 **これも 5-2 / 5-3 と同じ形**＝「無料だから」「ガバナンスだから」という
**一般論のまま持ち越された作業**で、**理由を測ると消えた**。
**無料であることは、やる理由にはならない**（維持と注意の対象は増える）。
一方 **Access Analyzer は残した**。理由が一般論ではなく**このプロジェクトの実際の事故**に
結び付いているため（教訓41 の `Principal:"*"` 残骸は、まさに Analyzer が挙げる対象）。

### R-10 の掃除リスト（実測済み）

| 対象 | 状態 |
|---|---|
| Amplify（app / association） | ✅ **0-c で削除済み** |
| 孤児 ACM 検証 CNAME 2本 | ✅ **削除済み**（Route53 に残る CNAME は ACM 検証 `_c84c…` 1本・DKIM 3本・`www` のみ） |
| 空バケット `siko-coffee` | 🔴 **残存・中身は空** |
| `/aws/amplify/*` ロググループ | 🔴 **残存**（`/aws/amplify/d3059a6gcvih7x`） |
| ~~dev の `Principal:"*"` 残骸 4本~~ | ✅ **除去済み（2026-08-03）＝ dev と production のパリティ回復**（dev server は production と同じ 4 statement / `Principal:*` ゼロ）。除去後に **dev cron 200・直叩き 403・`AuthType=AWS_IAM`** を実測。`siko-coffee-dev-WebServer…` と `…WebImageOptimizer…` に `FunctionURLAllowPublicAccess` / `FunctionURLAllowInvokeAction` が各2本。**2026-08-03 に Access Analyzer が初回スキャンで検出**。現時点では不活性（①の条件 `AuthType=NONE` に対し実際は `AWS_IAM`）だが、**dev を production より緩いままにしている**＝「dev で検証済み」の根拠が教訓41 と同じ弱さを持つ。手順と検証は `pour-over-log.md` |
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
            ├→ 16（Vercel 依存の撤去 ①〜⑨）
            │    └→ E-1（middleware→proxy）… 同じファイル群
            └→ E-4（ブレンド PF の E2E・サブスク）… 決済再開が前提
```

**待ち条件を持たないもの**（いつでも着手できる）: B-1・B-3・R-1・R-5・R-7・R-8・R-10・E-2・E-3・E-5
（C-1・C-2・R-9 は 2026-08-03 に完了／R-9 のパスワードポリシー分は「やらない」に降格）

🔴 **C-4 は ①（塞ぐ）に差し戻し。** #146 は `app/` にしか効いておらず、
**`eventlog/` にはデプロイのたびに 17本の値と STS トークンが平文で書かれ続けている**（08-08 実測）。
②の削除（1,102件）は有効だったが、①が未完なので**消しても次のデプロイで再び書かれる**。

**C（ローテーション）は方針決定済みだが着手しない。** 待ち条件は
「外部3本の再発行（人の作業）」**より前に、まず `eventlog/` を塞ぐこと**。
🔑 **塞ぐ前に回すと新しい値を同じ穴に流すだけ**（`CRON_SECRET` で実証済み）。

**C-5** は PR #149 で対処（`brace-expansion` の override 下限 ＋ Dependabot に見えていなかった `nanoid`）。

---

関連: [`aws-migration-feasibility.md`](aws-migration-feasibility.md)（計画・正本） /
[`pour-over-log.md`](pour-over-log.md)（実施ログと教訓） /
[`pour-over-13-runbook.md`](pour-over-13-runbook.md)（切替当日の手順）
