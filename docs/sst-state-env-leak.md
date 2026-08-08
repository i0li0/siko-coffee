# SST の state に環境変数が平文で保存されていた件

調査日: **2026-08-07** ／ 対象: SST **4.17.1** ／ state バックエンド: `s3://sst-state-ntadsuobcmvm`

関連: [`pour-over-leftovers.md`](pour-over-leftovers.md) C-4 ／ [`pour-over-log.md`](pour-over-log.md) 教訓46

---

## 要旨

`sst.aws.Nextjs` はサイトのビルドを `command:local:Command`（state 上の名前は **`WebBuilder`**）として
実行する。その `environment` 入力に **`sst deploy` を打ったシェルの `process.env` が丸ごと**入り、
**Pulumi の state に平文で保存されていた**。

**キー名だけではない。値が入っていた。** 実測（`app/siko-coffee/{production,dev}.json`）:

| | production | dev |
|---|---|---|
| `environment` のエントリ数 | **217** | **209** |
| うち `SST_SECRET_*` | **17** | 12 |
| うち `GITHUB_*` / `RUNNER_*` / `ACTIONS_*` | **52** | 52 |
| Pulumi の secret 化 | **されていない**（`additionalSecretOutputs` なし・sigil なし） | 同左 |

入っていた資格情報（値の長さで実在を確認・値そのものは記録しない）:

| キー | 中身 | 失効 |
|---|---|---|
| `SST_SECRET_AUTH_SECRET` ほか **17本** | `sst secret` に入れた**本番のシークレット全部**（`CRON_SECRET` / `ADMIN_SESSION_SECRET` / `ORDER_TOKEN_SECRET` / `REVALIDATE_SECRET` / `ADMIN_PASSWORD_HASH` / `GOOGLE_CLIENT_SECRET` / `LINE_CLIENT_SECRET` / `SLACK_WEBHOOK_URL` …） | 🔴 **失効しない＝現用** |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN`（＋ `SST_AWS_*` の同3本） | デプロイ時の一時資格情報（`ASIA…`） | 1時間で失効 |
| `ACTIONS_ID_TOKEN_REQUEST_TOKEN` | GitHub OIDC のリクエストトークン（3,870文字の JWT） | ジョブ終了で失効 |
| `GITHUB_ACTOR` / `GITHUB_*` / `RUNNER_*` 52本 | ランナーのメタデータ | — |

🔴 **いちばん効くのは1行目。** `sst secret` の値は `secret/<app>/<stage>.json` では**暗号化**されているのに、
**同じ値が `app/<app>/<stage>.json` には平文で落ちていた**。暗号化していたつもりの保管が、
隣のファイルで無効化されていた。

📌 `CRON_SECRET` は **2026-08-02 に衛生目的でローテーションしたばかり**で、
その新しい値が **08-03 のデプロイでそのまま平文に載った**。ローテーションが
「その先で平文に落ちる経路」を塞がないと意味を持たない例。

---

## 原因（SST 側のコード）

`.sst/platform/src/components/base/base-ssr-site.ts` の `runBuild()`:

```ts
return siteBuilder(
  `${name}Builder`,
  {
    create: cmd,
    update: cmd,
    dir: path.join($cli.paths.root, sitePath),
    environment: linkEnvs.apply((linkEnvs) => ({
      SST: "1",
      ...process.env,          // ← 🔴 ここ（4.17.1 では 105行目）
      ...(environment ?? {}),
      ...linkEnvs,
      ...(extraBuildEnvironment ?? {}),
    })),
    triggers: [Date.now().toString()],
  },
  { parent, ignoreChanges: process.env.SKIP ? ["*"] : undefined },
)
```

- **絞る引数は存在しない。** `BaseSsrSiteArgs` は `environment` を*足す*ことしかできず、
  `...process.env` はハードコード。`transform` のフックもビルダーには通っていない。
- **upstream に issue も無い**（`anomalyco/sst` を state / environment / credentials で検索・2026-08-07）。
- `siteBuilder`（`.sst/platform/src/components/aws/helpers/site-builder.ts`）は `sst diff` / `sst refresh` のとき
  追加で `local.runOutput` も呼ぶ。**`sst diff` の出力に資格情報が平文で出ていたのはこの経路。**

state 上でこれを持っている**リソースは1つだけ**（全164リソースを走査して確認）:

```
command:local:Command   urn:pulumi:production::siko-coffee::sst:aws:Nextjs$command:local:Command::WebBuilder
```

---

## 保存されていた範囲（S3 の実測・2026-08-07）

`aws s3 ls --summarize` の **318 MB は現行バージョンだけの数字**で、実体は違った。

```
total versions: 1,134   1,923 MB
  app        845 objs   1,608.5 MB   ← 🔴 1つ1つに平文の environment が入っている
  snapshot    55 objs      99.5 MB   ← 同上
  eventlog    55 objs     215.2 MB   ← 同上（1ファイルに AWS_SESSION_TOKEN が56回）
  update     112 objs       0.0 MB
  lock        56 objs       0.0 MB
  secret      11 objs       0.0 MB   ← ここだけは暗号化されている
delete markers: 56
```

`app/` の 845 バージョンは **2026-07-27 〜 08-03**。1回のデプロイで Pulumi が
リソース単位にチェックポイントを書くため、**操作55回（`update/` 56本・`eventlog/` 55本）に対して
バージョンは845**ある＝ 1操作あたり約15本。
＝ **平文の資格情報が845セット**（デプロイごとに別の一時資格情報）残っていた。

### バケットの防御は効いている

| | 実測 |
|---|---|
| Public Access Block | **4項目とも `true`** |
| バケットポリシー | `aws:SecureTransport=false` を Deny（TLS 強制）のみ |
| 既定の暗号化 | SSE-S3（AES256）・SSE-C は禁止 |

＝ **公開されてはいない。** 読めるのは `s3:GetObject` を持つアカウント内のプリンシパル。
GitHub の OIDC ロール `siko-coffee-github-deploy` は **AdministratorAccess** なので、
そのロールにとっては新しい権限にはならない。**効くのは「S3 の read しか持たない主体」に対して**で、
本来なら state を読んでも `secret/` は SSM のパスフレーズが無いと開けないはずが、
**S3 の read だけで本番のシークレット全部が読める**状態になっていた。

📌 容量の話は **2026-08-04 の棚卸しで既に測り直されていて、ライフサイクルも入っている**
（そのとき 1,834 MB・今回 1,923 MB＝ `app/` の最古がまだ14日に達していないため微増中）。
**この調査で新しく分かったのは容量ではなく「その中身が平文だった」ことだけ。**

### 環境変数の丸ごと保存は容量の原因ではない

`environment` の JSON は **18,870 バイト**（state ファイル1本 約2 MB の **約1%**）。
容量を作っているのは `app/` のバージョンと `eventlog/`（1本 約4 MB）で、
**ライフサイクルは既に入っている**:

| ルール | 対象 | 内容 |
|---|---|---|
| `expire-noncurrent-state-versions` | `app/` | 14日 **かつ** 新しい方から10本を超えた分 |
| `expire-eventlog` | `eventlog/` | 30日で削除 |
| `cleanup-delete-markers` / `abort-incomplete-multipart-uploads` | 全体 | — |

`app/` の最古は 07-27（＝11日前）で、**08-10 頃から自然に落ち始める**。
容量は増え続けるのではなく **1.9 GB 前後で頭打ち**する。
S3 Standard で月 **$0.05 程度**＝ **容量は問題ではない。問題は中身。**

---

## 対処（このリポジトリでやったこと）

### ① `environment` を Pulumi の secret にする（PR で実施済み）

`sst.config.ts` の `run()` 冒頭で stack transformation を登録する。
`$util` は SST が供給するグローバル（＝ **トップレベル import の制約に触れない**）。

```ts
$util.runtime.registerStackTransformation((args) => {
  if (args.type !== 'command:local:Command') return undefined
  if (args.props.environment === undefined) return undefined
  const opts = args.opts as $util.CustomResourceOptions
  return {
    props: { ...args.props, environment: $util.secret(args.props.environment) },
    opts: {
      ...opts,
      additionalSecretOutputs: [...(opts.additionalSecretOutputs ?? []), 'environment'],
    },
  }
})
```

🔑 **「値を落とす」ではなく「暗号化する」を選んだ理由。**
許可リストで絞るとビルダーが受け取る環境変数が変わる。`next build` が暗黙に必要としていた
1本を落とせば **無言で壊れる**（sharp の wasm32 フォールバック／Sentry の sourcemaps と同型）。
secret 化ならビルダーが受け取る内容は**一切変わらない**＝ビルドへの影響がゼロで、
state 上の強度は `sst secret` と同じ（パスフレーズは SSM の SecureString）になる。

**実測で確認（`npx sst diff --stage dev`・2026-08-07）**:

```
+  Web sst:aws:Nextjs → WebBuilder command:local:Command
   * environment = {
       "4dabf18193072939515e22adb298388d": "1b47061264138c4ac30d75fd1eb44270",
       "ciphertext": "[secret]"
     }
```

- 138 KB の diff 出力全体で `ASIA` / `AWS_SESSION_TOKEN` / `ACTIONS_ID_TOKEN_REQUEST_TOKEN` /
  `GITHUB_ACTOR` の**一致は0件**（変更前は同じ diff に平文で出ていた）。
- ビルドは通っている（`sst diff` は `local.runOutput` で実ビルドを走らせる・rc=0）。
- この `sst diff` は **`eventlog/` に何も書かなかった**（前後で一覧が一致）＝調査で新たに漏らしていない。

### 🔴🔴 訂正（2026-08-08・同日中）: **①はまだ塞げていない — `eventlog/` は対象外だった**

以下の②は「**state 内の平文はゼロになった**」と書いていたが、**誤り**。
マージ後のデプロイで書かれた state を走査して判明した。

**99オブジェクト全走査の実測:**

| 接頭辞 | 件数 | 値の平文 |
|---|---|---|
| `app/` | 85 | **0** ← #146 はここには効いている |
| `snapshot/` | 7 | **0** |
| 🔴 **`eventlog/`** | **7** | **7件すべて**（production は**17本すべての値**・dev は9本／各ファイルに STS セッショントークン2本） |

🔴 **うち4件は `2026-08-08T08:04` / `08:09` のデプロイが書いたもの＝残骸ではなく継続中。**
＝ **#146 の stack transformation は `app/` の checkpoint にしか効いておらず、
Pulumi のイベントログには従来どおり平文が流れている。**

#### なぜ「ゼロ」と誤判定したか（教訓52）

②の検証では、教訓50 として「**ラベルではなく中身の形を探す**」と決め、
値だけが持つ特徴として `"ASIA`（一時アクセスキーの先頭・**引用符付き**）を対照に使った。

🔴 **ところが `eventlog/` は JSON ではなく `NAME,,,VALUE` のカンマ区切りで、値に引用符が付かない。**
そのため `"ASIA` は **0件**を返し、それを「値は入っていない」と読んだ。**値は最初からそこにあった。**

```
SS_KEY_ID,,,ASIA****        ← 実際の格納形式（引用符が無い）
```

| 検出パターン | `eventlog/` での一致 | 判定 |
|---|---|---|
| `grep -c SST_SECRET_` | 17 | ❌ 名前にも一致するので使えない |
| `"ASIA`（②で使った対照） | **0** | ❌ **偽陰性**。この形式では引用符が付かない |
| **`SST_SECRET_[A-Z0-9_]*,,,`** | **17** | ✅ 名前の直後に区切りと値が続くことを見る |
| **`IQoJb3JpZ2lu`**（STS トークンの base64 先頭） | **2** | ✅ 値そのものの署名 |

🔑 **名前と値の混同を避けるために導入した対照が、同じ欠陥を別の形で持っていた。**
「中身の形を探す」は正しかったが、**形は保存形式ごとに違う**。
**1つの保存形式で検証した対照を、別の保存形式にそのまま持ち込んではいけない。**

📌 **順序は「①塞ぐ →②消す →③回す」に戻る。**
②の削除（1,102件）は有効だったが、①が未完なので **消しても次のデプロイで再び書かれる**。
**ローテーション（③）はここが片付くまで着手しない。**

#### 当座の緩和（2026-08-08 実施）— ⚠️ **これは「塞ぐ」ではない**

`scripts/harden-sst-state-bucket.sh` を追加し（**冪等**）、ライフサイクルを詰めた。
🔴 **このライフサイクルは 08-04 に手で入れられ、記録は散文にしかなかった**（再現も履歴も無し）。
バケットは SST の bootstrap が作るもので `sst.config.ts` の管理下にないため、
IaC ではなくスクリプトで冪等に当てる形にした。

| ルール | 変更前 | 変更後 |
|---|---|---|
| `expire-eventlog` | `Expiration: 30日` | **`1日`** |
| `expire-snapshot` | （無し） | **新設・`7日`** |
| `expire-noncurrent-state-versions`（`app/`） | 14日 / 直近10本 | 変更なし |

**併せて既存の `eventlog/` 7件を削除**（production 4件・dev 3件）＝ **`eventlog/` の残バージョンは 0**。

⚠️ **できたのは「露出時間を 30日から約1日に縮めたこと」だけで、書き込みは止まっていない。**
次のデプロイでまた書かれる。

🔴 **`Days: 1` は「1日で消える」ではない。** S3 のライフサイクル評価は**1日1回の非同期バッチ**で、
実際の削除は閾値到達から**さらに最大24時間ほど遅れる**＝ **実効の露出は最長で約2日**。
また **`Days` の最小値は 1** なので、**ライフサイクルだけで「デプロイ直後に消す」は原理的に作れない**。
それが要るならデプロイ後の明示的な削除になる。

**恒久策（①を本当に塞ぐ）は未着手。** 検討する方向:
1. Pulumi のイベントログに `environment` を載せない方法があるか（SST/Pulumi 側の設定を要調査）
2. デプロイの最後に `eventlog/` を消す（`scripts/deploy.sh` と GitHub Actions の**両方**に要る）
3. そもそも `...process.env` を渡さない（upstream の `base-ssr-site.ts` 由来なので手を入れにくい）

---

### ② 残っている平文の後始末（B を 2026-08-08 に実施。**ただし `app/` に対してのみ有効**）

①は**これから書かれる state にしか効かない**。既に入っている平文は消えない。

**A. 待つ（何もしない）** — ①をデプロイした後、`app/` は14日、`eventlog/` は30日で
ライフサイクルが消す。最後の平文が消えるのは **①のデプロイ日 + 30日**。
→ **採らなかった**（平文が約1か月残るため）。

**B. 能動的に消す** — ✅ **2026-08-08 に実施**。オーナー判断で A ではなく B を選択。

#### 実施結果（実測）

| | 削除前 | 削除後 |
|---|---|---|
| `app/` | 1,006 件 1,955.5 MB | **32 件 69.4 MB** |
| `eventlog/` | 67 件 264.4 MB | **3 件 11.6 MB** |
| `snapshot/` | 67 件 122.0 MB | **3 件 5.8 MB** |
| `lock/` `update/` `secret/` | 215 件 | **215 件（触っていない）** |
| **合計** | **1,355 件 2,341.9 MB** | **253 件 86.8 MB** |

削除は **1,102 件・2,255 MB**。delete marker は **68 → 68 で不変**
（version-id 指定で消したので marker は増えない）。

🔴 **境界は「日付を決め打ち」せず実測した。** 当初 #146 のデプロイ完了時刻
`2026-08-07T06:25:24Z` を境界に使ったが、**その2秒前 `06:25:22` の版は既にクリーンだった**
＝ 決め打ちは外れていた。`production.json` の279バージョンを等間隔にサンプルして
**平文を含む最後の版 `06:19:20` / 最初のクリーンな版 `06:25:18`** を実測し、そこを境界にした。

📌 **`SST_SECRET_` の出現数は 34 ではなく最大 68 だった。**
`sst-state-env-leak` の初回調査は1サンプルの 34 を「変更前の値」として記録していたが、
実際は版によって 34〜68 で揺れる（チェックポイントに含まれるリソース数で変わる）。
**1点の実測を代表値として書くと、後から母集団を見たときに合わない。**

#### 🔑 「消えたこと」ではなく「平文が残っていないこと」を確かめる

削除件数が合っていても目的は果たせていない。**残ったオブジェクトを全部ダウンロードして走査した。**

🔴 **この走査で `eventlog/` を「名前だけ」と誤判定した。上の「訂正」節を参照。**
`app/` と `snapshot/` が平文ゼロという結論は**再走査でも変わっていない**が、
`eventlog/` については**対照の選び方が間違っており、実際には値が入っていた**。

```bash
# 実施手順（再現用）。🔴 現行バージョン（IsLatest=true）は絶対に消さないこと。
aws s3api list-object-versions --bucket sst-state-ntadsuobcmvm --output json > /tmp/versions.json
# 1) 境界を実測する（日付で決め打ちしない）
# 2) manifest を作り、app/ の IsLatest が含まれないことを assert してから delete-objects（1000件ずつ）
# 3) 🔴 削除後に「残ったオブジェクトを全部走査して平文ゼロ」を確認する（件数の一致では足りない）
```

**C. ローテーション**（⏳ **方針決定済み・2026-08-08／実施は未。🔴 ①が片付くまで着手しない**）
— 17本のシークレットは**失効しない**ので、A/B とは独立の判断になる。

#### 🔴 棚卸しで分かったこと: 「17本の平文シークレット」は数を過大に言っていた

名前を並べ直すと、**そもそも秘密でないものが混じっている**。

| 区分 | 本数 | 名前 |
|---|---|---|
| **実質のシークレット** | **10** | `AUTH_SECRET` `ORDER_TOKEN_SECRET` `CRON_SECRET` `REVALIDATE_SECRET` `ADMIN_PASSWORD_HASH` `ADMIN_SESSION_SECRET` `ADMIN_TOTP_SECRET` `GOOGLE_CLIENT_SECRET` `LINE_CLIENT_SECRET` `SLACK_WEBHOOK_URL` |
| **自動で入れ替わる** | 1 | `INSTAGRAM_ACCESS_TOKEN`（週次 cron で更新＝**08-09 の実行で自然に置き換わる**） |
| **元から秘密でない** | 6+ | `MAIL_FROM` `NEXT_PUBLIC_SENTRY_DSN` `NEXT_PUBLIC_GA_MEASUREMENT_ID` `WEBAUTHN_RP_ID` `WEBAUTHN_ORIGIN` `ADMIN_TOTP_REQUIRED`（＋`*_CLIENT_ID` 2本は公開値） |

🔴 **`CRON_SECRET` は 2026-08-02 にローテーション済みだが、その新しい値も 08-07 まで漏れ続けていた。**
＝ **漏洩経路を塞ぐ前のローテーションは、新しい値を同じ穴に流し込むだけになる。**
順序は必ず「①塞ぐ → ②消す → ③回す」。

#### 決定（オーナー判断・2026-08-08）: **外部発行分と影響の小さいものだけ先に回す**

| 対象 | 誰がやるか | 副作用 |
|---|---|---|
| `SLACK_WEBHOOK_URL` | 🔴 **人**（Slack で再発行） | 無し |
| `GOOGLE_CLIENT_SECRET` | 🔴 **人**（Google Cloud コンソール） | 無し |
| `LINE_CLIENT_SECRET` | 🔴 **人**（LINE Developers） | 無し |
| `CRON_SECRET` | `sst secret set` | 無し（各環境が自分の値を検証する＝**Vercel 側は触らない**） |
| `REVALIDATE_SECRET` | `sst secret set` | 無し |
| `ORDER_TOKEN_SECRET` | `sst secret set` | ⚠️ **発行済みの注文照会リンクが失効する** |
| ~~`AUTH_SECRET`~~ ~~`ADMIN_*`~~ | **今回は据え置き** | 全ユーザーのセッション切れ／管理者パスワードと TOTP の再登録 |

🔴 **6本すべてが `sst secret set` の後の再デプロイで初めて効く**ので、
**外部3本の再発行を待って1回のデプロイにまとめる**（分けると本番デプロイが2回になる）。

🔴🔴 **ただし着手の前提が1つ増えた（2026-08-08 の訂正）＝ `eventlog/` を塞ぐこと。**
今のまま回すと、**ローテーションのための再デプロイそのものが新しい値を `eventlog/` に平文で書く。**
＝ `CRON_SECRET` を 08-02 に回したのに新しい値も 08-07 まで漏れ続けた、**あの形をもう一度やることになる**。
**待ち条件は「外部3本の再発行」ではなく「① の完了 → 外部3本の再発行」の順。**

| | 内容 |
|---|---|
| 漏れた先 | **アカウント内の S3 read を持つプリンシパル**のみ（公開はしていない） |
| 現在の IAM ユーザー | **1人**（`shun`・MFA 有効）。ほかに AdministratorAccess のロール1本と静的キー1本 |
| 実際に第三者が読んだ形跡 | 🔴 **知る手段が無い**。`siko-coffee-trail`（マルチリージョン）は**管理イベントのみ**で `DataResources` が空＝ **S3 の `GetObject` は記録されていない**（`aws cloudtrail get-event-selectors` で実測） |

🔴 **「誰も読んでいないはず」は測定ではない。** ただし読んだかどうかを事後に知る手段が無い以上、
判断は「読まれた可能性のコスト」対「ローテーションのコスト」になる。
ローテーションするなら副作用がある: `AUTH_SECRET` は**全ユーザーのセッションが切れる**、
`ADMIN_PASSWORD_HASH` は**管理者パスワードの変更**、`SLACK_WEBHOOK_URL` は Slack 側の再発行。
`sst secret set` の後は **再デプロイが必須**（値は deploy 時に焼き込まれる）。

📌 一時資格情報（AWS の3本・OIDC トークン）は**ローテーション不要**。
1時間／ジョブ単位で失効しており、最後に書かれたのは 08-03。
ただし「失効しているから無害」ではなく「**失効を実測した上で対象外にした**」と書いておく。

---

## 予防として効いていること・効いていないこと

| | |
|---|---|
| ✅ CI（GitHub Actions ＋ OIDC）からのデプロイ | 資格情報が一時的＝ state に落ちても1時間で腐る |
| 🔴 ローカルからの `npm run sst:deploy` | `scripts/deploy.sh` ② が `aws configure export-credentials` で環境変数へ展開する。**①が無ければローカルの資格情報が state に入る** |
| 🔴 `sst secret set` を手で打つとき | 同じ展開を手でやる運用になっている（`deploy.sh` 冒頭のコメント）。**シェルに残した資格情報は次の `sst deploy` で state に入る** |

＝ **「デプロイは CI からのみ」という運用だけでは足りない。** `sst secret set` のような
CI を通らないコマンドが同じシェルの環境変数を汚すため。①（secret 化）は経路によらず効く。

---

## SST の更新で壊れないか

`registerStackTransformation` は Pulumi の API で、SST 自身も同じものを4か所で使っている
（`.sst/platform/src/auto/run.ts` ほか）。壊れるとしたら **`command:local:Command` という型名が変わる**か、
**`environment` というプロパティ名が変わる**とき。どちらも起きたら **transformation が黙って何もしなくなる**。

🔴 **黙って効かなくなる形の変更なので、SST を上げたら以下を1回打って確かめること**:

```bash
# 期待: environment が "[secret]" になっていること（平文の一覧が出たら transformation が外れている）
npx sst diff --stage dev 2>&1 | grep -A4 'WebBuilder command:local:Command'
```
