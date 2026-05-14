'use client'

import { useState } from 'react'
import OpeningCanvas   from '@/components/canvas/OpeningCanvas'
import SmokeCanvas     from '@/components/canvas/SmokeCanvas'
import StarsCanvas     from '@/components/canvas/StarsCanvas'
import SmokeField      from '@/components/SmokeField'
import Nav             from '@/components/layout/Nav'
import DotNav          from '@/components/layout/DotNav'
import Footer          from '@/components/layout/Footer'
import TweaksPanel     from '@/components/TweaksPanel'
import Hero            from '@/components/sections/Hero'
import Story           from '@/components/sections/Story'
import Menu            from '@/components/sections/Menu'
import Location        from '@/components/sections/Location'
import Instagram       from '@/components/sections/Instagram'
import Contact         from '@/components/sections/Contact'
import { useScrollAnimations } from '@/lib/useScrollAnimations'

export default function Home() {
  const [opened, setOpened] = useState(false)

  useScrollAnimations(opened)

  return (
    <>
      {/* Background layers */}
      <StarsCanvas />
      <SmokeField />
      <SmokeCanvas />

      {/* Opening */}
      <OpeningCanvas onFinish={() => setOpened(true)} />

      {/* UI chrome */}
      <Nav     visible={opened} />
      <DotNav  visible={opened} />
      <TweaksPanel />

      {/* Back to top */}
      <a
        href="#hero"
        id="back-top"
        aria-label="Back to top"
        className="fixed bottom-[30px] right-9 z-[100]
          font-serif text-[11.5px] tracking-[0.15em] no-underline
          text-[rgba(200,169,110,0.28)] opacity-0 transition-[opacity,color] duration-500
          hover:text-[#c8a96e]"
      >
        ↑ top
      </a>

      {/* Content */}
      <main>
        <Hero />
        <Story />
        <Menu />
        <Location />
        <Instagram />
        <Contact />
      </main>

      <Footer />
    </>
  )
}
