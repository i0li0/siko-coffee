import { sendEmail } from './email'
import { createVerificationToken, deleteTokensForEmail } from './verification-token'

const BASE_URL = process.env.NEXTAUTH_URL || 'https://www.sikocoffee.com'

export async function sendVerificationEmail(email: string): Promise<boolean> {
  await deleteTokensForEmail(email)
  const token = await createVerificationToken(email)
  const url = `${BASE_URL}/api/auth/verify-email?token=${token}`

  return sendEmail({
    to: email,
    subject: 'メールアドレスの確認 — Sikō Coffee',
    text: `Sikō Coffee をご利用いただきありがとうございます。\n\n以下のリンクをクリックしてメールアドレスを確認してください（24時間有効）:\n${url}\n\nこのメールに心当たりがない場合は無視してください。`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
        <h1 style="font-size: 20px; font-weight: 300; letter-spacing: 0.14em; text-align: center; margin-bottom: 32px;">Sikō Coffee</h1>
        <p style="font-size: 14px; line-height: 1.8; color: #333;">ご登録ありがとうございます。</p>
        <p style="font-size: 14px; line-height: 1.8; color: #333;">以下のボタンをクリックしてメールアドレスを確認してください。</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${url}" style="display: inline-block; background: #c8a45a; color: #1a1a1a; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-size: 13px; letter-spacing: 0.08em;">メールアドレスを確認</a>
        </div>
        <p style="font-size: 12px; color: #999; text-align: center;">このリンクは24時間有効です。</p>
        <p style="font-size: 12px; color: #999; text-align: center;">心当たりがない場合は無視してください。</p>
      </div>
    `,
  })
}
