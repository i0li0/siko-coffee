import { describe, it, expect } from 'vitest'
import {
  formatItemLine,
  orderConfirmation,
  shippedNotice,
  deliveredNotice,
  ownerNewOrder,
} from '@/lib/emailTemplates'
import type { MailItem, OrderMailContext } from '@/lib/emailTemplates'

const sampleItem: MailItem = {
  name: 'テストブレンド',
  ratios: [50, 50],
  grind: '中挽き',
  grams: 200,
  custom: true,
}

const sampleCtx: OrderMailContext = {
  orderId: 'abcdef1234567890',
  customerName: '田中太郎',
  items: [sampleItem],
  subtotal: 1000,
  shipping: 500,
  total: 1500,
  addressText: '東京都渋谷区1-1',
  orderUrl: 'https://www.sikocoffee.com/shop/order/abc',
}

describe('formatItemLine', () => {
  it('ブレンド商品のフォーマット', () => {
    const line = formatItemLine({ name: 'A', ratios: [], grind: '粗挽き', grams: 100 }, 0)
    expect(line).toContain('1.')
    expect(line).toContain('A')
    expect(line).toContain('粗挽き')
    expect(line).toContain('100g')
  })

  it('デフォルト値（grind=豆のまま, grams=200）', () => {
    const line = formatItemLine({ name: 'B', ratios: [] }, 0)
    expect(line).toContain('豆のまま')
    expect(line).toContain('200g')
  })

  it('シングルオリジンのタグ', () => {
    const line = formatItemLine({ name: 'C', ratios: [], single: true }, 0)
    expect(line).toContain('シングルオリジン')
  })

  it('カスタムブレンドのタグ', () => {
    const line = formatItemLine({ name: 'D', ratios: [], custom: true }, 0)
    expect(line).toContain('オリジナルブレンド')
  })
})

describe('orderConfirmation', () => {
  it('件名に注文番号（先頭8文字大文字）を含む', () => {
    const { subject } = orderConfirmation(sampleCtx)
    expect(subject).toContain('ABCDEF12')
  })

  it('テキスト本文に顧客名・金額・住所を含む', () => {
    const { text } = orderConfirmation(sampleCtx)
    expect(text).toContain('田中太郎')
    expect(text).toContain('¥1,500')
    expect(text).toContain('東京都渋谷区')
  })

  it('HTML に注文確認 URL を含む', () => {
    const { html } = orderConfirmation(sampleCtx)
    expect(html).toContain('ご注文状況を確認する')
    expect(html).toContain(sampleCtx.orderUrl)
  })

  it('顧客名なしの場合「お客様」', () => {
    const { text } = orderConfirmation({ ...sampleCtx, customerName: null })
    expect(text).toContain('お客様')
  })

  it('送料無料時「無料」表記', () => {
    const { text } = orderConfirmation({ ...sampleCtx, shipping: 0 })
    expect(text).toContain('送料: 無料')
  })
})

describe('shippedNotice', () => {
  it('件名に注文番号を含む', () => {
    const { subject } = shippedNotice({
      orderId: 'abcdef1234567890',
      carrierLabel: 'ヤマト運輸',
      trackingNumber: '1234',
    })
    expect(subject).toContain('ABCDEF12')
    expect(subject).toContain('発送')
  })

  it('テキストに追跡情報を含む', () => {
    const { text } = shippedNotice({
      orderId: 'x',
      carrierLabel: 'ヤマト運輸',
      trackingNumber: '9999',
      trackingUrl: 'https://example.com/track',
    })
    expect(text).toContain('ヤマト運輸')
    expect(text).toContain('9999')
    expect(text).toContain('https://example.com/track')
  })
})

describe('deliveredNotice', () => {
  it('配達完了の件名と本文', () => {
    const { subject, text } = deliveredNotice({
      orderId: 'abcdef1234567890',
      customerName: '鈴木',
    })
    expect(subject).toContain('お届け')
    expect(text).toContain('鈴木')
  })
})

describe('ownerNewOrder', () => {
  it('店主宛メールに金額と顧客情報を含む', () => {
    const { subject, text } = ownerNewOrder({
      orderId: 'ord_123',
      stripeSessionId: 'cs_test_xxx',
      customerName: '山田',
      customerEmail: 'yamada@example.com',
      items: [sampleItem],
      total: 2000,
      addressText: '大阪市',
      createdAt: new Date('2026-06-20T10:00:00Z'),
    })
    expect(subject).toContain('新しいご注文')
    expect(text).toContain('¥2,000')
    expect(text).toContain('山田')
    expect(text).toContain('yamada@example.com')
    expect(text).toContain('大阪市')
  })
})
