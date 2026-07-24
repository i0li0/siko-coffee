'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import Nav from '@/components/layout/Nav'
import Footer from '@/components/layout/Footer'
import type { RoasterRecord, RoasterStatus } from '@/types/platform'

const STATUS_LABEL: Record<RoasterStatus, string> = {
  pending: '承認待ち',
  active: '販売中',
  paused: '休止中',
  withdrawn: '退会済み',
  selling_out: '売り切り中',
}

const cardStyle = {
  width: '100%',
  maxWidth: '480px',
  padding: '32px',
  background: 'var(--bg2)',
  border: '1px solid var(--faint)',
  borderRadius: '12px',
} as const

const labelStyle = {
  fontFamily: 'var(--font-serif)',
  fontSize: '24px',
  fontWeight: 300,
  color: 'var(--cream)',
  letterSpacing: '0.14em',
  margin: '0 0 8px',
} as const

export default function RoasterHubClient({ roaster }: { roaster: RoasterRecord | null }) {
  const [pendingCount, setPendingCount] = useState<number | null>(null)

  const isActive = roaster?.status === 'active' || roaster?.status === 'selling_out'

  // 要対応（pending）の発注件数をベルに出す（§6.2.1）。active 系のみ取得。
  useEffect(() => {
    if (!isActive) return
    fetch('/api/roaster/pos?status=pending')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.pendingCount === 'number') setPendingCount(data.pendingCount)
      })
      .catch(() => {})
  }, [isActive])

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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
            <h1 style={labelStyle}>焙煎者</h1>
            {roaster && (
              <span
                style={{
                  fontSize: '11px',
                  color: isActive ? 'var(--amber)' : 'var(--dim)',
                  letterSpacing: '0.08em',
                  padding: '3px 10px',
                  border: `1px solid ${isActive ? 'rgba(212,160,23,0.35)' : 'var(--faint)'}`,
                  borderRadius: '4px',
                  whiteSpace: 'nowrap',
                }}
              >
                {STATUS_LABEL[roaster.status]}
              </span>
            )}
          </div>

          {/* 未登録 */}
          {!roaster && (
            <div style={{ ...panel }}>
              <p style={{ fontSize: '13px', color: 'var(--cream)', margin: '0 0 16px', lineHeight: 1.7 }}>
                あなたの焙煎した豆を Sikō Coffee のブレンドに掲載しませんか。
              </p>
              <Link
                href="/roaster/apply"
                style={{
                  display: 'inline-block',
                  background: 'transparent',
                  border: '1px solid var(--amber)',
                  borderRadius: '6px',
                  padding: '10px 24px',
                  color: 'var(--amber)',
                  fontSize: '13px',
                  letterSpacing: '0.08em',
                  textDecoration: 'none',
                }}
              >
                焙煎者として登録する →
              </Link>
            </div>
          )}

          {/* 承認待ち */}
          {roaster?.status === 'pending' && (
            <div style={{ ...panel }}>
              <p style={{ fontSize: '13px', color: 'var(--amber)', margin: '0 0 8px' }}>審査中です</p>
              <p style={{ fontSize: '12px', color: 'var(--dim)', margin: 0, lineHeight: 1.7 }}>
                登録申請を受け付けました。承認までしばらくお待ちください。
              </p>
            </div>
          )}

          {/* 休止・退会 */}
          {(roaster?.status === 'paused' || roaster?.status === 'withdrawn') && (
            <div style={{ ...panel }}>
              <p style={{ fontSize: '13px', color: 'var(--cream)', margin: '0 0 8px' }}>
                {STATUS_LABEL[roaster.status]}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--dim)', margin: 0, lineHeight: 1.7 }}>
                現在は新規の販売を停止しています。
              </p>
            </div>
          )}

          {/* 販売中・売り切り中 → 業務メニュー */}
          {isActive && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <HubLink
                href="/roaster/orders"
                title="発注応答"
                desc="ブレンドに使われた豆への注文を承認・辞退します"
                badge={pendingCount ?? undefined}
              />
              <HubLink href="/roaster/beans" title="豆の管理" desc="掲載する豆の価格・受注上限・ON/OFF" />
              <HubLink href="/roaster/lots" title="在庫ロット" desc="焙煎日ごとの在庫と鮮度の管理" />
            </div>
          )}
        </div>

        <p style={{ marginTop: '20px' }}>
          <Link href="/account" style={{ fontSize: '12px', color: 'var(--dim)', textDecoration: 'none', letterSpacing: '0.06em' }}>
            ← マイページへ
          </Link>
        </p>
      </div>
      <Footer />
    </>
  )
}

const panel = {
  padding: '20px',
  background: 'rgba(232,224,208,0.04)',
  borderRadius: '8px',
  border: '1px solid var(--faint)',
} as const

function HubLink({
  href,
  title,
  desc,
  badge,
  disabled,
}: {
  href?: string
  title: string
  desc: string
  badge?: number
  disabled?: boolean
}) {
  const inner = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '16px 20px',
        background: 'rgba(232,224,208,0.04)',
        border: '1px solid var(--faint)',
        borderRadius: '8px',
        opacity: disabled ? 0.5 : 1,
        transition: 'border-color 0.2s',
      }}
    >
      <div>
        <p style={{ fontSize: '14px', color: 'var(--cream)', margin: '0 0 4px', letterSpacing: '0.06em' }}>
          {title}
          {disabled && <span style={{ fontSize: '10px', color: 'var(--dim)', marginLeft: '8px' }}>近日公開</span>}
        </p>
        <p style={{ fontSize: '11px', color: 'var(--dim)', margin: 0, lineHeight: 1.6 }}>{desc}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {typeof badge === 'number' && badge > 0 && (
          <span
            style={{
              minWidth: '20px',
              height: '20px',
              padding: '0 6px',
              borderRadius: '10px',
              background: 'var(--amber)',
              color: 'var(--bg)',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {badge}
          </span>
        )}
        {!disabled && <span style={{ color: 'var(--amber)', fontSize: '14px' }}>→</span>}
      </div>
    </div>
  )

  if (disabled || !href) return inner
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      {inner}
    </Link>
  )
}
