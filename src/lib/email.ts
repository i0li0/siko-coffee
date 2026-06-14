import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import * as Sentry from '@sentry/nextjs'

// メール送信の共通ヘルパー。SES（ap-northeast-1）をラップする。
// 送信元は MAIL_FROM（例: "Sikō Coffee <noreply@sikocoffee.com>"）。
// 本番送信にはドメイン検証(DKIM)＋SES Sandbox 解除が前提。

const REGION = 'ap-northeast-1'

// 店主（運営）への通知先。
export const OWNER_EMAIL = 'siko.is.coffee@gmail.com'

let _ses: SESClient | undefined
function getSes(): SESClient {
  if (!_ses) _ses = new SESClient({ region: REGION })
  return _ses
}

function getFrom(): string {
  return process.env.MAIL_FROM || OWNER_EMAIL
}

export interface SendEmailParams {
  to: string | string[]
  subject: string
  text: string
  html?: string
  replyTo?: string
}

// メールを送信する。失敗しても例外を投げず false を返す（呼び出し側のフローを止めない）。
export async function sendEmail({ to, subject, text, html, replyTo }: SendEmailParams): Promise<boolean> {
  const toAddresses = Array.isArray(to) ? to : [to]
  if (toAddresses.length === 0 || toAddresses.some((a) => !a)) return false

  try {
    await getSes().send(new SendEmailCommand({
      Source: getFrom(),
      Destination: { ToAddresses: toAddresses },
      ReplyToAddresses: replyTo ? [replyTo] : undefined,
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: text, Charset: 'UTF-8' },
          ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {}),
        },
      },
    }))
    return true
  } catch (err) {
    Sentry.captureException(err, { tags: { lib: 'email', subject } })
    return false
  }
}
