import { sendEmail } from './email'
import { createResetToken, deleteResetTokensForEmail } from './reset-token'

const BASE_URL = process.env.NEXTAUTH_URL || 'https://www.sikocoffee.com'

export async function sendPasswordResetEmail(email: string): Promise<boolean> {
  await deleteResetTokensForEmail(email)
  const token = await createResetToken(email)
  const url = `${BASE_URL}/reset-password?token=${token}`

  return sendEmail({
    to: email,
    subject: 'パスワードの再設定 — Sikō Coffee',
    text: `パスワード再設定のリクエストを受け付けました。\n\n以下のリンクから新しいパスワードを設定してください（1時間有効）:\n${url}\n\nこのリクエストに心当たりがない場合は、このメールを無視してください。パスワードは変更されません。`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
        <h1 style="font-size: 20px; font-weight: 300; letter-spacing: 0.14em; text-align: center; margin-bottom: 32px;">Sikō Coffee</h1>
        <p style="font-size: 14px; line-height: 1.8; color: #333;">パスワード再設定のリクエストを受け付けました。</p>
        <p style="font-size: 14px; line-height: 1.8; color: #333;">以下のボタンから新しいパスワードを設定してください。</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${url}" style="display: inline-block; background: #c8a45a; color: #1a1a1a; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-size: 13px; letter-spacing: 0.08em;">パスワードを再設定</a>
        </div>
        <p style="font-size: 12px; color: #999; text-align: center;">このリンクは1時間有効です。</p>
        <p style="font-size: 12px; color: #999; text-align: center;">心当たりがない場合は無視してください。パスワードは変更されません。</p>
      </div>
    `,
  })
}
