'use client'

import { useEffect, useRef } from 'react'

interface Props {
  onFinish: () => void
}

export default function OpeningCanvas({ onFinish }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const skipRef   = useRef<HTMLButtonElement>(null)
  const rafRef    = useRef<number>(0)
  const speedRef  = useRef(1)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext('2d')!
    const skip   = skipRef.current!

    let W: number, H: number, CX: number, CY: number
    let startTime: number | null = null
    let lights: ReturnType<typeof mkLightsArr> = []
    let stars:  ReturnType<typeof mkStarsArr>  = []

    const logoImg = new Image()
    let logoLoaded = false
    logoImg.onload = () => { logoLoaded = true }
    logoImg.src = '/images/logo/logo_siko8.png'

    const T = () => {
      const s = speedRef.current
      return {
        SPAWN:  Math.round(900  / s),
        TRAVEL: Math.round(1350 / s),
        ARRIVE: Math.round(3350 / s),
        FLASH:  Math.round(3850 / s),
        LOGO:   Math.round(4150 / s),
        HOLD:   Math.round(5450 / s),
        FADE:   Math.round(5850 / s),
        DONE:   Math.round(6650 / s),
      }
    }

    function resize() {
      W = canvas.width  = window.innerWidth
      H = canvas.height = window.innerHeight
      CX = W / 2; CY = H / 2
    }

    function mkStarsArr(n: number) {
      return Array.from({ length: n }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.3,
        ph: Math.random() * Math.PI * 2,
        spd: 0.011 + Math.random() * 0.022,
      }))
    }

    type Light = {
      ox: number; oy: number
      cp1x: number; cp1y: number
      cp2x: number; cp2y: number
      delay: number
      trail: [number, number][]
    }

    function mkLightsArr(): Light[] {
      const eps: [number, number][] = [
        [CX + (Math.random() - 0.5) * W * 0.35, 0],
        [W,  CY + (Math.random() - 0.5) * H * 0.35],
        [CX + (Math.random() - 0.5) * W * 0.35, H],
        [0,  CY + (Math.random() - 0.5) * H * 0.35],
      ]
      const jx = W * 0.17, jy = H * 0.17
      return eps.map(([ox, oy], i) => ({
        ox, oy,
        cp1x: ox + (CX - ox) * 0.28 + (Math.random() - 0.5) * jx * 2,
        cp1y: oy + (CY - oy) * 0.28 + (Math.random() - 0.5) * jy * 2,
        cp2x: ox + (CX - ox) * 0.72 + (Math.random() - 0.5) * jx,
        cp2y: oy + (CY - oy) * 0.72 + (Math.random() - 0.5) * jy,
        delay: i * 0.12,
        trail: [],
      }))
    }

    function bz(t: number, p0: number, p1: number, p2: number, p3: number) {
      const u = 1 - t
      return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3
    }
    function lpos(l: Light, t: number): [number, number] {
      t = Math.max(0, Math.min(1, t))
      return [bz(t, l.ox, l.cp1x, l.cp2x, CX), bz(t, l.oy, l.cp1y, l.cp2y, CY)]
    }

    function drawGlow(x: number, y: number, size: number, alpha: number, core = true) {
      ctx.save()
      ctx.globalAlpha = alpha
      const g = ctx.createRadialGradient(x, y, 0, x, y, size * 7)
      g.addColorStop(0, 'rgba(200,169,110,.55)')
      g.addColorStop(1, 'rgba(200,169,110,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(x, y, size * 7, 0, Math.PI * 2); ctx.fill()
      if (core) {
        ctx.fillStyle = 'rgba(255,248,225,.95)'
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()
    }

    function draw(ts: number) {
      if (!startTime) startTime = ts
      const t = ts - startTime
      const Tv = T()

      ctx.fillStyle = '#07070f'
      ctx.fillRect(0, 0, W, H)

      stars.forEach((s) => {
        s.ph += s.spd
        const a = (Math.sin(s.ph) + 1) * 0.5 * 0.3
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200,188,155,${a})`; ctx.fill()
      })

      if (t >= Tv.SPAWN && t < Tv.TRAVEL) {
        const pt = (t - Tv.SPAWN) / (Tv.TRAVEL - Tv.SPAWN)
        lights.forEach((l) => {
          const a = Math.max(0, Math.min(1, (pt - l.delay) * 5))
          drawGlow(l.ox, l.oy, 2.5, a)
        })
      } else if (t >= Tv.TRAVEL && t < Tv.ARRIVE) {
        const pt = (t - Tv.TRAVEL) / (Tv.ARRIVE - Tv.TRAVEL)
        lights.forEach((l) => {
          const lpt = Math.max(0, (pt - l.delay) / (1 - l.delay * 0.6))
          const travel = Math.min(1, lpt * 1.15)
          const pos = lpos(l, travel)
          l.trail.push([...pos] as [number, number])
          if (l.trail.length > 42) l.trail.shift()
          l.trail.forEach(([tx, ty], ti) => {
            const a = (ti / l.trail.length) * 0.26
            const sz = 0.5 + (ti / l.trail.length) * 2
            drawGlow(tx, ty, sz, a, false)
          })
          drawGlow(pos[0], pos[1], 3.5, Math.min(1, lpt * 2.5))
        })
      } else if (t >= Tv.ARRIVE && t < Tv.LOGO) {
        lights.forEach(() => drawGlow(CX, CY, 4, 0.52 + Math.random() * 0.28))
        const fA = t < Tv.FLASH
          ? ((t - Tv.ARRIVE) / (Tv.FLASH - Tv.ARRIVE)) * 0.88
          : Math.max(0, 1 - (t - Tv.FLASH) / (Tv.LOGO - Tv.FLASH)) * 0.55
        const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, Math.min(W, H) * 0.46)
        g.addColorStop(0, `rgba(200,169,110,${fA})`)
        g.addColorStop(0.6, `rgba(200,169,110,${fA * 0.2})`)
        g.addColorStop(1, 'rgba(200,169,110,0)')
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
      } else if (t >= Tv.LOGO && t < Tv.FADE) {
        const logoT = (t - Tv.LOGO) / (Tv.HOLD - Tv.LOGO)
        const logoA = Math.min(1, logoT * 1.9)
        const gg = ctx.createRadialGradient(CX, CY, 0, CX, CY, 230)
        gg.addColorStop(0, 'rgba(200,169,110,.08)')
        gg.addColorStop(1, 'rgba(200,169,110,0)')
        ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H)
        const lsize = Math.min(W, H) * 0.16
        ctx.save()
        ctx.globalAlpha = logoA
        if (logoLoaded) ctx.drawImage(logoImg, CX - lsize/2, CY - lsize*0.6, lsize, lsize)
        const fs = Math.max(10, lsize * 0.14)
        ctx.globalAlpha = logoA * 0.58
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.font = `200 ${fs}px "Noto Sans JP",sans-serif`
        ctx.fillStyle = '#c8a96e'
        ctx.fillText('思考・試行・至高・嗜好', CX, CY + lsize * 0.52)
        ctx.restore()
      } else if (t >= Tv.FADE && t < Tv.DONE) {
        canvas.style.opacity = String(1 - (t - Tv.FADE) / (Tv.DONE - Tv.FADE))
      } else if (t >= Tv.DONE) {
        finish(); return
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    function finish() {
      canvas.style.display = 'none'
      skip.style.display   = 'none'
      onFinish()
    }

    function doSkip() {
      cancelAnimationFrame(rafRef.current)
      canvas.style.transition = 'opacity .4s'
      canvas.style.opacity = '0'
      setTimeout(finish, 440)
    }

    function handleResize() { resize(); lights = mkLightsArr() }

    skip.addEventListener('click', doSkip)
    window.addEventListener('resize', handleResize)
    resize()
    stars  = mkStarsArr(160)
    lights = mkLightsArr()

    window._setSpeed = (s) => { speedRef.current = s }

    const skipTimer = setTimeout(() => skip.classList.add('opacity-100', 'pointer-events-auto'), 800)

    document.fonts.ready.then(() => {
      rafRef.current = requestAnimationFrame(draw)
    })

    return () => {
      cancelAnimationFrame(rafRef.current)
      clearTimeout(skipTimer)
      skip.removeEventListener('click', doSkip)
      window.removeEventListener('resize', handleResize)
    }
  }, [onFinish])

  return (
    <>
      <canvas ref={canvasRef} id="opening-canvas" aria-hidden="true" />
      <button
        ref={skipRef}
        className="fixed bottom-[30px] right-9 z-[1001] border-none bg-transparent
          font-serif text-[11.5px] tracking-[0.16em] cursor-pointer
          opacity-0 pointer-events-none transition-[opacity,color] duration-[600ms]
          text-[rgba(200,169,110,0.32)] hover:text-[#c8a96e]"
      >
        skip intro
      </button>
    </>
  )
}
