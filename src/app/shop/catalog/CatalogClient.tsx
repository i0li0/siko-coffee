'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import Nav from '@/components/layout/Nav'
import Footer from '@/components/layout/Footer'
import type { RoastLevel } from '@/types/platform'

interface CatalogBean {
  beanId: string
  name: string
  greenOrigin: string
  roastLevel: RoastLevel
  pricePer100g: number
  leadTimeDays: number
  roasterId: string
  roasterName: string
}

const ROAST_LABEL: Record<RoastLevel, string> = {
  light: 'ライト',
  cinnamon: 'シナモン',
  medium: 'ミディアム',
  high: 'ハイ',
  city: 'シティ',
  full_city: 'フルシティ',
  french: 'フレンチ',
  italian: 'イタリアン',
}

const MAX_COMPONENTS = 5 // checkout の blendComponentSchema と一致
const GRAMS_OPTIONS = [100, 150, 200, 250, 300, 350, 400, 450, 500]
const GRIND_OPTIONS = ['豆のまま', '粗挽き', '中挽き', '細挽き']

interface Pick {
  beanId: string
  ratioPct: number
}

const cardBase = {
  width: '100%',
  maxWidth: '640px',
  padding: '28px',
  background: 'var(--bg2)',
  border: '1px solid var(--faint)',
  borderRadius: '12px',
} as const

const inputStyle = {
  background: 'var(--bg)',
  border: '1px solid var(--faint)',
  borderRadius: '6px',
  padding: '9px 12px',
  color: 'var(--cream)',
  fontSize: '13px',
  fontFamily: 'var(--font-sans)',
  boxSizing: 'border-box' as const,
}

export default function CatalogClient() {
  const [beans, setBeans] = useState<CatalogBean[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [picks, setPicks] = useState<Pick[]>([])
  const [name, setName] = useState('')
  const [grams, setGrams] = useState(200)
  const [grind, setGrind] = useState(GRIND_OPTIONS[0])
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/beans')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then((data: { beans: CatalogBean[] }) => setBeans(data.beans ?? []))
      .catch(() => setError('カタログの取得に失敗しました'))
  }, [])

  const beanMap = useMemo(() => new Map((beans ?? []).map((b) => [b.beanId, b])), [beans])
  const total = picks.reduce((a, p) => a + p.ratioPct, 0)
  const balanced = Math.abs(total - 100) <= 1 && picks.length > 0

  // 選択豆・比率から概算金額（正式な価格はサーバが確定）
  const estimate = useMemo(
    () =>
      Math.round(
        picks.reduce((sum, p) => {
          const b = beanMap.get(p.beanId)
          if (!b) return sum
          return sum + (b.pricePer100g * ((grams * p.ratioPct) / 100)) / 100
        }, 0),
      ),
    [picks, grams, beanMap],
  )

  function toggle(beanId: string) {
    setFormError(null)
    setPicks((prev) => {
      const exists = prev.find((p) => p.beanId === beanId)
      if (exists) return prev.filter((p) => p.beanId !== beanId)
      if (prev.length >= MAX_COMPONENTS) return prev
      return [...prev, { beanId, ratioPct: 0 }]
    })
  }

  function setRatio(beanId: string, ratioPct: number) {
    setPicks((prev) => prev.map((p) => (p.beanId === beanId ? { ...p, ratioPct } : p)))
  }

  function evenSplit() {
    setPicks((prev) => {
      if (prev.length === 0) return prev
      const base = Math.floor(100 / prev.length)
      const rem = 100 - base * prev.length
      return prev.map((p, i) => ({ ...p, ratioPct: base + (i < rem ? 1 : 0) }))
    })
  }

  async function checkout() {
    if (!name.trim()) return setFormError('ブレンド名を入力してください')
    if (picks.length === 0) return setFormError('豆を1種類以上選んでください')
    if (picks.some((p) => p.ratioPct < 1)) return setFormError('各豆の比率は1%以上にしてください')
    if (!balanced) return setFormError('比率の合計を100%にしてください')

    setBusy(true)
    setFormError(null)
    try {
      const res = await fetch('/api/checkout/blend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              name: name.trim(),
              components: picks.map((p) => ({ beanId: p.beanId, ratioPct: p.ratioPct })),
              grams,
              grind,
            },
          ],
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (data.url) {
        window.location.href = data.url
        return
      }
      setFormError(data.error ?? '決済の準備に失敗しました')
    } catch {
      setFormError('通信エラーが発生しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Nav visible logoHref="/" />
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '24px',
          paddingTop: '140px',
        }}
      >
        <div style={cardBase}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '24px', fontWeight: 300, color: 'var(--cream)', letterSpacing: '0.12em', margin: 0 }}>
              焙煎家の豆でつくる
            </h1>
            <Link href="/shop" style={{ fontSize: '12px', color: 'var(--dim)', textDecoration: 'none', letterSpacing: '0.06em' }}>
              ← ショップ
            </Link>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--dim)', margin: '0 0 24px', lineHeight: 1.7 }}>
            登録焙煎家の豆から最大{MAX_COMPONENTS}種を選び、比率を決めてあなたのブレンドをつくれます。価格は選んだ豆の比率で決まります。
          </p>

          {error && <p style={{ fontSize: '13px', color: '#e57373' }}>{error}</p>}
          {beans === null && !error && <p style={{ fontSize: '12px', color: 'var(--dim)', letterSpacing: '0.06em' }}>読み込み中...</p>}
          {beans !== null && beans.length === 0 && (
            <p style={{ fontSize: '13px', color: 'var(--dim)' }}>現在、掲載中の豆がありません。</p>
          )}

          {/* 豆カタログ */}
          {beans && beans.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
              {beans.map((b) => {
                const picked = picks.some((p) => p.beanId === b.beanId)
                const disabled = !picked && picks.length >= MAX_COMPONENTS
                return (
                  <button
                    key={b.beanId}
                    onClick={() => toggle(b.beanId)}
                    disabled={disabled}
                    style={{
                      textAlign: 'left',
                      padding: '14px 18px',
                      background: picked ? 'rgba(212,160,23,0.08)' : 'rgba(232,224,208,0.04)',
                      border: `1px solid ${picked ? 'rgba(212,160,23,0.4)' : 'var(--faint)'}`,
                      borderRadius: '8px',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.4 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                      <span style={{ fontSize: '14px', color: 'var(--cream)', letterSpacing: '0.04em' }}>
                        {picked ? '✓ ' : ''}{b.name}
                      </span>
                      <span style={{ fontSize: '13px', color: 'var(--amber)', fontFamily: 'var(--font-serif)' }}>¥{b.pricePer100g.toLocaleString()}/100g</span>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--dim)', margin: 0, lineHeight: 1.6 }}>
                      {b.greenOrigin} ・ {ROAST_LABEL[b.roastLevel]} ・ {b.roasterName}
                    </p>
                  </button>
                )
              })}
            </div>
          )}

          {/* 比率エディタ */}
          {picks.length > 0 && (
            <div style={{ padding: '18px 20px', background: 'rgba(232,224,208,0.04)', borderRadius: '8px', border: '1px solid var(--faint)', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '13px', color: 'var(--cream)', letterSpacing: '0.06em' }}>配合比</span>
                <button
                  onClick={evenSplit}
                  style={{ background: 'transparent', border: '1px solid var(--faint)', borderRadius: '6px', padding: '5px 12px', color: 'var(--dim)', fontSize: '11px', cursor: 'pointer' }}
                >
                  均等割り
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {picks.map((p) => {
                  const b = beanMap.get(p.beanId)
                  return (
                    <div key={p.beanId} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ flex: 1, fontSize: '13px', color: 'var(--cream)' }}>{b?.name ?? p.beanId}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={p.ratioPct}
                        onChange={(e) => setRatio(p.beanId, Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                        style={{ ...inputStyle, width: '72px', textAlign: 'right' }}
                      />
                      <span style={{ fontSize: '12px', color: 'var(--dim)', width: '16px' }}>%</span>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--faint)' }}>
                <span style={{ fontSize: '12px', color: balanced ? 'var(--amber)' : '#e57373' }}>合計 {total}%</span>
                {!balanced && <span style={{ fontSize: '11px', color: 'var(--dim)' }}>100%にしてください</span>}
              </div>
            </div>
          )}

          {/* 名前・分量・挽き方 */}
          {picks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>ブレンド名</label>
                <input style={{ ...inputStyle, width: '100%' }} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="例）朝のブレンド" />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>分量</label>
                  <select style={{ ...inputStyle, width: '100%' }} value={grams} onChange={(e) => setGrams(Number(e.target.value))}>
                    {GRAMS_OPTIONS.map((g) => (
                      <option key={g} value={g}>{g}g</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>挽き方</label>
                  <select style={{ ...inputStyle, width: '100%' }} value={grind} onChange={(e) => setGrind(e.target.value)}>
                    {GRIND_OPTIONS.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {formError && <p style={{ fontSize: '12px', color: '#e57373', margin: '0 0 12px' }}>{formError}</p>}

          {/* 購入 */}
          {picks.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--dim)', margin: '0 0 2px' }}>目安価格</p>
                <p style={{ fontSize: '18px', color: 'var(--cream)', margin: 0, fontFamily: 'var(--font-serif)' }}>¥{estimate.toLocaleString()}</p>
              </div>
              <button
                onClick={checkout}
                disabled={busy || !balanced}
                style={{
                  flex: 1,
                  maxWidth: '260px',
                  background: 'transparent',
                  border: `1px solid ${balanced ? 'var(--amber)' : 'var(--faint)'}`,
                  borderRadius: '6px',
                  padding: '14px',
                  color: balanced ? 'var(--amber)' : 'var(--dim)',
                  fontSize: '13px',
                  letterSpacing: '0.1em',
                  cursor: busy || !balanced ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.5 : 1,
                }}
              >
                {busy ? '準備中...' : '購入へ進む'}
              </button>
            </div>
          )}
        </div>

        <p style={{ marginTop: '16px', fontSize: '11px', color: 'var(--dim)', maxWidth: '640px', textAlign: 'center', lineHeight: 1.7 }}>
          ※ 表示は目安です。最終価格・在庫の可否は購入手続きで確定します。在庫がない分は焙煎家への発注（お届けまで数日）になる場合があります。
        </p>
      </div>
      <Footer />
    </>
  )
}
