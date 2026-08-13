#!/usr/bin/env node
// `sst secret load` に渡す前に、その .env ファイルが**本当に投入してよいもの**かを検査する。
//
//   node scripts/check-secret-file.mjs /tmp/po-sst.env
//
// 🔴 **なぜ要るのか（2026-08-01 に実際に踏みかけた）。**
//   `vercel env pull` は **Vercel の `sensitive` 型の変数を復号せず、リテラル
//   `[SENSITIVE]` を書く**。実測では対象18本の**相異なる値がちょうど1つ**で、
//   `AUTH_SECRET` と `STRIPE_SECRET_KEY` が同一文字列だった。
//   そのまま `sst secret load` していたら **production の18本すべてが `[SENSITIVE]` という
//   固定文字列**になり、しかも **`sst deploy` は成功する**。
//   動かなくなるのはユーザーのログインと注文照会リンクである。
//   ⚠️ **これはエージェント検知ではない。** `sensitive` 型は作成後**誰も**復号できない
//   （ダッシュボードでも REST API でも）。対話的なターミナルで取り直しても同じ結果になる。
//
// 🔑 **値を一切表示せずに判定する。** 出すのは key・length・ハッシュの先頭だけ。
//   「伏せる」と「測る」の使い分け（教訓32）。伏せるだけの確認は、
//   **確かめたい性質そのものを消してしまう**ことがある。

import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// 🔴 `--partial` … **既存の production に数本だけ足す**ファイル（15 ③の決済3本など）。
//   これが無いと ⑤（必須の充足）が必ず落ちる — あの検査は 13 の一括投入
//   （7本+任意11本を1ファイルで入れる）を前提に書かれているため。
//   ⚠️ **緩めるのは⑤だけ。** ①重複・②空値・③禁止・④形式は部分投入でも全部走る
//      （危険を作るのはそちらで、⑤は「足りているか」しか見ていない）。
const argv = process.argv.slice(2)
const partial = argv.includes('--partial')
const file = argv.find((a) => !a.startsWith('--'))
if (!file) {
  console.error(
    'usage: node scripts/check-secret-file.mjs [--partial] <env-file>\n' +
      '  --partial  既存 production への追加投入（必須の充足検査を省く）',
  )
  process.exit(2)
}

// `sst.config.ts` の SECRET_NAMES と対応（欠けると sst deploy が落ちる）
const REQUIRED = [
  'AUTH_SECRET',
  'ORDER_TOKEN_SECRET',
  'CRON_SECRET',
  'REVALIDATE_SECRET',
  'MAIL_FROM',
  'ADMIN_PASSWORD_HASH',
  'ADMIN_SESSION_SECRET',
]

// `sst.config.ts` の OPTIONAL_SECRET_NAMES と対応（欠けても deploy は通るが機能が消える）
const OPTIONAL = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'LINE_CLIENT_ID',
  'LINE_CLIENT_SECRET',
  'ADMIN_TOTP_REQUIRED',
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_GA_MEASUREMENT_ID',
  'WEBAUTHN_RP_ID',
  'WEBAUTHN_ORIGIN',
  // 🔴 2026-08-01 追加。10 で中継 Lambda 用にだけ宣言されており、アプリ本体の
  //    environment に入っていなかった。無いと `src/lib/slackNotify.ts` が黙って
  //    return し、6か所の Slack 通知が無言で止まる。
  'SLACK_WEBHOOK_URL',
  // 🔴 2026-08-13 追加（15 ①）。**それまで FORBIDDEN に入っていた**＝この検査を通そうとすると
  //    必ず落ちる状態だった。禁止していた理由は「決済停止中で `sst.config.ts` に配線が無い＝
  //    投入しても効かない」であって、**配線した今は理由のほうが消えている**。
  //    🔑 このプロジェクトで4例目の「積み残しは理由を持たないと腐る」。禁止も同じで、
  //      **禁止の理由が消えたのに禁止だけが残ると、正しい作業を止める側に回る**。
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'PAYMENTS_ENABLED',
]

// 🔑 **秘密ではない値**＝重複検査（①）の対象外。`PAYMENTS_ENABLED=true` と
//   `ADMIN_TOTP_REQUIRED=true` は**正しく設定するとどちらも `true`** になるので、
//   除外しないと「プレースホルダ混入」を誤検知して**正しいファイルを止める**。
//   ⚠️ 除外してよいのは「値の空間が小さく、重複が正常」なものだけ。
const NON_SECRET = new Set(['PAYMENTS_ENABLED', 'ADMIN_TOTP_REQUIRED'])

// 🔑 **env に入れる必要が無いもの（DynamoDB が正）。** どちらも
//   「DynamoDB を先に読み、無ければ env」という実装なので、DynamoDB に実物がある限り
//   env は使われない。しかも DynamoDB は **Vercel と AWS が同じテーブルを共有する**ので、
//   soak 中の同期も自動的に取れる。→ **投入しないのが正しい**。
const DB_BACKED = {
  ADMIN_TOTP_SECRET:
    'siko-coffee-config の totp_secret（/admin/settings で登録し直すと入る）',
  INSTAGRAM_ACCESS_TOKEN:
    'siko-coffee-config の INSTAGRAM_ACCESS_TOKEN（cron が更新している）',
}

// 🔴 **形式が決まっている値。** 2026-08-01 に `ADMIN_PASSWORD_HASH` で実際に踏んだ:
//   `<salt>:<hash>` は正しく作れていたのに **先頭の `scrypt:` が欠けていた**（161文字。
//   正しくは 168）。`src/lib/adminPassword.ts` の `verifyScrypt` は
//   `parts.length !== 3 || parts[0] !== 'scrypt'` で**即 false** を返すので、
//   **本番の admin が絶対にログインできず、しかも「パスワードが違う」ようにしか見えない**。
//   長さや重複の検査は通ってしまうので、**形が決まっているものは形で見る**。
// 🔑 ここに書けるのは「値を知らなくても判定できる性質」だけ。中身の正しさ（その
//   パスワードのハッシュか等）は別問題で、それは投入後に本人が確かめる。
const FORMATS = {
  ADMIN_PASSWORD_HASH: {
    re: /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/,
    hint: 'scrypt:<salt32桁hex>:<hash128桁hex>（全長168）。src/lib/adminPassword.ts の hashPassword() の出力そのまま',
  },
  ADMIN_TOTP_REQUIRED: {
    re: /^(true|false)$/,
    hint: "'true' か 'false'（api/admin/auth は === 'true' で判定する）",
  },
  MAIL_FROM: { re: /@/, hint: 'メールアドレスを含む（例: 表示名 <user@example.com>）' },
  NEXT_PUBLIC_SENTRY_DSN: { re: /^https:\/\//, hint: 'https:// で始まる Sentry の DSN' },
  NEXT_PUBLIC_GA_MEASUREMENT_ID: { re: /^G-/, hint: 'G- で始まる測定 ID' },
  SLACK_WEBHOOK_URL: {
    re: /^https:\/\/hooks\.slack\.com\//,
    hint: 'https://hooks.slack.com/ で始まる Incoming Webhook の URL',
  },
  WEBAUTHN_ORIGIN: { re: /^https:\/\//, hint: 'https:// から始まるオリジン' },
  WEBAUTHN_RP_ID: {
    re: /^[a-z0-9.-]+$/,
    hint: 'ホスト名のみ（スキームやスラッシュを含めない）',
  },
  // 🔴 決済の3本（15 ③）。**接頭辞で取り違えを止める**のが目的。
  //   実際に起こりうる取り違えが2つある:
  //     ① `sk_test_` を本番に入れる … 決済が通ったように見えて金銭が動かない
  //     ② `pk_live_`（公開キー）を `STRIPE_SECRET_KEY` に入れる … 401 になる
  //   ⚠️ ここで見られるのは**形だけ**。「そのアカウントの正しいキーか」は投入後に本人が確かめる。
  STRIPE_SECRET_KEY: {
    re: /^sk_live_[A-Za-z0-9]+$/,
    hint: 'sk_live_ で始まる本番のシークレットキー（sk_test_ / pk_ ではない）',
  },
  STRIPE_WEBHOOK_SECRET: {
    re: /^whsec_[A-Za-z0-9]+$/,
    hint: 'whsec_ で始まる署名シークレット（エンドポイントを作り直すと値が変わる）',
  },
  PAYMENTS_ENABLED: {
    re: /^true$/,
    hint: "'true' のみ。それ以外は全部「停止」を意味する（src/lib/payments.ts はフェイルクローズ）",
  },
}

// 入れてはいけないもの。とくに AWS_* は「静的キーを置かない」という移行最大の成果を打ち消す。
const FORBIDDEN = [
  /^AWS_ACCESS_KEY_ID$/,
  /^AWS_SECRET_ACCESS_KEY$/,
  /^AWS_SESSION_TOKEN$/,
  // 📌 `STRIPE_*` / `PAYMENTS_ENABLED` は 2026-08-13 に**ここから OPTIONAL へ移した**（15 ①）。
  //    配線したので投入してよい。形式は FORMATS で見る。
  /^BLOB_/,
  // ビルド時にしか使われない＝ Lambda の env に入れても効かない
  /^SENTRY_(ORG|PROJECT|AUTH_TOKEN)$/,
  /^VERCEL/,
  /^NX_|^TURBO_/,
]

const raw = await readFile(file, 'utf8')

const entries = []
for (const line of raw.split('\n')) {
  if (!line.trim() || line.trimStart().startsWith('#')) continue
  const i = line.indexOf('=')
  if (i < 0) continue
  const key = line.slice(0, i).trim()
  let value = line.slice(i + 1)
  // `sst secret load` は引用符を剥がす（dev のダミーで実測済み）。同じ扱いで判定する。
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  entries.push({ key, value })
}

const errors = []
const warnings = []

// ── ① プレースホルダ検出（今回の本命）──────────────────────
// 別々の秘密が同じ値になることは実運用ではまず無い。1つでも重複したら復号漏れを疑う。
const byValue = new Map()
for (const { key, value } of entries) {
  if (NON_SECRET.has(key)) continue // 'true' 同士の正常な重複で誤検知しないように
  if (!byValue.has(value)) byValue.set(value, [])
  byValue.get(value).push(key)
}
for (const [, keys] of byValue) {
  if (keys.length > 1) {
    errors.push(
      `値が重複している: ${keys.join(', ')}\n` +
        '    → `vercel env pull` が復号せずプレースホルダ（`[SENSITIVE]`）を書いた可能性が高い。\n' +
        '      🔴 Vercel の `sensitive` 型は作成後**誰も**復号できない（取り直しても同じ）。\n' +
        '      docs/pour-over-13-runbook.md の 1-3 に沿って、他システムからの復元か\n' +
        '      両側同時のローテーションで値を用意すること。',
    )
  }
}

// ── ② 空値 ────────────────────────────────────────────────
for (const { key, value } of entries) {
  if (value === '') errors.push(`空文字が入っている: ${key}`)
}

// ── ③ 入れてはいけないもの ────────────────────────────────
for (const { key } of entries) {
  if (FORBIDDEN.some((re) => re.test(key))) {
    errors.push(
      `投入してはいけない値が含まれている: ${key}（絞り込みの grep を見直すこと）`,
    )
  }
}

// ── ④ 形式 ────────────────────────────────────────────────
for (const { key, value } of entries) {
  const spec = FORMATS[key]
  if (spec && !spec.re.test(value)) {
    errors.push(`形式が違う: ${key}\n    → 期待: ${spec.hint}`)
  }
}

// ── ⑤ 必須の充足 ──────────────────────────────────────────
const present = new Set(entries.map((e) => e.key))
if (partial) {
  console.log(
    '# --partial: 必須の充足検査を省いた（既存 production への追加投入として扱う）',
  )
} else {
  for (const key of REQUIRED) {
    if (!present.has(key)) {
      errors.push(`必須が欠けている: ${key}（sst deploy がこれで落ちる）`)
    }
  }
  for (const key of OPTIONAL) {
    if (!present.has(key)) {
      warnings.push(
        `任意が欠けている: ${key}` +
          (key === 'ADMIN_TOTP_REQUIRED'
            ? '  🔴 これが欠けると admin がパスワードのみで通る'
            : ''),
      )
    }
  }
}

// DynamoDB が正のものを**入れてしまっている**場合に知らせる（害はないが不要）。
for (const key of Object.keys(DB_BACKED)) {
  if (present.has(key)) {
    warnings.push(
      `入れなくてよい: ${key} … ${DB_BACKED[key]} が使われるため env は読まれない`,
    )
  }
}

// ── 出力（値は絶対に出さない）─────────────────────────────
console.log(`# ${file}（${entries.length} 件）`)
for (const { key, value } of entries) {
  const h = createHash('sha256').update(value).digest('hex').slice(0, 8)
  const tag = REQUIRED.includes(key)
    ? '必須'
    : OPTIONAL.includes(key)
      ? '任意'
      : key in DB_BACKED
        ? '不要(DB)'
        : '対象外'
  console.log(
    `  ${key.padEnd(32)} len=${String(value.length).padStart(4)}  sha=${h}  ${tag}`,
  )
}

if (warnings.length) {
  console.log('\n⚠️  警告')
  for (const w of warnings) console.log(`  - ${w}`)
}

if (errors.length) {
  console.error('\n✗ 投入してはいけない状態です')
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

console.log('\n✓ このファイルは `sst secret load` に渡してよい')
