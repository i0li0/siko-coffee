'use client';

import { useEffect, useState } from 'react';
import FaultyTerminal from '@/components/reactbits/FaultyTerminal';

/**
 * 公開トップの全画面背景。旧 Stars/Smoke Canvas を置換。
 * - position: fixed / z-index:0 で main(z-1)・section(z-2) の背後に敷く
 * - prefers-reduced-motion 時は pause で静止フレーム
 * - tint はアンバー(--amber)寄りでコーヒーの世界観に寄せる
 */
export default function FaultyTerminalBg() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <div
      id="faulty-bg"
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}
    >
      <FaultyTerminal
        tint="#D4A017"
        brightness={0.5}
        scanlineIntensity={0.28}
        gridMul={[2, 1]}
        digitSize={1.5}
        timeScale={0.2}
        noiseAmp={0.78}
        curvature={0.12}
        chromaticAberration={0}
        flickerAmount={0.7}
        mouseReact={false}
        pageLoadAnimation
        pause={reduced}
      />
      {/* 可読性ビネット — 中央(Heroテキスト帯)を僅かに沈め、四隅をさらに落とす */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse 65% 50% at 50% 42%, rgba(8,6,0,0.42) 0%, rgba(8,6,0,0.1) 50%, transparent 78%),' +
            'radial-gradient(ellipse 120% 120% at 50% 50%, transparent 60%, rgba(5,4,0,0.58) 100%)',
        }}
      />
    </div>
  );
}
