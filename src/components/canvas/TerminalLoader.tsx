'use client';

import { useEffect, useRef, useState } from 'react';
import AsciiRabbit from './AsciiRabbit';

// ── types ──────────────────────────────────────────────────────────
type Line =
  | { t: 'cmd';   text: string }
  | { t: 'out';   text: string; dim?: boolean }
  | { t: 'ok';    text: string }
  | { t: 'err';   text: string }
  | { t: 'amber'; text: string }
  | { t: 'div' };

interface Props { onFinish: () => void; replay?: boolean }

interface ConnectionInfo {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

// ── helpers ────────────────────────────────────────────────────────
function pad(n: number, w = 2) { return String(n).padStart(w, '0'); }
function nowStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} `
       + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function connection(): ConnectionInfo | undefined {
  return (navigator as Navigator & { connection?: ConnectionInfo }).connection;
}

// ── 実データ収集 — フェイクなし、すべて実機 / 実通信の情報 ──────────
function collectEnv(): Record<string, string> {
  const nav  = navigator;
  const conn = connection();
  const tz   = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dpr  = window.devicePixelRatio;
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    'resolution ': `${window.screen.width}×${window.screen.height}  @${dpr}x`,
    'viewport   ': `${window.innerWidth}×${window.innerHeight}px`,
    'timezone   ': tz,
    'locale     ': nav.language,
    'color-scheme': dark ? 'dark' : 'light',
    'connection ': conn
      ? `${conn.effectiveType ?? '—'}${conn.downlink != null ? '  ' + conn.downlink + ' Mbps' : ''}`
      : 'unknown',
  };
}

function gpuRenderer(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return 'unavailable';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      const r = gl.getParameter((dbg as { UNMASKED_RENDERER_WEBGL: number }).UNMASKED_RENDERER_WEBGL);
      return String(r);
    }
    return String(gl.getParameter(gl.RENDERER));
  } catch {
    return 'unavailable';
  }
}

function collectHardware(): Record<string, string> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    'cpu-threads': `${nav.hardwareConcurrency ?? '—'} logical`,
    'device-mem ': nav.deviceMemory ? `≈ ${nav.deviceMemory} GB` : 'undisclosed',
    'gpu        ': gpuRenderer(),
    'color-depth': `${window.screen.colorDepth}-bit`,
    'touch-pts  ': `${nav.maxTouchPoints} max`,
  };
}

function collectNetwork(): Record<string, string> {
  const conn = connection();
  return {
    'status     ': navigator.onLine ? 'online' : 'offline',
    'protocol   ': location.protocol.replace(':', ''),
    'host       ': location.host,
    'eff-type   ': conn?.effectiveType ?? 'unknown',
    'downlink   ': conn?.downlink != null ? `${conn.downlink} Mbps` : '—',
    'rtt        ': conn?.rtt != null ? `${conn.rtt} ms` : '—',
  };
}

function collectPerf(): Record<string, string> | null {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (!nav) return null;
  const span = (a: number, b: number) => `${Math.max(0, Math.round(b - a))} ms`;
  return {
    'dns-lookup ': span(nav.domainLookupStart, nav.domainLookupEnd),
    'tcp-connect': span(nav.connectStart, nav.connectEnd),
    'ttfb       ': span(nav.requestStart, nav.responseStart),
    'dom-ready  ': `${Math.round(nav.domContentLoadedEventEnd)} ms`,
    'transfer   ': nav.transferSize ? `${(nav.transferSize / 1024).toFixed(1)} KB` : 'cached',
  };
}

function featureChecks(): [string, boolean][] {
  const test = (fn: () => boolean) => { try { return fn(); } catch { return false; } };
  return [
    ['cookies enabled',  navigator.cookieEnabled],
    ['local-storage',    test(() => { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; })],
    ['service-worker',   'serviceWorker' in navigator],
    ['webgl2 context',   test(() => !!document.createElement('canvas').getContext('webgl2'))],
    ['web-assembly',     typeof WebAssembly === 'object'],
    ['intl / icu',       typeof Intl === 'object'],
    ['clipboard api',    !!navigator.clipboard],
  ];
}

function brewParams() {
  const d = new Date();
  const h = d.getHours(), min = d.getMinutes();
  const dec = h + min / 60;
  const temp  = Math.round(88 + 7 * Math.cos((dec - 8) * Math.PI / 12));
  const grind = ['very fine (espresso)', 'fine (pour-over)', 'medium (v60)', 'coarse (cold brew)'][Math.min(3, Math.floor(dec / 6))];
  const ratio = dec < 10 ? '1:14' : dec > 20 ? '1:16' : '1:15';
  const bloom = temp > 92 ? '45s' : '30s';
  const period = h < 6 ? 'late-night' : h < 11 ? 'morning' : h < 17 ? 'daytime' : h < 22 ? 'evening' : 'late-night';

  return {
    brewLines: [
      `period      : ${period}`,
      `water-temp  : ${temp}°C`,
      `grind       : ${grind}`,
      `brew-ratio  : ${ratio}  (coffee:water)`,
      `bloom       : ${bloom}`,
    ],
    rec: h >= 22 || h < 6
      ? 'Decaf Blend — カフェインなしで、深夜の一杯を。'
      : h < 11
      ? 'Hot Coffee — 朝の静けさに。'
      : h < 17
      ? 'Iced Coffee — 午後の光の中で。'
      : 'Oat Latte — 夕暮れに、やさしく。',
  };
}

// ── progress bar ───────────────────────────────────────────────────
function ProgressBar({ value, cols }: { value: number; cols: number }) {
  const filled = Math.round((value / 100) * cols);
  const pct    = String(value).padStart(3);
  return (
    <div
      className="flex flex-col items-center gap-3 select-none w-full"
      role="progressbar"
      aria-label="サイトの読み込み"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <div className="relative flex items-center gap-2 sm:gap-4 max-w-full" aria-hidden="true">
        <span
          className="font-mono text-[clamp(13px,1.5vw,17px)] tracking-[0.05em] leading-none"
          style={{ color: 'var(--amber)' }}
        >
          {'█'.repeat(filled)}
          <span style={{ color: 'var(--amber3)' }}>{'░'.repeat(cols - filled)}</span>
        </span>
        <span
          className="font-mono text-[clamp(12px,1.3vw,15px)] tabular-nums w-[2.8em] text-right shrink-0"
          style={{ color: value === 100 ? 'var(--amber)' : 'var(--amber2)' }}
        >
          {pct}%
        </span>
        {value > 0 && (
          <span
            aria-hidden
            className="absolute left-0 bottom-[-6px] h-[6px] rounded-full pointer-events-none blur-[6px]"
            style={{
              width: `${(filled / cols) * 100}%`,
              background: 'var(--amber)',
              opacity: 0.35,
              transition: 'width 0.4s ease',
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── line renderer ──────────────────────────────────────────────────
function TermLine({ line, cursor }: { line: Line; cursor?: boolean }) {
  const base = 'font-mono whitespace-pre-wrap break-all text-[clamp(11px,1.2vw,13px)] leading-[1.85]';
  const cur  = cursor ? (
    <span
      className="inline-block w-[0.5em] h-[1.1em] ml-[2px] align-text-bottom"
      style={{ background: 'var(--amber)', animation: 'blink 1.1s step-end infinite' }}
    />
  ) : null;

  if (line.t === 'div') return (
    <div className="my-[4px]" style={{ borderBottom: '1px solid rgba(212,160,23,0.28)' }} />
  );
  if (line.t === 'cmd') return (
    <div className={base}>
      <span style={{ color: 'var(--amber)' }}>$ </span>
      <span style={{ color: 'var(--cream)' }}>{line.text}</span>
      {cur}
    </div>
  );
  if (line.t === 'ok') return (
    <div className={base}>
      <span style={{ color: '#6abf6a' }}>✓ </span>
      <span style={{ color: 'rgba(232,224,208,0.78)' }}>{line.text}</span>
      {cur}
    </div>
  );
  if (line.t === 'err') return (
    <div className={base}>
      <span style={{ color: '#bf6a6a' }}>✗ </span>
      <span style={{ color: 'rgba(232,224,208,0.68)' }}>{line.text}</span>
      {cur}
    </div>
  );
  if (line.t === 'amber') return (
    <div className={`${base} font-medium`} style={{ color: 'var(--amber)' }}>
      {line.text}{cur}
    </div>
  );
  return (
    <div className={base}
      style={{ color: line.dim ? 'rgba(212,160,23,0.5)' : 'rgba(232,224,208,0.65)' }}>
      {'  '}{line.text}{cur}
    </div>
  );
}

// ── main ───────────────────────────────────────────────────────────
export default function TerminalLoader({ onFinish, replay = false }: Props) {
  const [progress, setP] = useState(0);
  const [lines,    setL] = useState<Line[]>([]);
  const [exiting,  setE] = useState(false);
  const [visible,  setV] = useState(true);
  // モバイルではプログレスバーのブロック数を絞り、枠内に収める（ssr:false なので window 参照可）
  const [cols] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 480 ? 22 : 36));
  const logRef           = useRef<HTMLDivElement>(null);
  const genRef           = useRef(0);
  const dismissedRef     = useRef(false);

  const push = (...next: Line[]) => setL(prev => [...prev, ...next]);
  const ms   = (n: number) => new Promise<void>(r => setTimeout(r, n));

  // ユーザー操作（skip / Escape）による即時離脱。多重発火を防ぐ。
  const dismiss = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setE(true);
    setTimeout(() => { setV(false); onFinish(); }, 950);
  };

  const finish = (myGen: number) => {
    if (genRef.current !== myGen || dismissedRef.current) return;
    if (replay) return;
    dismissedRef.current = true;
    setE(true);
    setTimeout(() => {
      if (genRef.current !== myGen) return;
      setV(false);
      onFinish();
    }, 950);
  };

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // Escape でローダーを離脱（escape-routes / modal-escape）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // prefers-reduced-motion: ローダーをスキップして即コンテンツを表示
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onFinish();
      return;
    }

    const myGen = ++genRef.current;
    const alive = () => genRef.current === myGen;

    // hard cap — content が長くなったぶん上限を引き上げ（リプレイ時は自動遷移しない）
    const cap = replay ? undefined : setTimeout(() => finish(myGen), 5200);

    async function dump(cmd: string, data: Record<string, string> | null, okMsg: string, p: number) {
      push({ t: 'cmd', text: cmd });
      await ms(110);
      if (!alive()) return;
      if (!data) { push({ t: 'err', text: 'no data available.' }); setP(p); return; }
      for (const [k, v] of Object.entries(data)) {
        if (!alive()) return;
        push({ t: 'out', text: `${k}: ${v}`, dim: true });
        await ms(26);
      }
      push({ t: 'ok', text: okMsg });
      setP(p);
    }

    async function run() {
      // この世代の出力をクリーンに始める（StrictMode の二重実行・再起動対策）
      setL([]);

      // ── 1. boot ─────────────────────────────────────────────
      push({ t: 'div' });
      push({ t: 'amber', text: 'SIKŌ COFFEE  //  SYSTEM BOOT' });
      push({ t: 'out',   text: `timestamp  : ${nowStr()}`, dim: true });
      push({ t: 'out',   text: 'os         : sikocoffee-os v1.0.0', dim: true });
      push({ t: 'out',   text: `platform   : ${navigator.platform}`, dim: true });
      push({ t: 'div' });
      setP(8);
      await ms(260);
      if (!alive()) return;

      // ── 2. env scan ──────────────────────────────────────────
      await dump('scan --env client', collectEnv(), 'environment loaded.', 22);
      await ms(140);
      if (!alive()) return;

      // ── 3. hardware inspect ──────────────────────────────────
      await dump('inspect --hardware', collectHardware(), 'device profiled.', 40);
      await ms(140);
      if (!alive()) return;

      // ── 4. network probe ─────────────────────────────────────
      await dump('net --probe', collectNetwork(), 'link established.', 55);
      await ms(140);
      if (!alive()) return;

      // ── 5. navigation timing ─────────────────────────────────
      await dump('perf --navigation', collectPerf(), 'metrics captured.', 70);
      await ms(140);
      if (!alive()) return;

      // ── 6. feature checks ────────────────────────────────────
      push({ t: 'cmd', text: 'features --check' });
      await ms(110);
      let okCount = 0;
      for (const [name, ok] of featureChecks()) {
        if (!alive()) return;
        if (ok) okCount++;
        push(ok ? { t: 'ok', text: name } : { t: 'err', text: `${name} (unsupported)` });
        await ms(26);
      }
      push({ t: 'amber', text: `${okCount}/7 capabilities online.` });
      setP(85);
      await ms(150);
      if (!alive()) return;

      // ── 7. brew analysis ─────────────────────────────────────
      push({ t: 'cmd', text: 'brew --analyze --context now' });
      await ms(130);
      const { brewLines, rec } = brewParams();
      push({ t: 'div' });
      for (const bl of brewLines) {
        if (!alive()) return;
        push({ t: 'out', text: bl, dim: true });
        await ms(40);
      }
      push({ t: 'div' });
      await ms(110);
      push({ t: 'amber', text: `→  ${rec}` });
      setP(95);
      await ms(240);
      if (!alive()) return;

      // ── 8. ready ─────────────────────────────────────────────
      push({ t: 'div' });
      push({ t: 'amber', text: 'READY.' });
      push({ t: 'div' });
      setP(100);
      await ms(650);

      clearTimeout(cap);
      finish(myGen);
    }

    run();

    return () => { if (cap) clearTimeout(cap); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  const lastLine = lines[lines.length - 1];

  return (
    <div
      role="dialog"
      aria-label="サイトを読み込み中"
      aria-busy={!exiting}
      className="fixed inset-0 z-[1000] flex flex-col"
      style={{
        background: 'var(--bg)',
        opacity:    exiting ? 0 : 1,
        transition: exiting ? 'opacity 0.95s ease' : 'none',
      }}
    >
      <div className="flex-1 flex flex-col items-center justify-center px-5 sm:px-6 min-h-0">
        <div className="text-center mb-5 sm:mb-6 w-full max-w-[580px]">
          <p
            className="font-mono font-medium tracking-[0.32em] mb-1.5
              text-[clamp(12px,1.3vw,15px)] select-none"
            style={{ color: 'var(--amber)' }}
          >
            SIKŌ COFFEE
          </p>
          <p
            className="font-serif font-light tracking-[0.14em]
              text-[clamp(10px,1vw,12px)] select-none"
            style={{ color: 'rgba(212,160,23,0.55)' }}
          >
            ◂ SYSTEM TERMINAL ▸
          </p>
        </div>

        {/* 公式マスコット「シコうさ」— ロゴとターミナルの間に配置（ASCII アート版） */}
        <AsciiRabbit className="mb-6 sm:mb-8" />

        <div className="w-full max-w-[580px] mb-7 sm:mb-10">
          <ProgressBar value={progress} cols={cols} />
        </div>

        {/* 擬似ターミナルのログは装飾。SR には進捗(progressbar)で伝えるためここは読み上げ対象外 */}
        <div
          aria-hidden="true"
          className="w-full max-w-[580px]"
          style={{
            height: 'min(38vh, 320px)',
            maskImage:       'linear-gradient(to bottom, transparent 0%, black 14%, black 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 14%, black 100%)',
            overflow: 'hidden',
          }}
        >
          <div
            ref={logRef}
            className="h-full overflow-y-auto"
            style={{ scrollbarWidth: 'none' }}
          >
            {lines.map((line, i) => (
              <TermLine
                key={i}
                line={line}
                cursor={i === lines.length - 1 && line === lastLine && progress < 100}
              />
            ))}
            <div className="h-6" />
          </div>
        </div>
      </div>

      <div className="flex justify-end px-6 sm:px-10 pb-6 sm:pb-7">
        <button
          type="button"
          onClick={dismiss}
          aria-label={replay ? 'ターミナルを閉じる' : '読み込みをスキップしてサイトを表示'}
          className="loader-skip font-mono text-[11px] tracking-[0.2em]
            bg-transparent cursor-pointer select-none px-3 py-1.5 rounded"
        >
          {replay ? 'close →' : 'skip →'}
        </button>
      </div>
    </div>
  );
}
