import { describe, it, expect } from 'vitest'
import { SHOP_CATEGORIES } from '@/lib/shopCategories'
import { CATEGORIES, CATEGORY_LABEL } from '@/lib/expenseCategories'

describe('SHOP_CATEGORIES', () => {
  it('"all" カテゴリが存在する', () => {
    expect(SHOP_CATEGORIES.find(c => c.key === 'all')).toBeDefined()
  })

  it('"all" は available: true', () => {
    expect(SHOP_CATEGORIES.find(c => c.key === 'all')?.available).toBe(true)
  })

  it('key が重複していない', () => {
    const keys = SHOP_CATEGORIES.map(c => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('CATEGORY_LABEL', () => {
  it('全カテゴリが CATEGORY_LABEL に含まれる', () => {
    for (const c of CATEGORIES) {
      expect(CATEGORY_LABEL[c.value]).toBe(c.label)
    }
  })

  it('rent は "地代家賃"', () => {
    expect(CATEGORY_LABEL['rent']).toBe('地代家賃')
  })
})
