'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Nav from '@/components/layout/Nav'
import Footer from '@/components/layout/Footer'
import type { LicenseType } from '@/types/platform'

// 焙煎者規約の版。改訂したら上げる（roasters.termsVersion に記録される・§5）。
const ROASTER_TERMS_VERSION = '1.0'

const LICENSE_LABEL: Record<LicenseType, string> = {
  notification: '届出（コーヒー製造・加工業）',
  permit: '許可',
}

const cardStyle = {
  width: '100%',
  maxWidth: '520px',
  padding: '32px',
  background: 'var(--bg2)',
  border: '1px solid var(--faint)',
  borderRadius: '12px',
} as const

const inputStyle = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--faint)',
  borderRadius: '6px',
  padding: '10px 12px',
  color: 'var(--cream)',
  fontSize: '13px',
  fontFamily: 'var(--font-sans)',
  boxSizing: 'border-box' as const,
}
const fieldLabel = { fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.06em', margin: '0 0 6px', display: 'block' } as const

interface OptIns {
  allowBlend: boolean
  allowNameStory: boolean
  allowSelloutAfterExit: boolean
}

const OPT_IN_ITEMS: { key: keyof OptIns; label: string; desc: string }[] = [
  { key: 'allowBlend', label: '自分の豆を他の方のブレンドに使ってよい', desc: '購入者が作るブレンドの材料として掲載されます。' },
  { key: 'allowNameStory', label: '名前・ストーリーの掲載を許可する', desc: '豆やブレンドに焙煎者名・紹介文を表示します。' },
  { key: 'allowSelloutAfterExit', label: '退会後の在庫売り切りを許可する', desc: '退会しても残った在庫は売り切りまで販売を続けられます。' },
]

export default function RoasterApplyClient() {
  const router = useRouter()

  const [displayName, setDisplayName] = useState('')
  const [licenseType, setLicenseType] = useState<LicenseType>('notification')
  const [licenseNo, setLicenseNo] = useState('')
  const [licenseExpiry, setLicenseExpiry] = useState('')
  const [invoiceRegNo, setInvoiceRegNo] = useState('')
  const [optIns, setOptIns] = useState<OptIns>({ allowBlend: true, allowNameStory: true, allowSelloutAfterExit: true })
  const [agreed, setAgreed] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function validate(): string | null {
    if (!displayName.trim()) return '販売者名を入力してください'
    if (!licenseNo.trim()) return '許可番号／届出番号を入力してください'
    if (licenseType === 'permit' && !/^\d{4}-\d{2}-\d{2}$/.test(licenseExpiry)) return '許可の有効期限を入力してください'
    if (invoiceRegNo.trim() && !/^T\d{13}$/.test(invoiceRegNo.trim())) return 'インボイス番号は T+13桁で入力してください'
    if (!agreed) return '規約への同意が必要です'
    return null
  }

  async function submit() {
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/roaster/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          licenseType,
          licenseNo: licenseNo.trim(),
          ...(licenseType === 'permit' ? { licenseExpiry } : {}),
          ...(invoiceRegNo.trim() ? { invoiceRegNo: invoiceRegNo.trim() } : {}),
          termsVersion: ROASTER_TERMS_VERSION,
          optIns,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 409) {
          // 既に申請済み → ハブへ（審査中表示）
          router.push('/roaster')
          return
        }
        setError(data.error ?? '申請に失敗しました')
        return
      }
      // 申請完了 → ハブが「審査中」を表示する
      router.push('/roaster')
    } catch {
      setError('申請に失敗しました')
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
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '24px', fontWeight: 300, color: 'var(--cream)', letterSpacing: '0.14em', margin: 0 }}>
              焙煎者登録
            </h1>
            <Link href="/roaster" style={{ fontSize: '12px', color: 'var(--dim)', textDecoration: 'none', letterSpacing: '0.06em' }}>
              ← 戻る
            </Link>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--dim)', margin: '0 0 24px', lineHeight: 1.7 }}>
            あなたの焙煎した豆を Sikō Coffee のブレンドに掲載します。申請後、内容を確認して承認します。
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={fieldLabel}>販売者名（表示名）</label>
              <input style={inputStyle} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} placeholder="例）◯◯焙煎所" />
            </div>

            {/* 営業許可種別 */}
            <div>
              <label style={fieldLabel}>営業の種別</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(['notification', 'permit'] as LicenseType[]).map((t) => (
                  <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: 'var(--cream)' }}>
                    <input type="radio" name="licenseType" checked={licenseType === t} onChange={() => setLicenseType(t)} style={{ accentColor: 'var(--amber)' }} />
                    {LICENSE_LABEL[t]}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={fieldLabel}>{licenseType === 'permit' ? '許可番号' : '届出番号'}</label>
                <input style={inputStyle} value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} maxLength={60} />
              </div>
              {licenseType === 'permit' && (
                <div style={{ flex: 1 }}>
                  <label style={fieldLabel}>有効期限</label>
                  <input style={inputStyle} type="date" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} />
                </div>
              )}
            </div>

            <div>
              <label style={fieldLabel}>インボイス登録番号（任意・T+13桁）</label>
              <input style={inputStyle} value={invoiceRegNo} onChange={(e) => setInvoiceRegNo(e.target.value)} maxLength={14} placeholder="T1234567890123" />
            </div>

            {/* オプトイン（§5 同意設計） */}
            <div>
              <label style={fieldLabel}>掲載の同意</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {OPT_IN_ITEMS.map((item) => (
                  <label key={item.key} style={{ display: 'flex', gap: '10px', cursor: 'pointer', alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      checked={optIns[item.key]}
                      onChange={(e) => setOptIns((p) => ({ ...p, [item.key]: e.target.checked }))}
                      style={{ accentColor: 'var(--amber)', marginTop: '3px' }}
                    />
                    <span>
                      <span style={{ fontSize: '13px', color: 'var(--cream)', display: 'block' }}>{item.label}</span>
                      <span style={{ fontSize: '11px', color: 'var(--dim)', lineHeight: 1.5 }}>{item.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* 規約同意 */}
            <label style={{ display: 'flex', gap: '10px', cursor: 'pointer', alignItems: 'flex-start', paddingTop: '4px', borderTop: '1px solid var(--faint)' }}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ accentColor: 'var(--amber)', marginTop: '3px' }} />
              <span style={{ fontSize: '12px', color: 'var(--cream)', lineHeight: 1.6 }}>
                記載した営業許可・届出の内容が正確であり、鮮度・品質に関する運用ルールに同意します。
              </span>
            </label>

            {error && <p style={{ fontSize: '12px', color: '#e57373', margin: 0 }}>{error}</p>}

            <button
              onClick={submit}
              disabled={busy}
              style={{
                width: '100%',
                background: 'transparent',
                border: '1px solid var(--amber)',
                borderRadius: '6px',
                padding: '13px',
                color: 'var(--amber)',
                fontSize: '13px',
                letterSpacing: '0.1em',
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.5 : 1,
              }}
            >
              {busy ? '送信中...' : '申請する'}
            </button>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
