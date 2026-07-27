import { describe, it, expect } from 'vitest'
import nextConfig from '../../next.config'

// next.config.ts のホスト正規化リダイレクトが、Next.js(Vercel) と OpenNext(AWS) の
// **両方の意味論**で正しく動くことを固定する回帰テスト。
//
// 背景（OpenNext issue #1202・open）:
//   Next.js  : new RegExp('^' + value + '$').test(host)  ＝ アンカーする
//   OpenNext : new RegExp(value).test(host)              ＝ アンカーしない
// アンカーの有無で、apex 正規化ルールが 'www.sikocoffee.com' にも部分一致し、
// **www が自分自身へ 308 を返し続けてサイト全体が停止する**（本番全停止レベル）。
// AWS 移行前に必ず塞ぐ必要があり、再混入も許さないためテストで縛る。

type HasItem = { type: string; key?: string; value?: string }
type Redirect = { source: string; has?: HasItem[]; destination: string; permanent?: boolean }

// Next.js 本体の評価（値を ^...$ で包む）
function matchesAsNextjs(value: string, host: string): boolean {
  return new RegExp(`^${value}$`).test(host)
}

// OpenNext の評価（包まない）
function matchesAsOpenNext(value: string, host: string): boolean {
  return new RegExp(value).test(host)
}

const CANONICAL_HOST = 'www.sikocoffee.com'

async function hostRedirects(): Promise<{ value: string; destination: string }[]> {
  const redirects = (await nextConfig.redirects?.()) as Redirect[] | undefined
  return (redirects ?? []).flatMap((r) =>
    (r.has ?? [])
      .filter((h) => h.type === 'host' && typeof h.value === 'string')
      .map((h) => ({ value: h.value as string, destination: r.destination })),
  )
}

describe('next.config のホスト正規化リダイレクト', () => {
  it('ホスト条件付きリダイレクトが定義されている', async () => {
    const rules = await hostRedirects()
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.map((r) => r.value)).toContain('^sikocoffee\\.com$')
  })

  it('🔴 どのルールも canonical ホストに一致しない（両エンジンの意味論で）', async () => {
    for (const { value } of await hostRedirects()) {
      // ここが false でないと、www へのリクエストが www へリダイレクトされ続ける
      expect(matchesAsNextjs(value, CANONICAL_HOST), `Next.js: ${value}`).toBe(false)
      expect(matchesAsOpenNext(value, CANONICAL_HOST), `OpenNext: ${value}`).toBe(false)
    }
  })

  it('apex は両エンジンで正しく www へ正規化される', async () => {
    const apex = (await hostRedirects()).find((r) => r.value.includes('sikocoffee'))
    expect(apex).toBeDefined()
    expect(matchesAsNextjs(apex!.value, 'sikocoffee.com')).toBe(true)
    expect(matchesAsOpenNext(apex!.value, 'sikocoffee.com')).toBe(true)
    expect(apex!.destination).toBe('https://www.sikocoffee.com/:path*')
  })

  it('デプロイ毎の一意 URL や無関係ホストを巻き込まない', async () => {
    const others = [
      'siko-coffee-10uvv0g90-i0li0s-projects.vercel.app', // preview の一意URL
      'sikocoffee.com.evil.example',                       // サフィックス偽装
      'notsikocoffee.com',                                 // プレフィックス偽装
      'localhost:3000',
    ]
    for (const { value } of await hostRedirects()) {
      for (const host of others) {
        expect(matchesAsNextjs(value, host), `Next.js: ${value} vs ${host}`).toBe(false)
        expect(matchesAsOpenNext(value, host), `OpenNext: ${value} vs ${host}`).toBe(false)
      }
    }
  })

  it('全ルールが明示的に ^...$ でアンカーされている（#1202 の回避策）', async () => {
    for (const { value } of await hostRedirects()) {
      expect(value.startsWith('^'), `${value} は ^ で始まること`).toBe(true)
      expect(value.endsWith('$'), `${value} は $ で終わること`).toBe(true)
      // ドットは任意1文字にならないようエスケープする
      expect(/(?<!\\)\./.test(value), `${value} の . はエスケープすること`).toBe(false)
    }
  })
})
