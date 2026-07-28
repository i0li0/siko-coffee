#!/usr/bin/env node
// OpenNext ビルド（= sst deploy）に使うツールチェーンを検証する。
//
// なぜ必要か: image-optimization Lambda に同梱される sharp は、`@img/sharp-<os>-<cpu>`
// が `libc: glibc` を宣言しているため **npm 11 以降でないと選択できない**。
// npm 10 は `--libc` を解釈せず、黙って `@img/sharp-wasm32` にフォールバックする。
// そして OpenNext の installDependencies は npm install の失敗をログに出すだけで
// ビルドを止めないため、**壊れたままデプロイが成功する**。
// 症状は「next/image が最適化されず原本をそのまま返す」（w=256 で 4KB→222KB＝約53倍）で、
// Next.js 側が変換の例外を握りつぶすため CloudWatch にも何も残らない。
// 一度この罠を踏んで #96 で修正した。再発の条件（npm を戻す・別マシンでビルドする）は
// 簡単に揃うので、デプロイの手前で機械的に止める。
//
// 実行: node scripts/check-build-toolchain.mjs  （npm run sst:deploy から呼ばれる）
// ※ CI（`next build` のみ）はこの制約を受けないため、意図的に CI からは呼ばない。

import { execFileSync } from 'node:child_process'

const MIN_NPM_MAJOR = 11

function fail(lines) {
  console.error('✗ ビルドツールチェーンの前提を満たしていません:\n')
  for (const l of lines) console.error(`  ${l}`)
  process.exit(1)
}

let npmVersion
try {
  npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim()
} catch (err) {
  fail([`npm を実行できませんでした: ${err.message}`])
}

const major = Number(npmVersion.split('.')[0])
if (!Number.isInteger(major)) {
  fail([`npm のバージョンを解釈できませんでした: "${npmVersion}"`])
}

if (major < MIN_NPM_MAJOR) {
  fail([
    `npm ${npmVersion} が使われています。OpenNext のビルドには npm ${MIN_NPM_MAJOR} 以降が必要です。`,
    '',
    'npm 10 以下でビルドすると sharp が wasm32 にフォールバックし、',
    'next/image が無言で最適化されなくなります（デプロイ自体は成功してしまいます）。',
    '',
    '  npm install -g npm@11',
    '',
    '詳細は open-next.config.ts の imageOptimization.install のコメントを参照。',
  ])
}

console.log(`✓ npm ${npmVersion}（>= ${MIN_NPM_MAJOR} 必須）`)
