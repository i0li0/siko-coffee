'use client'

import { useEffect, useState } from 'react'

const SECTIONS = ['hero', 'story', 'menu', 'location', 'sns', 'contact'] as const
type Section = typeof SECTIONS[number]

const LABELS: Record<Section, string> = {
  hero: 'トップ',
  story: 'ストーリー',
  menu: 'メニュー',
  location: 'ロケーション',
  sns: 'Instagram',
  contact: 'お問い合わせ',
}

interface Props { visible: boolean }

export default function DotNav({ visible }: Props) {
  const [active, setActive] = useState<Section>('hero')

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id as Section)
        })
      },
      { threshold: 0.4 },
    )
    SECTIONS.forEach((id) => {
      const el = document.getElementById(id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [])

  function goTo(id: Section) {
    const el = document.getElementById(id)
    if (!el) return
    window._lenis?.scrollTo(el, { duration: 1.6 })
  }

  return (
    <nav
      aria-label="Section navigation"
      className={`fixed right-[14px] top-1/2 -translate-y-1/2 z-[100]
        flex flex-col gap-[2px] transition-opacity duration-[1200ms]
        max-[700px]:right-1 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      {SECTIONS.map((s) => (
        <button
          key={s}
          type="button"
          aria-label={`${LABELS[s]}セクションへ移動`}
          aria-current={active === s ? 'true' : undefined}
          onClick={() => goTo(s)}
          className="group flex items-center justify-center w-7 h-7 border-none p-0
            bg-transparent cursor-pointer"
        >
          <span
            className={`block w-[5px] h-[5px] rounded-full transition-all duration-[400ms]
              ${active === s
                ? 'bg-[var(--amber)] scale-150'
                : 'bg-[rgba(212,160,23,0.25)] group-hover:bg-[rgba(212,160,23,0.55)]'
              }`}
          />
        </button>
      ))}
    </nav>
  )
}
