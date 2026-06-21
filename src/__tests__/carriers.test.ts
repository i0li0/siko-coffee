import { describe, it, expect } from 'vitest'
import { getCarrier, buildTrackingUrl, carrierLabel, CARRIERS } from '@/lib/carriers'

describe('getCarrier', () => {
  it('有効な ID で Carrier を返す', () => {
    expect(getCarrier('yamato')?.label).toBe('ヤマト運輸')
    expect(getCarrier('sagawa')?.label).toBe('佐川急便')
  })

  it('無効な ID は undefined', () => {
    expect(getCarrier('unknown')).toBeUndefined()
    expect(getCarrier(null)).toBeUndefined()
    expect(getCarrier(undefined)).toBeUndefined()
  })
})

describe('buildTrackingUrl', () => {
  it('ヤマトの追跡 URL を生成', () => {
    const url = buildTrackingUrl('yamato', '1234')
    expect(url).toContain('kuronekoyamato')
    expect(url).toContain('1234')
  })

  it('日本郵便の追跡 URL を生成', () => {
    const url = buildTrackingUrl('japanpost', '5678')
    expect(url).toContain('japanpost.jp')
    expect(url).toContain('5678')
  })

  it('追跡番号を URL エンコードする', () => {
    const url = buildTrackingUrl('yamato', 'a&b=c')
    expect(url).toContain('a%26b%3Dc')
  })

  it('不明な業者は undefined', () => {
    expect(buildTrackingUrl('unknown', '1234')).toBeUndefined()
  })
})

describe('carrierLabel', () => {
  it('有効な ID でラベルを返す', () => {
    expect(carrierLabel('yamato')).toBe('ヤマト運輸')
  })

  it('不明な ID はそのまま返す', () => {
    expect(carrierLabel('other')).toBe('other')
  })

  it('null/undefined は空文字', () => {
    expect(carrierLabel(null)).toBe('')
    expect(carrierLabel(undefined)).toBe('')
  })
})

describe('CARRIERS', () => {
  it('全業者が trackingUrl 関数を持つ', () => {
    for (const c of CARRIERS) {
      expect(typeof c.trackingUrl).toBe('function')
      expect(typeof c.trackingUrl('test')).toBe('string')
    }
  })
})
