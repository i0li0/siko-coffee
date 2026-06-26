'use client';

import { useEffect, useState } from 'react';
import FaultyTerminal from '@/components/reactbits/FaultyTerminal';

/**
 * 端末性能から決める描画品質ティア。見た目は維持しつつ、重い端末ほど
 * 解像度(dpr)・フレームレート(fps)を抑える。
 */
type Tier = 'high' | 'mid' | 'low';
interface Quality {
  tier: Tier;
  dpr: number;
  targetFps: number;
  curvature: number;
}

function detectQuality(): Quality {
  const dprRaw = window.devicePixelRatio || 1;
  const cores = navigator.hardwareConcurrency || 4;
  // deviceMemory は Chromium 系のみ。無ければ中庸値
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const coarse = window.matchMedia('(pointer: coarse)').matches; // モバイル/タッチ
  const saveData =
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

  // GPU 名（内蔵/モバイルGPU・ソフトウェアレンダラを検出）
  let gpu = '';
  try {
    const cv = document.createElement('canvas');
    const gl = (cv.getContext('webgl') || cv.getContext('webgl2')) as WebGLRenderingContext | null;
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl && dbg) gpu = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).toLowerCase();
  } catch {
    /* WebGL 取得失敗時は無視 */
  }
  const weakGpu = /(intel|mali|adreno [45]|powervr|swiftshader|llvmpipe|software)/.test(gpu);

  let score = 0;
  if (cores >= 8) score += 2;
  else if (cores >= 6) score += 1;
  else if (cores <= 3) score -= 1;
  if (mem >= 8) score += 2;
  else if (mem >= 4) score += 1;
  else score -= 1;
  if (coarse) score -= 2;
  if (weakGpu) score -= 2;

  let tier: Tier;
  if (saveData) tier = 'low';
  else if (score >= 4) tier = 'high';
  else if (score >= 1) tier = 'mid';
  else tier = 'low';

  const cap = tier === 'high' ? 1.75 : tier === 'mid' ? 1.4 : 1.1;
  return {
    tier,
    dpr: Math.min(dprRaw, cap),
    targetFps: tier === 'high' ? 60 : 30,
    // 低ティアは樽型歪み(curvature)を切ってフラグメント負荷を軽減（見た目はほぼ同じ）
    curvature: tier === 'low' ? 0 : 0.12,
  };
}

/**
 * 公開トップの全画面背景。旧 Stars/Smoke Canvas を置換。
 * - position: fixed / z-index:0 で main(z-1)・section(z-2) の背後に敷く
 * - prefers-reduced-motion 時は pause で静止フレーム
 * - tint はアンバー(--amber)寄りでコーヒーの世界観に寄せる
 * - 端末性能でdpr/fpsを自動調整 + フレームタイム監視で重い端末は自動降格
 */
export default function FaultyTerminalBg() {
  const [reduced, setReduced] = useState(false);
  // ssr:false で読み込まれるため window は常に利用可。初回レンダ前に品質を確定
  const [quality] = useState<Quality>(detectQuality);

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
      data-tier={quality.tier}
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
        curvature={quality.curvature}
        chromaticAberration={0}
        flickerAmount={0.7}
        mouseReact={false}
        pageLoadAnimation
        pause={reduced}
        dpr={quality.dpr}
        targetFps={quality.targetFps}
        adaptiveQuality
        minDpr={1}
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
