import type Lenis from 'lenis'

declare global {
  interface Window {
    _lenis:           Lenis | undefined
    _setSpeed:        ((v: number) => void) | undefined
    _setSmokeAlpha:   ((v: number) => void) | undefined
    _setWaveIntensity:((v: number) => void) | undefined
  }
}

export {}
