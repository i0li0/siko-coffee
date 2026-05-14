'use client'

import { useEffect, useRef } from 'react'

export default function StarsCanvas() {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const waveRef    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const starsEl = canvasRef.current!
    const waveEl  = waveRef.current!
    const sCtx    = starsEl.getContext('2d')!

    let SW: number, SH: number
    let rafId: number
    let intensity = 0.35

    function resizeStars() {
      SW = starsEl.width  = window.innerWidth
      SH = starsEl.height = window.innerHeight
    }

    const STARS = Array.from({ length: 220 }, () => ({
      nx:  Math.random(),
      ny:  Math.random(),
      r:   0.4 + Math.random() * 1.3,
      ph:  Math.random() * Math.PI * 2,
      spd: 0.007 + Math.random() * 0.018,
    }))

    let wt = 0
    const CYCLE = 50000
    const cycleT0 = performance.now()

    function tick(now: number) {
      wt += 0.0017
      const phase = ((now - cycleT0) % CYCLE) / CYCLE
      const dawn  = (Math.sin(phase * Math.PI * 2 - Math.PI / 2) + 1) / 2

      sCtx.clearRect(0, 0, SW, SH)
      const starVis = 1 - dawn * 0.82
      STARS.forEach((s) => {
        s.ph += s.spd
        const twinkle = (Math.sin(s.ph) + 1) * 0.5
        const a = twinkle * 0.55 * starVis
        if (a < 0.008) return
        sCtx.beginPath()
        sCtx.arc(s.nx * SW, s.ny * SH, s.r, 0, Math.PI * 2)
        sCtx.fillStyle = `rgba(225,215,185,${a})`
        sCtx.fill()
      })

      const x1 = 28 + Math.sin(wt) * 18
      const y1 = 22 + Math.cos(wt * 0.73) * 14
      const x2 = 66 + Math.sin(wt * 0.82 + 1) * 20
      const y2 = 58 + Math.cos(wt * 0.61 + 2) * 18
      const na = intensity * (1 - dawn * 0.65)

      const dH  = `rgba(160,65,8,${dawn * 0.3})`
      const dH2 = `rgba(200,95,20,${dawn * 0.14})`
      const dSk = `rgba(38,14,62,${dawn * 0.4})`
      const dMg = `rgba(120,40,80,${dawn * 0.18})`

      waveEl.style.background = [
        `radial-gradient(ellipse 130% 30% at 50% 108%, ${dH},  transparent)`,
        `radial-gradient(ellipse 80%  18% at 50% 102%, ${dH2}, transparent)`,
        `radial-gradient(ellipse 120% 40% at 50% 80%,  ${dMg}, transparent)`,
        `radial-gradient(ellipse 100% 55% at 50% -10%, ${dSk}, transparent)`,
        `radial-gradient(ellipse 90%  40% at ${x1}% ${y1}%, rgba(8,9,26,${na}),     transparent)`,
        `radial-gradient(ellipse 70%  35% at ${x2}% ${y2}%, rgba(5,11,17,${na*0.8}), transparent)`,
      ].join(',')

      rafId = requestAnimationFrame(tick)
    }

    window.addEventListener('resize', resizeStars, { passive: true })
    resizeStars()
    rafId = requestAnimationFrame(tick)

    ;window._setWaveIntensity = (v: number) => { intensity = v }

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resizeStars)
    }
  }, [])

  return (
    <>
      <div ref={waveRef} id="wave-overlay" aria-hidden="true" />
      <canvas ref={canvasRef} id="stars-canvas" aria-hidden="true" />
    </>
  )
}
