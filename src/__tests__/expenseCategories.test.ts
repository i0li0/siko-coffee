import { describe, it, expect } from 'vitest'
import { CATEGORIES, CATEGORY_LABEL } from '@/lib/expenseCategories'

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
