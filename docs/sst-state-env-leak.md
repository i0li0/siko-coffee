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

### ② 残っている平文の後始末（**未実施・判断が要る**）

①は**これから書かれる state にしか効かない**。既に入っている平文は消えない。

**A. 待つ（何もしない）** — ①をデプロイした後、`app/` は14日、`eventlog/` は30日で
ライフサイクルが消す。最後の平文が消えるのは **①のデプロイ日 + 30日**。

**B. 能動的に消す** — ①のデプロイ後に、それより古い非現行バージョンと `eventlog/` / `snapshot/` を削除する。
非現行バージョンは Pulumi の動作には不要（手動復旧用）。

```bash
# 🔴 ①をデプロイして「現行バージョンが secret 化されている」ことを確かめてから実行する。
#    現行バージョン（IsLatest=true）は絶対に消さないこと。
aws s3api list-object-versions --bucket sst-state-ntadsuobcmvm --prefix app/ \
  --query 'Versions[?IsLatest==`false`].{Key:Key,VersionId:VersionId}' --output json > /tmp/old.json
# 中身を目視してから delete-objects に渡す（1000件ずつ）
```

**C. ローテーション** — 17本のシークレットは**失効しない**ので、A/B とは独立の判断になる。

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
