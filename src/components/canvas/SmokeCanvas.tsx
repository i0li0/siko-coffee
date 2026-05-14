'use client'

import { useEffect, useRef } from 'react'

export default function SmokeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext('2d')!
    let W: number, H: number
    let smokeAlpha = 0.09
    let rafId: number

    function resize() {
      W = canvas.width  = window.innerWidth
      H = canvas.height = window.innerHeight
    }

    class Particle {
      x = 0; y = 0; vx = 0; vy = 0
      size = 0; life = 0; maxLife = 0
      phase = 0; rotSpd = 0; rot = 0; aspect = 0

      constructor() { this.reset() }

      reset() {
        this.x       = W * (0.05 + Math.random() * 0.9)
        this.y       = H * (0.35 + Math.random() * 0.65)
        this.vx      = (Math.random() - 0.5) * 0.35
        this.vy      = -(0.25 + Math.random() * 0.38)
        this.size    = 28 + Math.random() * 55
        this.life    = 0
        this.maxLife = 360 + Math.random() * 280
        this.phase   = Math.random() * Math.PI * 2
        this.rotSpd  = (Math.random() - 0.5) * 0.006
        this.rot     = Math.random() * Math.PI * 2
        this.aspect  = 0.45 + Math.random() * 0.3
      }

      update() {
        this.life++
        this.phase += 0.009
        this.rot   += this.rotSpd
        this.x     += this.vx + Math.sin(this.phase) * 0.45
        this.y     += this.vy
        this.size  += 0.12
        if (this.life >= this.maxLife) this.reset()
      }

      draw() {
        const p = this.life / this.maxLife
        let a: number
        if (p < 0.18)      a = (p / 0.18) * smokeAlpha
        else if (p > 0.72) a = ((1 - p) / 0.28) * smokeAlpha
        else               a = smokeAlpha

        ctx.save()
        ctx.globalAlpha = a
        ctx.translate(this.x, this.y)
        ctx.rotate(this.rot)
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size)
        g.addColorStop(0, 'rgba(215,200,168,.9)')
        g.addColorStop(1, 'rgba(215,200,168,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.ellipse(0, 0, this.size, this.size * this.aspect, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }

    resize()
    const particles = Array.from({ length: 14 }, () => {
      const p = new Particle()
      p.life = Math.random() * p.maxLife
      return p
    })

    function tick() {
      ctx.clearRect(0, 0, W, H)
      particles.forEach((p) => { p.update(); p.draw() })
      rafId = requestAnimationFrame(tick)
    }

    window.addEventListener('resize', resize, { passive: true })
    tick()

    ;window._setSmokeAlpha = (v: number) => { smokeAlpha = v }

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} id="smoke-canvas" aria-hidden="true" />
}
