const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

export async function notifySlack(text: string): Promise<void> {
  if (!SLACK_WEBHOOK_URL) return
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch {
    // Slack 通知失敗はユーザー操作をブロックしない
  }
}
