import { describe, it, expect } from 'vitest'
import {
  buildApexRedirectInjection,
  APEX_HOST,
  SITE_HOST,
  HSTS_VALUE,
} from '@/lib/apexRedirect'

// Pour Over 12 の回帰テスト。
//
// 🔑 **このテストが「dev での実測」の代わり**である。`domain` は production にしか
// 付かないので、`sikocoffee.com` という Host が dev の CloudFront に届くことはない
// ＝ 5・6・9 でやった「dev に当てて curl で測る」が原理的にできない唯一のタスク。
// そこで **生成されるコードを実際に評価して**振る舞いを固定する。
// 「文字列に 308 が含まれること」を見るだけのテストにはしない（教訓27 と同型で、
// それは「書いた」の確認であって「動く」の確認ではない）。

interface CffQueryParam {
  value: string
  multiValue?: { value: string }[]
}

interface CffResponse {
  statusCode: number
  statusDescription: string
  headers: Record<string, { value: string }>
}

/** SST が組み立てる `function handler(event) { <injection> ... }` を再現する。 */
function runInjection(
  injection: string,
  event: unknown,
): CffResponse | null {
  // 注入コードは handler の**先頭**に置かれる。応答を返さなければ後続（SST 本体）へ落ちる。
  const handler = new Function('event', injection + '\nreturn null;') as (
    e: unknown,
  ) => CffResponse | null
  return handler(event)
}

function makeEvent(
  host: string | null,
  uri: string,
  querystring: Record<string, CffQueryParam> = {},
) {
  return {
    request: {
      headers: host === null ? {} : { host: { value: host } },
      uri,
      querystring,
    },
  }
}

describe('buildApexRedirectInjection', () => {
  const injection = buildApexRedirectInjection()

  it('apex 宛は 308 で www へ飛ばす', () => {
    const res = runInjection(injection, makeEvent(APEX_HOST, '/shop'))

    expect(res).not.toBeNull()
    // 🔴 301/302 はメソッドを GET に変えてよい＝ apex 宛の POST が黙って GET になる。
    expect(res!.statusCode).toBe(308)
    expect(res!.headers.location.value).toBe(`https://${SITE_HOST}/shop`)
  })

  it('リダイレクト応答にも HSTS を乗せる（domain.redirects を使えない理由）', () => {
    const res = runInjection(injection, makeEvent(APEX_HOST, '/'))

    expect(res!.headers['strict-transport-security'].value).toBe(HSTS_VALUE)
    // next.config.ts の securityHeaders と同じ値であること（片方だけ直る事故を防ぐ）。
    expect(HSTS_VALUE).toBe('max-age=63072000; includeSubDomains; preload')
  })

  // ── 負の対照 ──────────────────────────────────────────────
  it('www 宛は素通りさせる（ここで返すと無限ループになる）', () => {
    expect(runInjection(injection, makeEvent(SITE_HOST, '/shop'))).toBeNull()
  })

  it('無関係なホスト（CloudFront ドメイン）は素通りさせる', () => {
    expect(
      runInjection(injection, makeEvent('d3ejmruzea0u7a.cloudfront.net', '/')),
    ).toBeNull()
  })

  it('Host ヘッダが無くても例外を投げない（投げると 500 になる）', () => {
    expect(() => runInjection(injection, makeEvent(null, '/'))).not.toThrow()
    expect(runInjection(injection, makeEvent(null, '/'))).toBeNull()
  })

  it('Host の大文字小文字は等価に扱う', () => {
    const res = runInjection(injection, makeEvent('SikoCoffee.COM', '/account'))
    expect(res!.statusCode).toBe(308)
    expect(res!.headers.location.value).toBe(`https://${SITE_HOST}/account`)
  })

  // ── パスとクエリの保存 ────────────────────────────────────
  it('パスをそのまま引き継ぐ（パーセントエンコードも壊さない）', () => {
    const res = runInjection(
      injection,
      makeEvent(APEX_HOST, '/shop/%E3%81%82%E3%81%84'),
    )
    expect(res!.headers.location.value).toBe(
      `https://${SITE_HOST}/shop/%E3%81%82%E3%81%84`,
    )
  })

  it('クエリ文字列を引き継ぐ', () => {
    const res = runInjection(
      injection,
      makeEvent(APEX_HOST, '/shop/catalog', {
        sort: { value: 'new' },
        page: { value: '2' },
      }),
    )
    expect(res!.headers.location.value).toBe(
      `https://${SITE_HOST}/shop/catalog?sort=new&page=2`,
    )
  })

  it('同名パラメータ（multiValue）を落とさない', () => {
    const res = runInjection(
      injection,
      makeEvent(APEX_HOST, '/shop', {
        tag: {
          value: 'light',
          multiValue: [{ value: 'light' }, { value: 'natural' }],
        },
      }),
    )
    // multiValue がある場合は value を無視して配列を展開する（AWS 公式の正規化例と同じ規則）。
    expect(res!.headers.location.value).toBe(
      `https://${SITE_HOST}/shop?tag=light&tag=natural`,
    )
  })

  it('クエリが無いときに ? を付けない', () => {
    const res = runInjection(injection, makeEvent(APEX_HOST, '/'))
    expect(res!.headers.location.value).toBe(`https://${SITE_HOST}/`)
  })

  // ── CloudFront Functions ランタイムの制約 ────────────────
  it('テンプレートリテラルを含まない（SST の interpolate に先に食われる）', () => {
    // 🔴 9 の PREVIEW_BASIC_AUTH で明文化した制約。injection は SST 側で
    //    テンプレートリテラルに埋め込まれるため、`${` があるとデプロイ時に展開されて壊れる。
    expect(injection).not.toContain('${')
    expect(injection).not.toContain('`')
  })

  it('ES5 の範囲で書かれている（CFF に let/const/アロー関数を前提にしない）', () => {
    expect(injection).not.toMatch(/=>/)
    expect(injection).not.toMatch(/\b(let|const)\s/)
  })

  // ── 生成器としての負の対照 ────────────────────────────────
  it('ホストは差し替え可能で、差し替えると既定のホストには反応しない', () => {
    const other = buildApexRedirectInjection({
      apexHost: 'example.test',
      siteHost: 'www.example.test',
    })
    expect(runInjection(other, makeEvent(APEX_HOST, '/'))).toBeNull()
    expect(
      runInjection(other, makeEvent('example.test', '/'))!.headers.location
        .value,
    ).toBe('https://www.example.test/')
  })
})
