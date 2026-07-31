#!/usr/bin/env node
// OpenNext がビルドした image-optimization Lambda に **Linux arm64 用の sharp**
// が入っているかを検証する。
//
// なぜ必要か: この失敗は**どこにも痕跡が残らない**。
//   1. OpenNext の installDependencies は npm install が失敗してもログを出すだけで
//      ビルドを止めない（logger.error → 続行）。
//   2. sharp が別プラットフォーム向け（macOS バイナリ / wasm32 フォールバック）でも
//      デプロイは成功する。
//   3. Next.js の imageOptimizer() は変換時の例外を握りつぶして原本をそのまま返す
//      （image-optimizer.js の「If we fail to optimize, fallback to the original image」）。
//      ログも出ないため CloudWatch にも何も残らない。
//   結果、next/image が「200 を返すのに一切最適化されていない」状態で本番に出る
//      （実測で原本の約53倍の転送量）。だからビルド成果物を機械的に検査する。
//
// 実行: npm run verify:image-optimizer   （`sst deploy` の直後に実行する）
// 前提: npm 11 以降。npm 10 は `--libc` を解釈できず @img/sharp-wasm32 に落ちる。

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fnDir = join(root, '.open-next', 'image-optimization-function')
const nodeModules = join(fnDir, 'node_modules')

// Lambda のアーキテクチャ。SST が作る関数に合わせる（sst.config.ts を変えたらここも変える）。
const EXPECTED = '@img/sharp-linux-arm64'

function fail(msg, hint) {
  console.error(`✗ ${msg}`)
  if (hint) console.error(`  → ${hint}`)
  process.exit(1)
}

if (!existsSync(fnDir)) {
  fail(
    `${fnDir} がありません（image-optimization Lambda が未ビルド）`,
    'まず `npx sst deploy --stage <stage>` か `npx @opennextjs/aws build` を実行してください。',
  )
}

// npm のバージョンは失敗の主因なので、診断に添えられるよう先に読む。
let npmVersion = 'unknown'
try {
  const { execFileSync } = await import('node:child_process')
  npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim()
} catch {
  /* 取得できなくても検査自体は続行する */
}
const npmMajor = Number.parseInt(npmVersion, 10)

const imgDir = join(nodeModules, '@img')
const installed = existsSync(imgDir) ? readdirSync(imgDir) : []

// ① 期待するネイティブパッケージがあるか
if (!existsSync(join(nodeModules, EXPECTED))) {
  // 「別 CPU のものが入っている」のか「そもそも解決に失敗した」のかで原因が違うので、
  // 実際に入っているものを見て診断を出し分ける。前者を後者の文言で案内すると
  // os/arch/libc を見に行かせることになり、**それらは合っているので迷子になる**（2026-08-01）。
  const wrongCpu = installed.find((n) => /^sharp-linux-(?!arm64)/.test(n))
  const npmHint =
    Number.isInteger(npmMajor) && npmMajor < 11
      ? `npm が ${npmVersion} です。**npm 11 以降が必須**（10 系は --libc を解釈せず wasm32 に落ちる）。\`npm i -g npm@11\` の後に再ビルドしてください。`
      : wrongCpu
        ? `別 CPU 向けの ${wrongCpu} が入っています＝**ビルドしたマシンの CPU が漏れています**。
    OpenNext の install オプションの \`arch\` は \`--arch=\`（node-gyp 系）として渡され、
    optional 依存の絞り込みには効きません。効くのは \`--cpu\` です。
    open-next.config.ts の imageOptimization.install に
    \`additionalArgs: '--cpu=arm64'\` があるか確認してください。`
        : `open-next.config.ts の imageOptimization.install（os/arch/libc）と sst.config.ts の Lambda アーキテクチャが一致しているか確認してください。`
  fail(
    `${EXPECTED} が image-optimization Lambda にありません（@img 配下: ${installed.join(', ') || 'なし'}）`,
    npmHint,
  )
}

// ② 誤ったプラットフォームのものが混ざっていないか。
//    wasm32 は「動くが極端に遅い」ため 200 が返り、テストでは気づけない。
if (installed.includes('sharp-wasm32')) {
  fail(
    '@img/sharp-wasm32 が同梱されています（ネイティブ解決に失敗したときのフォールバック）',
    'ネイティブ版と併存していると意図せず wasm 側が使われることがあります。npm 11 以降でクリーンに再ビルドしてください。',
  )
}

// ③ 0.32 系の名残（prebuild-install 方式）が無いか。ここに macOS バイナリが入るのが元の不具合。
const legacyBuildDir = join(nodeModules, 'sharp', 'build', 'Release')
if (existsSync(legacyBuildDir)) {
  const stray = readdirSync(legacyBuildDir).filter((f) => !f.includes('linux'))
  if (stray.length > 0) {
    fail(
      `sharp/build/Release に Linux 以外のバイナリがあります: ${stray.join(', ')}`,
      'sharp 0.32 系が入っています。open-next.config.ts の imageOptimization.install が効いているか確認してください。',
    )
  }
}

let sharpVersion = 'unknown'
try {
  sharpVersion = JSON.parse(
    readFileSync(join(nodeModules, 'sharp', 'package.json'), 'utf8'),
  ).version
} catch {
  /* バージョンが読めなくても致命ではない */
}

console.log(
  `✓ image-optimization Lambda の sharp は Linux arm64 ネイティブです（sharp ${sharpVersion} / ${installed.join(', ')} / npm ${npmVersion}）`,
)
