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
import { readFileSync } from 'node:fs'

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

// ── sharp のクロスビルド設定が自己整合しているか ───────────────────
// なぜ**ここ**（デプロイ前）で見るか: この不整合はこれまで `verify:image-optimizer`
// ＝ `sst deploy` の**後**でしか検出できなかった。つまり壊れた成果物が一度適用されてから
// 赤くなる。13（本番切替）ではそれは「本番に一度出てから気づく」を意味する。
// 成果物を見ないと分からないこともあるが、**設定の矛盾は静的に分かる**ので、
// 分かる分だけは適用前に止める。2026-08-01 に CI の初回デプロイで実際に踏んだ（教訓29）。
//
// 何を見るか: OpenNext は install オプションの `arch` を `--arch=` として渡すが、
// それは node-gyp 系のフラグで **optional 依存の絞り込みには効かない**。
// 実際に `@img/sharp-<os>-<cpu>` を決めるのは `additionalArgs` の **`--cpu`** で、
// 無ければ npm は**ビルドしたマシンの CPU** を使う（＝ビルド機によって結果が変わる）。
const configPath = new URL('../open-next.config.ts', import.meta.url)
let config
try {
  config = readFileSync(configPath, 'utf8')
} catch (err) {
  fail([`open-next.config.ts を読めませんでした: ${err.message}`])
}

// コメント行は `//` で始まるのでこのパターンには一致しない（本文の宣言だけを拾う）。
const archMatch = config.match(/^\s*arch:\s*'([^']+)'/m)
const extraArgsMatch = config.match(/^\s*additionalArgs:\s*'([^']*)'/m)

if (!archMatch) {
  fail([
    'open-next.config.ts の imageOptimization.install に arch の宣言が見つかりません。',
    'この検査が設定の形を追えていない＝検査自体が形骸化しています。先にここを直してください。',
  ])
}

const arch = archMatch[1]
const cpuFlag = extraArgsMatch?.[1].match(/--cpu=(\S+)/)?.[1]

if (cpuFlag !== arch) {
  fail([
    `sharp のクロスビルド設定が矛盾しています（arch: '${arch}' / --cpu: ${cpuFlag ?? 'なし'}）。`,
    '',
    'OpenNext は arch を `--arch=` として渡しますが、これは optional 依存の',
    '絞り込みには効きません。実際に CPU を決めるのは `--cpu` です。',
    '無いとビルドしたマシンの CPU が黙って使われ、arm64 の Lambda に x64 の',
    'sharp が入って next/image が原本をそのまま返します（デプロイは成功します）。',
    '',
    "  install: { arch: 'arm64', additionalArgs: '--cpu=arm64', ... }",
    '',
    'open-next.config.ts の imageOptimization.install のコメントと教訓29 を参照。',
  ])
}

console.log(`✓ sharp のクロスビルド設定は自己整合（arch: ${arch} / --cpu=${cpuFlag}）`)
