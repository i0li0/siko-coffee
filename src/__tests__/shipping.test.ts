import { describe, it, expect } from 'vitest'
import { calcShipping, buildShippingOptions, SHIPPING_FEE, FREE_SHIPPING_THRESHOLD } from '@/lib/shipping'

describe('calcShipping', () => {
  it('閾値未満は送料 ¥500', () => {
    expect(calcShipping(0)).toBe(SHIPPING_FEE)
    expect(calcShipping(4999)).toBe(SHIPPING_FEE)
  })

  it('閾値ちょうどで送料無料', () => {
    expect(calcShipping(FREE_SHIPPING_THRESHOLD)).toBe(0)
  })

  it('閾値超過で送料無料', () => {
    expect(calcShipping(10000)).toBe(0)
  })
})

describe('buildShippingOptions', () => {
  it('送料有料時の display_name は「全国一律」', () => {
    const opts = buildShippingOptions(1000)
    expect(opts).toHaveLength(1)
    expect(opts[0].shipping_rate_data.fixed_amount.amount).toBe(500)
    expect(opts[0].shipping_rate_data.display_name).toBe('全国一律')
  })

  it('送料無料時の display_name は「送料無料」', () => {
    const opts = buildShippingOptions(5000)
    expect(opts[0].shipping_rate_data.fixed_amount.amount).toBe(0)
    expect(opts[0].shipping_rate_data.display_name).toBe('送料無料')
  })

  it('currency は常に jpy', () => {
    expect(buildShippingOptions(100)[0].shipping_rate_data.fixed_amount.currency).toBe('jpy')
  })
})
