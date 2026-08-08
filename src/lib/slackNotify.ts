import * as Sentry from '@sentry/nextjs'

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

/**
 * Slack への到達を待つ上限。Slack の webhook は通常 100〜300ms で返る。
 *
 * 🔴 **上限が要るのは `await` するから。** 呼び出し側は必ず `await` する（下記）ので、
 * Slack が応答しないとユーザーのリクエストがそのまま待たされる。
 * Lambda の timeout（30秒）に達すると**ユーザー操作そのものが失敗する**＝
 * 通知の失敗が本体の失敗に化ける。ここで切って「通知だけ失敗」に留める。
 */
const TIMEOUT_MS = 3000

/**
 * Slack へ通知する。**ユーザー操作はブロックしない**（失敗しても投げない）。
 *
 * 🔴🔴 **呼び出し側は必ず `await` すること。**
 * かつて `void notifySlack(...)` や裸の `notifySlack(...)` で呼ばれていた箇所があったが、
 * **AWS Lambda ではハンドラが返ると実行環境がフリーズする**ため、
 * 未完了の fetch は**そこで止まり、次の呼び出しが来るまで再開しない**
 * （＝通知が遅延する。次が来なければ失われる）。
 * 2026-08-08 に本番で送ったテスト通知が**数分遅れて届いた**ことで実際に観測された。
 * 📌 Vercel（fluid compute）では顕在化しなかった＝ **AWS 移行で生まれたリスク**。
 *
 * 🔑 **`after()` を使わない理由**: ① この関数はルート以外（`lib/etaDelay.ts`）からも
 * 呼ばれ、リクエスト文脈の外だと `after()` は使えない ② production の Function URL は
 * **`InvokeMode: BUFFERED`**（実測）＝応答はハンドラ完了時に返るので、
 * **`after()` にしても `await` と遅延は変わらない**。
 * ＝ 今の構成では `await` のほうが単純で、どこから呼んでも壊れない。
 *
 * ⚠️ **この関数は決して throw しない。** だから `await` しても呼び出し側の処理は壊れない。
 * 待つのは「Slack に届いたか」であって「成功したか」ではない。
 *
 * 🔴🔴 **かつてここは失敗を完全に握り潰していた。**
 *   1. `if (!SLACK_WEBHOOK_URL) return`  … 未設定を黙って許す
 *   2. `catch {}`                         … ネットワークエラーを黙殺
 *   3. **`r.ok` を見ていない**            … いちばん危ない
 *
 * 🔑 **3 が効く場面**: webhook を**再発行した直後**。値が間違っていると Slack は
 * **403/404 を返す**が、`fetch` は HTTP エラーでは reject しないので
 * **`catch` にすら入らず、成功したのと区別が付かない**。
 * 2026-08-08 に C-4 のローテーションで `SLACK_WEBHOOK_URL` を再発行したとき、
 * **「新しい値が正しいかを知る手段が無い」**ことが判明してこの形にした。
 *
 * ＝ `feedback-error-visibility` の3点（**通知先は console と Sentry の2系統** /
 * **握り潰す catch は想定内の失敗を名指しで許す** / **fetch は `r.ok` 必須**）をすべて満たす。
 *
 * ⚠️ **未設定（1）は「想定内の失敗」として黙って許す**のが正しい。
 * dev や Vercel では意図的に空で、ここで鳴らすと**本当に見たい失敗が埋もれる**
 * （`SLACK_WEBHOOK_URL` は `OPTIONAL_SECRET_NAMES` ではなく既定値 `''` の任意シークレット）。
 * 名指しで許しているので、2 と 3 は黙らない。
 */
export async function notifySlack(text: string): Promise<void> {
  // 想定内の失敗＝未設定。名指しで許す（dev / Vercel では空が正常）。
  if (!SLACK_WEBHOOK_URL) return

  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      // 応答しない Slack でユーザーのリクエストを道連れにしない（上の TIMEOUT_MS 参照）。
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    // 🔴 ここが本体。HTTP エラーは fetch を reject しないので明示的に見る。
    if (!res.ok) {
      // Slack のエラーは本文が短い文字列（`invalid_token` など）。
      // 🔴 本文に webhook URL は含まれないが、**URL 自体は秘密なのでログに出さない**。
      const body = await res.text().catch(() => '(本文を読めませんでした)')
      const err = new Error(
        `Slack への通知が失敗しました: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`,
      )
      console.error('[slack]', err.message)
      Sentry.captureException(err, {
        tags: { lib: 'slackNotify', status: String(res.status) },
      })
    }
  } catch (err) {
    // ネットワーク到達不能など。ユーザー操作はブロックしないが、黙らせない。
    console.error('[slack] 通知の送信に失敗しました', err)
    Sentry.captureException(err, { tags: { lib: 'slackNotify' } })
  }
}
