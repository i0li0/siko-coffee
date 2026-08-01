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

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/check-secret-file.mjs <env-file>')
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
]

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

// 入れてはいけないもの。とくに AWS_* は「静的キーを置かない」という移行最大の成果を打ち消す。
const FORBIDDEN = [
  /^AWS_ACCESS_KEY_ID$/,
  /^AWS_SECRET_ACCESS_KEY$/,
  /^AWS_SESSION_TOKEN$/,
  /^STRIPE_/,
  /^PAYMENTS_ENABLED$/,
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

// ── ④ 必須の充足 ──────────────────────────────────────────
const present = new Set(entries.map((e) => e.key))
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
