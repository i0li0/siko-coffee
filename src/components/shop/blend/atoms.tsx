'use client';

import type { CSSProperties } from 'react';
import { BEANS, AXES, tasteDots, calcPrice } from './data';
import type { Bean, Blend } from './data';

export function RatioBar({ ratios, h = 8, style }: { ratios: number[]; h?: number; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', height: h, borderRadius: h / 2, overflow: 'hidden', width: '100%', ...style }}>
      {ratios.map((r, i) => (
        <div key={i} style={{ width: `${r}%`, background: BEANS[i].color, transition: 'width 0.3s ease' }} />
      ))}
    </div>
  );
}

export function TasteDots({ ratios, dots, words = false, size = 9, gap = 6 }: {
  ratios: number[]; dots?: number[]; words?: boolean; size?: number; gap?: number;
}) {
  const vals = dots ?? tasteDots(ratios);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {AXES.map((ax, i) => (
        <div key={ax.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, width: 28, color: 'var(--ss-dim)', letterSpacing: '0.08em' }}>{ax.label}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map((d) => (
              <div key={d} className={`ss-dot${d <= vals[i] ? ' is-on' : ''}`} style={{ width: size, height: size }} />
            ))}
          </div>
          {words && <span style={{ fontSize: 10, color: 'rgba(240,235,224,0.3)' }}>{ax.word}</span>}
        </div>
      ))}
    </div>
  );
}

export function BeanLegend({ ratios, size = 10 }: { ratios: number[]; size?: number }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      {BEANS.map((b, i) => ratios[i] > 0 ? (
        <span key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ss-dim)' }}>
          <span style={{ width: size, height: size, borderRadius: '50%', background: b.color, flexShrink: 0 }} />
          {b.name} <b style={{ color: 'var(--ss-cream)', fontWeight: 500 }}>{ratios[i]}%</b>
        </span>
      ) : null)}
    </div>
  );
}

export function Bag({ name, ratios, w = 92, hand = true }: { name?: string | null; ratios: number[]; w?: number; hand?: boolean }) {
  return (
    <div style={{
      width: w, height: w * 1.32, position: 'relative', flexShrink: 0,
      background: 'linear-gradient(160deg, #1c1a28, #110f1c)', borderRadius: '8px 8px 12px 12px',
      border: '1px solid rgba(240,235,224,0.13)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8,
    }}>
      <div style={{ position: 'absolute', top: 7, left: '12%', right: '12%', height: 1.5, background: 'rgba(240,235,224,0.18)', borderRadius: 1 }} />
      <span className="ss-serif" style={{ fontSize: w * 0.1, letterSpacing: '0.25em', color: 'rgba(200,169,110,0.7)' }}>SIKŌ</span>
      <span className={hand ? 'ss-hand' : 'ss-serif'} style={{ fontSize: w * 0.15, textAlign: 'center', lineHeight: 1.25, color: hand ? 'var(--ss-hand)' : 'var(--ss-cream)' }}>
        {name || '(なまえ)'}
      </span>
      <RatioBar ratios={ratios} h={4} style={{ width: '64%' }} />
    </div>
  );
}

export function BlendCardH({ blend, onBuy, onOpen }: { blend: Blend; onBuy: () => void; onOpen: () => void }) {
  const rot = (blend.id.charCodeAt(blend.id.length - 1) % 2 === 0 ? 1 : -1) * 0.8;
  return (
    <div className="ss-card ss-card--hover" onClick={onOpen} role="button" tabIndex={0} aria-label={`${blend.name} — ¥${calcPrice(200).toLocaleString()}`} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      style={{ '--hover-rot': `${rot}deg`, padding: 16, display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0 } as CSSProperties}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Bag name={blend.name} ratios={blend.ratios} w={62} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="ss-serif" style={{ fontSize: 19, lineHeight: 1.2 }}>{blend.name}</span>
          {blend.by
            ? <span className="ss-hand" style={{ fontSize: 12.5 }}>by {blend.by} さん</span>
            : <span className="ss-eyebrow" style={{ fontSize: 9 }}>{blend.en}</span>}
          <span style={{ fontSize: 10.5, color: 'rgba(200,169,110,0.6)', letterSpacing: '0.05em' }}>♡ {blend.bought}人が購入</span>
        </div>
      </div>
      <RatioBar ratios={blend.ratios} h={6} />
      <TasteDots ratios={blend.ratios} size={7} gap={4} />
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 2 }}>
        <span className="ss-serif ss-price" style={{ fontSize: 14, color: 'rgba(200,169,110,0.8)' }}>¥ {calcPrice(200).toLocaleString()}</span>
        <button className="ss-btn ss-btn--sm" style={{ marginLeft: 'auto' }} onClick={(e) => { e.stopPropagation(); onBuy(); }}>カートへ</button>
      </div>
    </div>
  );
}

export function SingleCard({ bean, onBuy, onOpen }: { bean: Bean; onBuy: () => void; onOpen: () => void }) {
  const idx = BEANS.indexOf(bean);
  const ratios = [0, 0, 0];
  ratios[idx] = 100;
  const rot = bean.key.charCodeAt(0) % 2 === 0 ? 0.8 : -0.8;
  return (
    <div className="ss-card ss-card--hover" onClick={onOpen} role="button" tabIndex={0} aria-label={`${bean.name} シングルオリジン — ¥${calcPrice(200).toLocaleString()}`} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      style={{ '--hover-rot': `${rot}deg`, padding: 16, display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0 } as CSSProperties}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Bag name={bean.name} ratios={ratios} w={62} hand={false} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="ss-eyebrow" style={{ fontSize: 9 }}>Single Origin</span>
          <span className="ss-serif" style={{ fontSize: 19, lineHeight: 1.2 }}>{bean.name}</span>
          <span style={{ fontSize: 10.5, color: 'var(--ss-dim)' }}>{bean.origin}</span>
          <span style={{ fontSize: 10.5, color: 'rgba(200,169,110,0.6)', letterSpacing: '0.05em' }}>{bean.roast} · {bean.process}</span>
        </div>
      </div>
      <RatioBar ratios={ratios} h={6} />
      <TasteDots ratios={ratios} size={7} gap={4} />
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 2 }}>
        <span className="ss-serif ss-price" style={{ fontSize: 14, color: 'rgba(200,169,110,0.8)' }}>¥ {calcPrice(200).toLocaleString()}</span>
        <button className="ss-btn ss-btn--sm" style={{ marginLeft: 'auto' }} onClick={(e) => { e.stopPropagation(); onBuy(); }}>カートへ</button>
      </div>
    </div>
  );
}

export function SectionHead({ eyebrow, title, hand, right, onRight }: {
  eyebrow: string; title: string; hand?: string; right?: string; onRight?: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, margin: '46px 0 18px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span className="ss-eyebrow">{eyebrow}</span>
        <span className="ss-serif" style={{ fontSize: 26, lineHeight: 1.1 }}>{title}</span>
      </div>
      {hand && <span className="ss-sticker" style={{ marginBottom: 4 }}>{hand}</span>}
      {right && (
        <button className="ss-nav-link" onClick={onRight}
          style={{ marginLeft: 'auto', fontSize: 11.5, letterSpacing: '0.08em', borderBottom: '1px solid var(--ss-hair)', paddingBottom: 2 }}>
          {right} →
        </button>
      )}
    </div>
  );
}
