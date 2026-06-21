import { describe, it, expect } from 'vitest'
import { PRESET_AVATARS, randomPresetId, getPresetSvg } from '@/lib/avatars'

describe('PRESET_AVATARS', () => {
  it('全プリセットが id, label, svg を持つ', () => {
    for (const a of PRESET_AVATARS) {
      expect(a.id).toBeTruthy()
      expect(a.label).toBeTruthy()
      expect(a.svg).toContain('<svg')
    }
  })

  it('ID が一意', () => {
    const ids = PRESET_AVATARS.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('getPresetSvg', () => {
  it('有効な ID で SVG を返す', () => {
    const svg = getPresetSvg('bean')
    expect(svg).toContain('<svg')
  })

  it('無効な ID は undefined', () => {
    expect(getPresetSvg('nonexistent')).toBeUndefined()
  })
})

describe('randomPresetId', () => {
  it('有効なプリセット ID を返す', () => {
    const ids = PRESET_AVATARS.map(a => a.id)
    for (let i = 0; i < 20; i++) {
      expect(ids).toContain(randomPresetId())
    }
  })
})
