#!/usr/bin/env node
// vercel.json の cron スケジュールが Vercel Hobby プランの制約（1日1回まで）を満たすか検証する。
// Hobby は「1日より頻繁に実行される」cron 式をデプロイ時に拒否する（ビルド前に弾かれ、
// Vercel 上にデプロイのレコードすら残らないため原因が分かりにくい）。ここで push/CI 前に落とす。
//
// 判定: minute と hour は**単一の整数**でなければならない（`m h * * *` 形式）。
//   `*` / `*/N` / リスト(`1,13`) / レンジ(`0-5`) はいずれも1日に複数回発火しうるため不可。
//   day-of-month / month / day-of-week は制限しても頻度が下がるだけなので何でもよい。
//
// 実行: node scripts/check-cron-schedule.mjs  （prebuild と CI から呼ばれる）

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const vercelJsonPath = join(root, 'vercel.json')

let config
try {
  config = JSON.parse(readFileSync(vercelJsonPath, 'utf8'))
} catch (err) {
  console.error(`✗ vercel.json を読めませんでした: ${err.message}`)
  process.exit(1)
}

const crons = config.crons ?? []
const errors = []

// 単一整数フィールドか（範囲チェック付き）
function isSingleInt(field, min, max) {
  if (!/^\d+$/.test(field)) return false
  const n = Number(field)
  return n >= min && n <= max
}

for (const cron of crons) {
  const { path, schedule } = cron
  if (typeof schedule !== 'string') {
    errors.push(`${path}: schedule が文字列ではありません`)
    continue
  }
  const fields = schedule.trim().split(/\s+/)
  if (fields.length !== 5) {
    errors.push(`${path}: "${schedule}" は5フィールドの cron 式ではありません`)
    continue
  }
  const [minute, hour] = fields
  if (!isSingleInt(minute, 0, 59) || !isSingleInt(hour, 0, 23)) {
    errors.push(
      `${path}: "${schedule}" は1日に複数回発火します（Hobby プランは日次まで）。` +
        `minute と hour を単一の値にしてください（例: "10 18 * * *"）。`,
    )
  }
}

if (errors.length > 0) {
  console.error('✗ vercel.json の cron が Vercel Hobby プランの制約（1日1回まで）に違反しています:\n')
  for (const e of errors) console.error(`  - ${e}`)
  console.error(
    '\n頻繁な処理が必要なら、リクエスト時の sweep で代替するか Pro プランへ。詳細は docs/blend-platform-plan.md §14.3。',
  )
  process.exit(1)
}

console.log(`✓ cron スケジュール ${crons.length} 件はすべて日次以下です（Hobby プラン適合）`)
