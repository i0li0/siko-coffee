// 顧客向け・店主向けメールの文面。テキスト本文と簡易HTMLを返す。
// トーンは静かで丁寧。ブランド名は「Sikō Coffee」。

export interface MailItem {
  name: string
  ratios: number[]
  grind?: string
  grams?: number
  custom?: boolean
  single?: boolean
  publish?: boolean
}

export interface OrderMailContext {
  orderId: string
  customerName?: string | null
  items: MailItem[]
  subtotal?: number | null
  shipping?: number | null
  total?: number | null
  addressText?: string
  orderUrl?: string
}

const SITE_NAME = 'Sikō Coffee'

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

function yen(n: number | null | undefined): string {
  return `¥${(n ?? 0).toLocaleString()}`
}

export function formatItemLine(it: MailItem, i: number): string {
  const grams = it.grams ?? 200
  const grind = it.grind ?? '豆のまま'
  const tag = it.single ? 'シングルオリジン' : it.custom ? 'オリジナルブレンド' : 'ブレンド'
  return `  ${i + 1}. ${it.name}（${tag}・${grind}・${grams}g）`
}

function itemsText(items: MailItem[]): string {
  return items.map(formatItemLine).join('\n')
}

function itemsHtml(items: MailItem[]): string {
  return items
    .map((it) => {
      const grams = it.grams ?? 200
      const grind = it.grind ?? '豆のまま'
      const tag = it.single ? 'シングルオリジン' : it.custom ? 'オリジナルブレンド' : 'ブレンド'
      return `<li style="margin-bottom:6px">${it.name}<span style="color:#888"> — ${tag}・${grind}・${grams}g</span></li>`
    })
    .join('')
}

function wrapHtml(title: string, bodyHtml: string, orderUrl?: string): string {
  const cta = orderUrl
    ? `<p style="margin:28px 0"><a href="${orderUrl}" style="display:inline-block;padding:12px 22px;border:1px solid #888;color:#222;text-decoration:none;letter-spacing:.08em;font-size:13px">ご注文状況を確認する</a></p>`
    : ''
  return `<div style="font-family:-apple-system,'Helvetica Neue',sans-serif;max-width:520px;margin:0 auto;color:#222;line-height:1.9">
<h1 style="font-weight:400;letter-spacing:.08em;font-size:20px">${title}</h1>
${bodyHtml}
${cta}
<hr style="border:none;border-top:1px solid #eee;margin:28px 0"/>
<p style="font-size:12px;color:#999">${SITE_NAME}<br/><a href="https://www.sikocoffee.com" style="color:#999">www.sikocoffee.com</a></p>
</div>`
}

// ── 注文確認メール（顧客宛） ──
export function orderConfirmation(ctx: OrderMailContext) {
  const name = ctx.customerName ?? 'お客様'
  const subject = `[${SITE_NAME}] ご注文ありがとうございます（注文番号 ${shortId(ctx.orderId)}）`
  const text = [
    `${name} 様`,
    '',
    'このたびはご注文いただきありがとうございます。',
    '以下の内容で承りました。発送の準備が整い次第、改めてご連絡いたします。',
    '',
    `注文番号: ${shortId(ctx.orderId)}`,
    '',
    'ご注文内容:',
    itemsText(ctx.items),
    '',
    `小計: ${yen(ctx.subtotal)}`,
    `送料: ${ctx.shipping === 0 ? '無料' : yen(ctx.shipping)}`,
    `合計: ${yen(ctx.total)}`,
    '',
    ctx.addressText ? `お届け先: ${ctx.addressText}` : '',
    ctx.orderUrl ? `\nご注文状況の確認: ${ctx.orderUrl}` : '',
    '',
    `${SITE_NAME}`,
  ].filter((l) => l !== undefined).join('\n')

  const bodyHtml = `<p>${name} 様</p>
<p>このたびはご注文いただきありがとうございます。<br/>以下の内容で承りました。発送の準備が整い次第、改めてご連絡いたします。</p>
<p style="color:#888;font-size:13px">注文番号 ${shortId(ctx.orderId)}</p>
<ul style="padding-left:18px">${itemsHtml(ctx.items)}</ul>
<p style="font-size:14px">小計 ${yen(ctx.subtotal)}<br/>送料 ${ctx.shipping === 0 ? '無料' : yen(ctx.shipping)}<br/><strong>合計 ${yen(ctx.total)}</strong></p>
${ctx.addressText ? `<p style="font-size:13px;color:#888">お届け先: ${ctx.addressText}</p>` : ''}`

  return { subject, text, html: wrapHtml('ご注文ありがとうございます', bodyHtml, ctx.orderUrl) }
}

// ── 発送通知メール（顧客宛） ──
export function shippedNotice(ctx: {
  orderId: string
  customerName?: string | null
  carrierLabel: string
  trackingNumber: string
  trackingUrl?: string
  orderUrl?: string
}) {
  const name = ctx.customerName ?? 'お客様'
  const subject = `[${SITE_NAME}] 商品を発送しました（注文番号 ${shortId(ctx.orderId)}）`
  const text = [
    `${name} 様`,
    '',
    'ご注文の商品を発送いたしました。お届けまで今しばらくお待ちください。',
    '',
    `注文番号: ${shortId(ctx.orderId)}`,
    `配送業者: ${ctx.carrierLabel}`,
    `追跡番号: ${ctx.trackingNumber}`,
    ctx.trackingUrl ? `追跡URL: ${ctx.trackingUrl}` : '',
    ctx.orderUrl ? `\nご注文状況の確認: ${ctx.orderUrl}` : '',
    '',
    `${SITE_NAME}`,
  ].filter((l) => l !== undefined).join('\n')

  const bodyHtml = `<p>${name} 様</p>
<p>ご注文の商品を発送いたしました。お届けまで今しばらくお待ちください。</p>
<p style="color:#888;font-size:13px">注文番号 ${shortId(ctx.orderId)}</p>
<p style="font-size:14px">配送業者 ${ctx.carrierLabel}<br/>追跡番号 ${ctx.trackingNumber}</p>
${ctx.trackingUrl ? `<p><a href="${ctx.trackingUrl}" style="color:#222">荷物を追跡する</a></p>` : ''}`

  return { subject, text, html: wrapHtml('商品を発送しました', bodyHtml, ctx.orderUrl) }
}

// ── 配達完了メール（顧客宛） ──
export function deliveredNotice(ctx: {
  orderId: string
  customerName?: string | null
  orderUrl?: string
}) {
  const name = ctx.customerName ?? 'お客様'
  const subject = `[${SITE_NAME}] 商品をお届けしました（注文番号 ${shortId(ctx.orderId)}）`
  const text = [
    `${name} 様`,
    '',
    'ご注文の商品をお届けしました。お楽しみいただけましたら幸いです。',
    'またのご利用を、心よりお待ちしております。',
    '',
    `注文番号: ${shortId(ctx.orderId)}`,
    ctx.orderUrl ? `\nご注文内容の確認: ${ctx.orderUrl}` : '',
    '',
    `${SITE_NAME}`,
  ].filter((l) => l !== undefined).join('\n')

  const bodyHtml = `<p>${name} 様</p>
<p>ご注文の商品をお届けしました。お楽しみいただけましたら幸いです。<br/>またのご利用を、心よりお待ちしております。</p>
<p style="color:#888;font-size:13px">注文番号 ${shortId(ctx.orderId)}</p>`

  return { subject, text, html: wrapHtml('商品をお届けしました', bodyHtml, ctx.orderUrl) }
}

// ── 新規注文の通知メール（店主宛） ──
export function ownerNewOrder(ctx: {
  orderId: string
  stripeSessionId: string
  customerName?: string | null
  customerEmail?: string | null
  items: MailItem[]
  total?: number | null
  addressText?: string
  createdAt: Date
}) {
  const subject = '[Sikō Coffee] 新しいご注文が届きました'
  const text = [
    `金額: ${yen(ctx.total)}`,
    `お客様: ${ctx.customerName ?? '不明'} <${ctx.customerEmail ?? '不明'}>`,
    `配送先: ${ctx.addressText || '未入力'}`,
    '',
    ctx.items.length ? `注文内容:\n${itemsText(ctx.items)}` : '（内容取得不可）',
    '',
    `注文ID: ${ctx.orderId}`,
    `Stripe ID: ${ctx.stripeSessionId}`,
    `日時: ${ctx.createdAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`,
    '',
    'Stripe ダッシュボード: https://dashboard.stripe.com/payments',
  ].join('\n')
  return { subject, text }
}
