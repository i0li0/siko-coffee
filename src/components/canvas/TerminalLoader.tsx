'use client';

import { useEffect, useRef, useState } from 'react';

// ── types ──────────────────────────────────────────────────────────
type Line =
  | { t: 'cmd';   text: string }
  | { t: 'out';   text: string; dim?: boolean }
  | { t: 'ok';    text: string }
  | { t: 'err';   text: string }
  | { t: 'amber'; text: string }
  | { t: 'div' };

interface Props { onFinish: () => void }

// ── helpers ────────────────────────────────────────────────────────
function pad(n: number, w = 2) { return String(n).padStart(w, '0'); }
function nowStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} `
       + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function collectEnv(): Record<string, string> {
  const nav  = navigator;
  const conn = (nav as { connection?: { effectiveType?: string; downlink?: number } }).connection;
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
const COLS = 36;
function ProgressBar({ value }: { value: number }) {
  const filled = Math.round((value / 100) * COLS);
  const pct    = String(value).padStart(3);
  return (
    <div className="flex flex-col items-center gap-3 select-none w-full">
      <div className="relative flex items-center gap-4">
        <span
          className="font-mono text-[clamp(12px,1.3vw,15px)] tracking-[0.05em] leading-none"
          style={{ color: 'var(--amber)' }}
        >
          {'█'.repeat(filled)}
          <span style={{ color: 'var(--amber3)' }}>{'░'.repeat(COLS - filled)}</span>
        </span>
        <span
          className="font-mono text-[clamp(11px,1.1vw,13px)] tabular-nums w-[2.8em] text-right"
          style={{ color: value === 100 ? 'var(--amber)' : 'var(--amber2)' }}
        >
          {pct}%
        </span>
        {value > 0 && (
          <span
            aria-hidden
            className="absolute left-0 bottom-[-6px] h-[6px] rounded-full pointer-events-none blur-[6px]"
            style={{
              width: `${(filled / COLS) * 100}%`,
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
  const base = 'font-mono whitespace-pre-wrap break-all text-[clamp(9px,1vw,11.5px)] leading-[1.85]';
  const cur  = cursor ? (
    <span
      className="inline-block w-[0.5em] h-[1.1em] ml-[2px] align-text-bottom"
      style={{ background: 'var(--amber)', animation: 'blink 1.1s step-end infinite' }}
    />
  ) : null;

  if (line.t === 'div') return (
    <div className="my-[4px]" style={{ borderBottom: '1px solid rgba(212,160,23,0.18)' }} />
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
      <span style={{ color: '#4f9a4f' }}>✓ </span>
      <span style={{ color: 'rgba(232,224,208,0.62)' }}>{line.text}</span>
      {cur}
    </div>
  );
  if (line.t === 'err') return (
    <div className={base}>
      <span style={{ color: '#9a4f4f' }}>✗ </span>
      <span style={{ color: 'rgba(232,224,208,0.52)' }}>{line.text}</span>
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
      style={{ color: line.dim ? 'rgba(212,160,23,0.3)' : 'rgba(232,224,208,0.44)' }}>
      {'  '}{line.text}{cur}
    </div>
  );
}

// ── main ───────────────────────────────────────────────────────────
export default function TerminalLoader({ onFinish }: Props) {
  const [progress, setP] = useState(0);
  const [lines,    setL] = useState<Line[]>([]);
  const [exiting,  setE] = useState(false);
  const [visible,  setV] = useState(true);
  const logRef           = useRef<HTMLDivElement>(null);
  const genRef           = useRef(0);

  const push = (...next: Line[]) => setL(prev => [...prev, ...next]);
  const ms   = (n: number) => new Promise<void>(r => setTimeout(r, n));

  const finish = (myGen: number) => {
    if (genRef.current !== myGen) return;
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

  useEffect(() => {
    // prefers-reduced-motion: ローダーをスキップして即コンテンツを表示
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onFinish();
      return;
    }

    const myGen = ++genRef.current;
    const alive = () => genRef.current === myGen;

    // 3-second hard cap
    const cap = setTimeout(() => finish(myGen), 3000);

    async function run() {
      // ── 1. boot ─────────────────────────────────────────────
      push({ t: 'div' });
      push({ t: 'amber', text: 'SIKŌ COFFEE  //  SYSTEM BOOT' });
      push({ t: 'out',   text: `timestamp  : ${nowStr()}`, dim: true });
      push({ t: 'out',   text: 'os         : sikocoffee-os v1.0.0', dim: true });
      push({ t: 'div' });
      setP(8);
      await ms(280);

      if (!alive()) return;

      // ── 2. env scan ──────────────────────────────────────────
      push({ t: 'cmd', text: 'scan --env client' });
      await ms(120);
      const env = collectEnv();
      for (const [k, v] of Object.entries(env)) {
        if (!alive()) return;
        push({ t: 'out', text: `${k}: ${v}`, dim: true });
        await ms(38);
      }
      push({ t: 'ok', text: 'environment loaded.' });
      setP(32);
      await ms(160);

      if (!alive()) return;

      // ── 3. brew analysis ─────────────────────────────────────
      push({ t: 'cmd', text: 'brew --analyze --context now' });
      setP(58);
      await ms(140);
      const { brewLines, rec } = brewParams();
      push({ t: 'div' });
      for (const bl of brewLines) {
        if (!alive()) return;
        push({ t: 'out', text: bl, dim: true });
        await ms(48);
      }
      push({ t: 'div' });
      await ms(120);
      push({ t: 'amber', text: `→  ${rec}` });
      setP(90);
      await ms(260);

      // ── 4. ready ─────────────────────────────────────────────
      if (!alive()) return;
      push({ t: 'div' });
      push({ t: 'amber', text: 'READY.' });
      push({ t: 'div' });
      setP(100);
      await ms(700);

      clearTimeout(cap);
      finish(myGen);
    }

    run();

    return () => clearTimeout(cap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  const lastLine = lines[lines.length - 1];

  return (
    <div
      className="fixed inset-0 z-[1000] flex flex-col"
      style={{
        background: 'var(--bg)',
        opacity:    exiting ? 0 : 1,
        transition: exiting ? 'opacity 0.95s ease' : 'none',
      }}
    >
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="text-center mb-10 w-full max-w-[580px]">
          <p
            className="font-mono font-medium tracking-[0.32em] mb-1
              text-[clamp(10px,1.05vw,12px)] select-none"
            style={{ color: 'var(--amber3)' }}
          >
            SIKŌ COFFEE
          </p>
          <p
            className="font-serif font-light tracking-[0.14em]
              text-[clamp(9px,0.9vw,11px)] select-none"
            style={{ color: 'rgba(212,160,23,0.35)' }}
          >
            ◂ SYSTEM TERMINAL ▸
          </p>
        </div>

        <div className="w-full max-w-[580px] mb-10">
          <ProgressBar value={progress} />
        </div>

        <div
          className="w-full max-w-[580px]"
          style={{
            height: '38vh',
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

      <div className="flex justify-end px-10 pb-7">
        <button
          onClick={() => {
            setE(true);
            setTimeout(() => { setV(false); onFinish(); }, 950);
          }}
          className="font-mono text-[11px] tracking-[0.2em]
            bg-transparent cursor-pointer select-none
            transition-all duration-300 px-3 py-1.5 rounded"
          style={{
            color:  'rgba(212,160,23,0.65)',
            border: '1px solid rgba(212,160,23,0.25)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color  = 'rgba(212,160,23,1)';
            e.currentTarget.style.border = '1px solid rgba(212,160,23,0.7)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color  = 'rgba(212,160,23,0.65)';
            e.currentTarget.style.border = '1px solid rgba(212,160,23,0.25)';
          }}
        >
          skip →
        </button>
      </div>
    </div>
  );
}
