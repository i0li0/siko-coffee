'use client'

import { useEffect, useState } from 'react'

export default function TweaksPanel() {
  if (process.env.NODE_ENV === 'production') return null

  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === '__activate_edit_mode')   setOpen(true)
      if (e.data?.type === '__deactivate_edit_mode') setOpen(false)
    }
    window.addEventListener('message', handler)
    window.parent.postMessage({ type: '__edit_mode_available' }, '*')
    return () => window.removeEventListener('message', handler)
  }, [])

  function close() {
    setOpen(false)
    window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*')
  }

  const speeds: Record<string, number> = { fast: 2.2, normal: 1, slow: 0.55 }
  const accents: Record<string, string> = { gold: '#c8a96e', silver: '#a0a09a', rose: '#c87878' }

  if (!open) return null

  return (
    <div className="fixed bottom-20 right-[22px] z-[500] w-[218px]
      bg-[rgba(10,10,22,0.96)] border border-[rgba(200,169,110,0.18)]
      rounded-lg p-[18px] backdrop-blur-[14px]
      font-sans text-[12px] text-[rgba(240,235,224,0.45)]">
      <div className="flex justify-between items-center font-serif text-[12.5px]
        tracking-[0.15em] text-[#c8a96e] mb-[14px]">
        <span>Tweaks</span>
        <button onClick={close} className="bg-transparent border-none cursor-pointer text-[16px]
          leading-none text-[rgba(240,235,224,0.45)]">×</button>
      </div>

      <div className="mb-[13px]">
        <span className="block text-[10px] text-[rgba(200,169,110,0.5)] tracking-[0.1em]
          uppercase mb-[7px]">Opening speed</span>
        <div className="flex gap-1">
          {Object.entries(speeds).map(([k, v]) => (
            <button key={k}
              onClick={() => window._setSpeed?.(v)}
              className="flex-1 bg-[rgba(240,235,224,0.04)] border border-[rgba(240,235,224,0.09)]
                text-[rgba(240,235,224,0.35)] rounded px-[3px] py-[5px]
                font-sans text-[9.5px] cursor-pointer tracking-[0.05em]
                transition-all duration-200">
              {k.charAt(0).toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-[13px]">
        <span className="block text-[10px] text-[rgba(200,169,110,0.5)] tracking-[0.1em]
          uppercase mb-[7px]">Accent color</span>
        <div className="flex gap-1">
          {Object.entries(accents).map(([k, v]) => (
            <button key={k}
              onClick={() => document.documentElement.style.setProperty('--gold', v)}
              className="flex-1 bg-[rgba(240,235,224,0.04)] border border-[rgba(240,235,224,0.09)]
                text-[rgba(240,235,224,0.35)] rounded px-[3px] py-[5px]
                font-sans text-[9.5px] cursor-pointer tracking-[0.05em]
                transition-all duration-200">
              {k.charAt(0).toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-[13px]">
        <span className="block text-[10px] text-[rgba(200,169,110,0.5)] tracking-[0.1em]
          uppercase mb-[7px]">Smoke density</span>
        <input type="range" min="0.02" max="0.18" step="0.01" defaultValue="0.09"
          onChange={(e) => window._setSmokeAlpha?.(parseFloat(e.target.value))}
          className="w-full h-[2px] appearance-none bg-[rgba(200,169,110,0.18)] rounded cursor-pointer" />
      </div>

      <div>
        <span className="block text-[10px] text-[rgba(200,169,110,0.5)] tracking-[0.1em]
          uppercase mb-[7px]">Wave intensity</span>
        <input type="range" min="0" max="1" step="0.05" defaultValue="0.35"
          onChange={(e) => window._setWaveIntensity?.(parseFloat(e.target.value))}
          className="w-full h-[2px] appearance-none bg-[rgba(200,169,110,0.18)] rounded cursor-pointer" />
      </div>
    </div>
  )
}
