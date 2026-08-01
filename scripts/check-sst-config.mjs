#!/usr/bin/env node
// `sst.config.ts` に**トップレベル import** が無いことを確かめる。
//
// なぜ専用の検査が要るのか:
//   SST は設定を読むとき、トップレベル import を見つけると
//     ✕ Your sst.config.ts has top level imports - this is not allowed.
//   で**落ちる**。自前のモジュールは `run()` の中で `await import(...)` する必要がある。
//
// 🔴 **この制約は型検査では捕まらない。** `npm run check:sst`（tsc）にとって
//    トップレベル import はまったく正常なコードなので **exit 0 で通る**。
//    実際に Pour Over 12 でこれを踏み、`check:sst` も `tsc --noEmit` も `eslint` も
//    緑のまま **CI の `SST Deploy` だけが赤くなった**（教訓35）。
//
// 🔑 だから CI の lint ジョブ（＝ PR で走る）に入れてある。`SST Deploy` は
//    **main への push でしか走らない**ので、それだけに頼るとマージ後にしか分からない。
//    ＝ 検査は「壊れたことが分かる場所」ではなく「壊す前に止まる場所」に置く。

import { readFile } from 'node:fs/promises'

const FILE = 'sst.config.ts'

const source = await readFile(FILE, 'utf8')

// トップレベル import は列0から始まる。行頭が `//` のコメントや、`run()` の中の
// インデントされた `const ... = await import(...)` は対象外になる。
const offenders = source
  .split('\n')
  .map((line, i) => ({ line, lineNo: i + 1 }))
  .filter(({ line }) => /^import[\s{*'"]/.test(line))

if (offenders.length > 0) {
  console.error(`✗ ${FILE} にトップレベル import があります。`)
  console.error('  SST は設定の読み込み時に次のエラーで落ちます:')
  console.error(
    '    Your sst.config.ts has top level imports - this is not allowed.',
  )
  console.error('')
  for (const { line, lineNo } of offenders) {
    console.error(`  ${FILE}:${lineNo}: ${line}`)
  }
  console.error('')
  console.error('  → `run()` の中で動的 import にしてください:')
  console.error("       const mod = await import('./src/lib/foo')")
  process.exit(1)
}

console.log(`✓ ${FILE} にトップレベル import は無い`)
