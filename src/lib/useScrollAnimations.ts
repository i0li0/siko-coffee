'use client'

import { useEffect } from 'react'

export function useScrollAnimations(ready: boolean) {
  useEffect(() => {
    if (!ready) return

    // Dynamic imports keep GSAP/Lenis out of the SSR bundle
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ST: any = null

    Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger'),
      import('lenis'),
      import('split-type'),
    ]).then(([{ gsap }, { ScrollTrigger }, { default: Lenis }, { default: SplitType }]) => {
      ST = ScrollTrigger
      gsap.registerPlugin(ScrollTrigger)

      /* ── Lenis smooth scroll ── */
      const lenis = new Lenis({
        duration: 1.6,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lenis.on('scroll', (ScrollTrigger as any).update)
      gsap.ticker.add((time: number) => { lenis.raf(time * 1000) })
      gsap.ticker.lagSmoothing(0)
      ;window._lenis = lenis

      /* ── Hero ── */
      gsap.timeline({ delay: 0.15 })
        .fromTo('.hero-tagline',
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 1.3, ease: 'power3.out' })
        .fromTo('.hero-tagline-en',
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 1.2, ease: 'power2.out' }, '-=0.55')
        .fromTo('.hero-scroll',
          { opacity: 0 },
          { opacity: 1, duration: 0.9, ease: 'power2.out' }, '-=0.6')

      /* ── Story kanji ── */
      const storyTl = gsap.timeline({
        scrollTrigger: { trigger: '.story-words', start: 'top 78%' },
      })
      document.querySelectorAll<HTMLElement>('.kanji-word').forEach((word, i) => {
        const kanjiSpan = word.querySelector<HTMLElement>('span:first-child')
        if (!kanjiSpan) return
        const split = new SplitType(kanjiSpan, { types: 'chars' })
        const spans = word.querySelectorAll('span')
        const wTl = gsap.timeline()
          .set(word, { opacity: 1 })
          .fromTo(split.chars!,
            { opacity: 0, y: 36, rotateX: -22, transformPerspective: 800, transformOrigin: '50% 0%' },
            { opacity: 1, y: 0, rotateX: 0, stagger: 0.09, duration: 1.1, ease: 'power3.out' })
          .fromTo(spans[1],
            { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' }, '-=0.52')
          .fromTo(spans[2],
            { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' }, '-=0.42')
        storyTl.add(wTl, i * 0.2)
      })

      /* ── Story body ── */
      gsap.fromTo('.story-body',
        { opacity: 0, y: 26 },
        { opacity: 1, y: 0, duration: 1.4, ease: 'power2.out',
          scrollTrigger: { trigger: '.story-body', start: 'top 88%' } })

      /* ── Menu items ── */
      document.querySelectorAll<HTMLElement>('.menu-item').forEach((item, i) => {
        gsap.fromTo(item,
          { opacity: 0, x: -28 },
          { opacity: 1, x: 0, duration: 1.2, delay: i * 0.08, ease: 'power2.out',
            scrollTrigger: { trigger: item, start: 'top 92%' } })
      })

      /* ── Other sections ── */
      ;['.loc-address', '.loc-hours', '.sns-header', '.sns-grid', '.contact-inner'].forEach((sel) => {
        const el = document.querySelector<HTMLElement>(sel)
        if (!el) return
        const delay = parseFloat(el.dataset.d ?? '0') * 0.22
        gsap.fromTo(el,
          { opacity: 0, y: 26 },
          { opacity: 1, y: 0, duration: 1.5, delay, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 88%' } })
      })

      /* ── Back to top visibility ── */
      lenis.on('scroll', ({ scroll }: { scroll: number }) => {
        const bt = document.getElementById('back-top')
        bt?.classList.toggle('opacity-100', scroll > window.innerHeight * 0.7)
      })

      /* ── Hero scroll link ── */
      document.getElementById('hero-scroll-link')?.addEventListener('click', (e) => {
        e.preventDefault()
        lenis.scrollTo(document.getElementById('story')!, { duration: 1.6 })
      })

      /* ── Back top link ── */
      document.getElementById('back-top')?.addEventListener('click', (e) => {
        e.preventDefault()
        lenis.scrollTo(0, { duration: 1.4 })
      })
    })

    return () => {
      window._lenis?.destroy()
      ST?.getAll().forEach((t: { kill: () => void }) => t.kill())
    }
  }, [ready])
}
