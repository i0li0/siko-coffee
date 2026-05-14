'use client'

import { useEffect, useState } from 'react'

const SECTIONS = ['hero', 'story', 'menu', 'location', 'sns', 'contact'] as const
type Section = typeof SECTIONS[number]

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
      className={`fixed right-[22px] top-1/2 -translate-y-1/2 z-[100]
        flex flex-col gap-[13px] transition-opacity duration-[1200ms]
        max-[700px]:right-3 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      {SECTIONS.map((s) => (
        <button
          key={s}
          title={s.charAt(0).toUpperCase() + s.slice(1)}
          onClick={() => goTo(s)}
          className={`w-[5px] h-[5px] rounded-full border-none p-0 cursor-pointer
            transition-all duration-[400ms]
            ${active === s
              ? 'bg-[#c8a96e] scale-150'
              : 'bg-[rgba(200,169,110,0.2)] hover:bg-[rgba(200,169,110,0.5)]'
            }`}
        />
      ))}
    </nav>
  )
}
