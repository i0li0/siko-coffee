'use client'

import Image from 'next/image'

interface Props { visible: boolean }

export default function Nav({ visible }: Props) {
  function scrollTo(id: string) {
    const el = document.getElementById(id)
    if (!el) return
    window._lenis?.scrollTo(el, { duration: 1.6 })
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] flex justify-between items-center
      px-11 py-6 pointer-events-none
      max-[700px]:px-5 max-[700px]:py-4">
      <a
        href="#hero"
        onClick={(e) => { e.preventDefault(); scrollTo('hero') }}
        className={`flex items-center gap-3 no-underline pointer-events-auto
          transition-opacity duration-[1200ms] ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        <Image
          src="/images/logo/logo_siko8.png"
          alt="Sikō Coffee"
          width={64}
          height={64}
          className="h-8 w-auto brightness-[0.88] transition-[filter] duration-300
            hover:brightness-100 hover:sepia hover:hue-rotate-[10deg] hover:saturate-[1.4]"
        />
        <span className="hidden nav:block font-serif font-light text-xs tracking-[0.2em]
          text-[rgba(200,169,110,0.55)]">
          Coffee
        </span>
      </a>
    </nav>
  )
}
