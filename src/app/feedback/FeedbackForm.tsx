'use client'

import Link from 'next/link'
import { useState } from 'react'
import { FEEDBACK_CATEGORIES, FEEDBACK_CATEGORY_LABELS, FEEDBACK_CONTENT_MAX } from '@/lib/feedback'

const card: React.CSSProperties = {
  width: '100%',
  maxWidth: '440px',
  padding: '48px 40px',
  background: 'var(--bg2)',
  border: '1px solid var(--faint)',
  borderRadius: '12px',
}
const fieldStyle: React.CSSProperties = {
  background: 'rgba(232,224,208,0.06)',
  border: '1px solid var(--faint)',
  borderRadius: '6px',
  padding: '12px 16px',
  color: 'var(--cream)',
  fontSize: '14px',
  fontFamily: 'var(--font-sans)',
  outline: 'none',
  width: '100%',
}

export default function FeedbackForm({ from }: { from: string }) {
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<string>('opinion')
  const [website, setWebsite] = useState('') // ハニーポット
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, category, from, website }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? '送信に失敗しました')
        return
      }
      setSent(true)
    } catch {
      setError('送信に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={card}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '24px', fontWeight: 300, color: 'var(--cream)', letterSpacing: '0.14em', textAlign: 'center', marginBottom: '8px' }}>
          Sikō Coffee
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--dim)', textAlign: 'center', letterSpacing: '0.10em', marginBottom: '32px' }}>
          ご意見・ご感想
        </p>

        {sent ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--dim)', textAlign: 'center', margin: 0 }}>
              お寄せいただきありがとうございます。<br />今後の改善に役立てさせていただきます。
            </p>
            <p style={{ fontSize: '12px', color: 'var(--dim)', textAlign: 'center', margin: 0 }}>
              <Link href="/" style={{ color: 'var(--amber)', textDecoration: 'none' }}>トップへ戻る</Link>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--dim)', margin: 0 }}>
              匿名でお送りいただけます。お名前やメールアドレスは収集せず、誰が送ったかは分からない仕組みです。お気軽にどうぞ。
            </p>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--dim)', letterSpacing: '0.06em' }}>種類</span>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                style={{ ...fieldStyle, appearance: 'none', cursor: 'pointer' }}
              >
                {FEEDBACK_CATEGORIES.map(c => (
                  <option key={c} value={c} style={{ background: 'var(--bg2)' }}>
                    {FEEDBACK_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--dim)', letterSpacing: '0.06em' }}>内容</span>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="ご意見・ご感想をご自由にお書きください"
                required
                maxLength={FEEDBACK_CONTENT_MAX}
                rows={6}
                autoFocus
                style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.7 }}
              />
              <span style={{ fontSize: '11px', color: 'var(--dim)', textAlign: 'right' }}>
                {content.length} / {FEEDBACK_CONTENT_MAX}
              </span>
            </label>

            {/* ハニーポット: 人間には見えない。bot が埋めたら送信を破棄する */}
            <input
              type="text"
              name="website"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }}
            />

            {error && <p style={{ fontSize: '13px', color: '#e05555', textAlign: 'center', margin: 0 }}>{error}</p>}

            <button
              type="submit"
              disabled={loading || content.trim().length === 0}
              style={{
                background: loading || content.trim().length === 0 ? 'transparent' : 'var(--amber)',
                border: '1px solid var(--amber)',
                borderRadius: '6px',
                padding: '12px',
                color: loading || content.trim().length === 0 ? 'var(--dim)' : 'var(--bg)',
                fontSize: '13px',
                fontFamily: 'var(--font-sans)',
                letterSpacing: '0.10em',
                cursor: loading || content.trim().length === 0 ? 'not-allowed' : 'pointer',
                fontWeight: 500,
              }}
            >
              {loading ? '送信中...' : '送信する'}
            </button>

            <p style={{ fontSize: '12px', color: 'var(--dim)', textAlign: 'center', margin: 0 }}>
              <Link href="/" style={{ color: 'var(--amber)', textDecoration: 'none' }}>トップへ戻る</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
