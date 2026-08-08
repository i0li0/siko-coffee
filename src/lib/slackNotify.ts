import * as Sentry from '@sentry/nextjs'

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

/**
 * Slack へ通知する。**ユーザー操作はブロックしない**（失敗しても投げない）。
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
