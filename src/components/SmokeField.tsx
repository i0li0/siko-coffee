'use client'

import { useEffect, useRef } from 'react'

const WISPS = [
  { width: 580, height: 240, left: '6%',  bottom: '30%', dur: '21s', tx:  '60px', ty: '-100px', rot:  '12deg', delay: '0s'  },
  { width: 400, height: 160, left: '50%', bottom: '46%', dur: '28s', tx: '-50px', ty: '-125px', rot:  '-8deg', delay: '4s'  },
  { width: 660, height: 190, left: '20%', bottom: '20%', dur: '36s', tx:  '80px', ty:  '-88px', rot:   '7deg', delay: '10s' },
  { width: 300, height: 130, left: '66%', bottom: '56%', dur: '18s', tx: '-58px', ty: '-108px', rot: '-14deg', delay: '2s'  },
  { width: 470, height: 180, left:  '2%', bottom: '62%', dur: '25s', tx:  '42px', ty:  '-78px', rot:  '10deg', delay: '7s'  },
  { width: 340, height: 148, left: '60%', bottom: '16%', dur: '32s', tx: '-30px', ty: '-118px', rot:  '-5deg', delay: '13s' },
]

export default function SmokeField() {
  const fieldRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!window.DeviceOrientationEvent) return
    const field = fieldRef.current!
    const handler = (e: DeviceOrientationEvent) => {
      const x = (e.gamma ?? 0) / 30
      const y = ((e.beta  ?? 0) - 30) / 60
      field.style.transform = `translate(${x * 18}px,${y * 10}px)`
    }
    window.addEventListener('deviceorientation', handler, { passive: true })
    return () => window.removeEventListener('deviceorientation', handler)
  }, [])

  return (
    <>
      <svg style={{ display: 'none' }} aria-hidden="true">
        <defs>
          <filter id="sd" x="-40%" y="-40%" width="180%" height="180%">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.011"
              numOctaves={4} seed={11} result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise"
              scale={70} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <div ref={fieldRef} className="smoke-field" aria-hidden="true">
        {WISPS.map((w, i) => (
          <div
            key={i}
            className="wisp"
            style={{
              width:  w.width,
              height: w.height,
              left:   w.left,
              bottom: w.bottom,
              ['--dur'   as string]: w.dur,
              ['--tx'    as string]: w.tx,
              ['--ty'    as string]: w.ty,
              ['--rot'   as string]: w.rot,
              ['--delay' as string]: w.delay,
            }}
          />
        ))}
      </div>
    </>
  )
}
