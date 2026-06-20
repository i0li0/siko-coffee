'use client'

import { useSession } from 'next-auth/react'

export default function UserMenu() {
  const { data: session, status } = useSession()

  if (status === 'loading') return null

  if (session?.user) {
    return (
      <a href="/account" className="group pointer-events-auto no-underline">
        <span className="relative flex flex-col items-center gap-0">
          <span className="font-mono font-light text-[16px] tracking-[0.04em]
            text-[rgba(255,252,245,0.92)] transition-colors duration-300
            group-hover:text-[var(--amber)]"
            style={{ fontFeatureSettings: '"ss01"' }}>
            account
          </span>
          <span className="block h-px w-0 group-hover:w-full transition-[width] duration-500 ease-out"
            style={{ background: 'linear-gradient(90deg, transparent, var(--amber), transparent)' }} />
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
