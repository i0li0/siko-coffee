// Pour Over 12: apex（sikocoffee.com）→ www の 308 と HSTS を CloudFront Function で出す。
//
// **なぜ `sst.config.ts` に直接書かないのか。**
// ① `sst.config.ts` は `tsconfig.json` の exclude に入っており **CI で型検査されない唯一のファイル**。
// ② このコードは **dev では一度も実行されない**（`domain` は production だけに付くので、
//    `sikocoffee.com` という Host が dev の CloudFront に来ることがない）。
//    ＝ 5・6・9 でやったような「dev に当てて実測する」検証が**原理的にできない**。
// → そこで**生成される関数本体を単体テストで実際に評価する**（`src/__tests__/apexRedirect.test.ts`）。
//    「型が通った」は「動く」の証明ではない（教訓27）ので、負の対照込みで振る舞いを固定する。
//
// ⚠️ **出力先は CloudFront Functions のランタイム**であって Node ではない。
//   - `atob` / `Buffer` / `crypto` / `URL` は**無い**。
//   - 文法は ES5.1 相当＋一部 ES6。ここでは `var` と `for-in` だけで書く。
//   - **テンプレートリテラル（`${...}`）を出力に含めないこと。** SST はこの文字列を
//     `interpolate` のテンプレートリテラルへ埋め込むため、先に展開されて壊れる（既存の 9 と同じ制約）。
// ⚠️ 変数名に `siko` 接頭辞を付けるのは、SST 自身が注入するコード（`routeSite` など）と
//   **同じ関数スコープに同居する**ため。

/** 配信ホスト。308 の飛び先。 */
export const SITE_HOST = 'www.sikocoffee.com'

/** 正規化元。ここへ来たリクエストだけを 308 で飛ばす。 */
export const APEX_HOST = 'sikocoffee.com'

/**
 * `next.config.ts` の `securityHeaders` と**同じ値**。
 * 🔴 リダイレクト応答にも完全な HSTS を乗せるのが現行設計の要件で、
 * これが `domain.redirects`（SST の `HttpsRedirect`）を使えない理由そのもの。
 * あちらは S3 website リダイレクト＋CloudFront で、Response Headers Policy が付かない。
 */
export const HSTS_VALUE = 'max-age=63072000; includeSubDomains; preload'

export interface ApexRedirectOptions {
  apexHost?: string
  siteHost?: string
  hstsValue?: string
}

/**
 * `edge.viewerRequest.injection` に渡す CloudFront Function のコード片を組み立てる。
 *
 * 挿入位置は SST の request 関数の**先頭**（`ssr-site.ts` の `createRequestFunction` は
 * userInjection → CloudFront URL ブロック → ルーティング本体 の順）。
 * ここで応答を返せば KVS 参照もオリジンへの転送も 5 の Lambda@Edge も一切走らない。
 *
 * 📌 **生成された 308 は CloudFront にキャッシュされない**（viewer-request 関数が
 * 生成した応答はキャッシュ対象外）。毎リクエスト関数が走るが、CFF はリクエスト課金のみで
 * 実測 103K req/月では誤差（9 で $0.01/月を実測済み）。
 */
export function buildApexRedirectInjection(
  options: ApexRedirectOptions = {},
): string {
  const apexHost = options.apexHost ?? APEX_HOST
  const siteHost = options.siteHost ?? SITE_HOST
  const hstsValue = options.hstsValue ?? HSTS_VALUE

  return [
    // Host が無い経路（Function URL 直叩きなど）で落ちないよう存在確認から入る。
    // 5 で直叩きは 403 になっているが、ここが例外を投げると 500 になるので防御する。
    'var sikoHost = event.request.headers.host && event.request.headers.host.value;',
    // 大文字小文字は正規化する。Host ヘッダの大小は等価（RFC 3986 §3.2.2）。
    'if (sikoHost && sikoHost.toLowerCase() === ' +
      JSON.stringify(apexHost) +
      ') {',
    // クエリ文字列は object でしか渡ってこないので組み立て直す。
    // 形は AWS 公式の正規化サンプルと同じ（multiValue があればそちらが正）。
    '  var sikoQs = [];',
    '  for (var sikoKey in event.request.querystring) {',
    '    var sikoParam = event.request.querystring[sikoKey];',
    '    if (sikoParam.multiValue) {',
    '      for (var sikoI = 0; sikoI < sikoParam.multiValue.length; sikoI++) {',
    "        sikoQs.push(sikoKey + '=' + sikoParam.multiValue[sikoI].value);",
    '      }',
    '    } else {',
    "      sikoQs.push(sikoKey + '=' + sikoParam.value);",
    '    }',
    '  }',
    '  return {',
    // 🔴 308 であって 301 ではない。301/302 はメソッドを GET に変えてよいことになっており、
    //    apex 宛の POST が黙って GET になる。`next.config.ts` も permanent: true ＝ 308。
    '    statusCode: 308,',
    "    statusDescription: 'Permanent Redirect',",
    '    headers: {',
    '      location: { value: ' +
      JSON.stringify('https://' + siteHost) +
      " + event.request.uri + (sikoQs.length ? '?' + sikoQs.join('&') : '') },",
    "      'strict-transport-security': { value: " +
      JSON.stringify(hstsValue) +
      ' },',
    '    },',
    '  };',
    '}',
  ].join('\n')
}
