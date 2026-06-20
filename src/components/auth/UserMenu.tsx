'use client'

import { useSession } from 'next-auth/react'
import { getPresetSvg } from '@/lib/avatars'

function MiniAvatar({ presetId, url }: { presetId?: string | null; url?: string | null }) {
  const size = 26
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
      />
    )
  }
  const svg = presetId ? getPresetSvg(presetId) : null
  if (svg) {
    return (
      <span
        style={{ display: 'block', width: size, height: size, borderRadius: '50%', overflow: 'hidden' }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    )
  }
  return (
    <span style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%',
      background: 'rgba(200,164,90,0.2)', color: 'var(--amber)',
      fontSize: 12, fontFamily: 'var(--font-serif)',
    }}>
      ?
    </span>
  )
}

export default function UserMenu() {
  const { data: session, status } = useSession()

  if (status === 'loading') return null

  if (session?.user) {
    const ext = session.user as typeof session.user & { avatarPreset?: string | null; avatarUrl?: string | null }
    return (
      <a href="/account" className="group pointer-events-auto no-underline">
        <span className="relative flex items-center gap-[8px]">
          <MiniAvatar presetId={ext.avatarPreset} url={ext.avatarUrl} />
          <span className="flex flex-col items-center gap-0">
            <span className="font-mono font-light text-[16px] tracking-[0.04em]
              text-[rgba(255,252,245,0.92)] transition-colors duration-300
              group-hover:text-[var(--amber)]"
              style={{ fontFeatureSettings: '"ss01"' }}>
              account
            </span>
            <span className="block h-px w-0 group-hover:w-full transition-[width] duration-500 ease-out"
              style={{ background: 'linear-gradient(90deg, transparent, var(--amber), transparent)' }} />
          </span>
        </span>
      </a>
    )
  }

  return (
    <a href="/login" className="group pointer-events-auto no-underline">
      <span className="relative flex flex-col items-center gap-0 w-[52px]">
        <span className="font-mono font-light text-[16px] tracking-[0.04em]
          text-[rgba(255,252,245,0.92)] transition-colors duration-300
          group-hover:text-[var(--amber)]">
          login
        </span>
        <span className="block h-px w-0 group-hover:w-full transition-[width] duration-500 ease-out"
          style={{ background: 'linear-gradient(90deg, transparent, var(--amber), transparent)' }} />
      </span>
    </a>
  )
}
