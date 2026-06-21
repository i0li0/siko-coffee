'use client';

import Link from 'next/link';
import { BEANS, PRICE_PER_100G, AXES, tasteDots } from '@/components/shop/blend/data';
import { RatioBar } from '@/components/shop/blend/atoms';

export default function ProductClient({ beanKey }: { beanKey: string }) {
  const bean = BEANS.find((b) => b.key === beanKey);
  if (!bean) return null;

  const idx = BEANS.indexOf(bean);
  const ratios = [0, 0, 0];
  ratios[idx] = 100;
  const dots = tasteDots(ratios);

  return (
    <div className="ss-root" style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '80px 24px 60px' }}>
        <Link href="/shop" style={{ fontSize: 12, color: 'var(--ss-dim)', textDecoration: 'none', letterSpacing: '0.1em' }}>
          ← ショップに戻る
        </Link>

        <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <span className="ss-eyebrow" style={{ fontSize: 9 }}>Single Origin</span>
            <h1 className="ss-serif" style={{ fontSize: 32, fontWeight: 400, marginTop: 6 }}>{bean.name}</h1>
            <p style={{ fontSize: 13, color: 'var(--ss-dim)', marginTop: 4 }}>{bean.origin} · {bean.process} · {bean.roast}</p>
          </div>

          <RatioBar ratios={ratios} h={8} />

          <p style={{ fontSize: 14, lineHeight: 2, color: 'var(--ss-cream)' }}>{bean.desc}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="ss-eyebrow" style={{ fontSize: 9 }}>味わいチャート</span>
            {AXES.map((ax, i) => (
              <div key={ax.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, width: 32, color: 'var(--ss-dim)' }}>{ax.label}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((d) => (
                    <div key={d} className={`ss-dot${d <= dots[i] ? ' is-on' : ''}`} style={{ width: 10, height: 10 }} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
            <span className="ss-serif" style={{ fontSize: 22, color: 'var(--ss-gold)' }}>
              ¥{(PRICE_PER_100G * 2).toLocaleString()}
            </span>
            <span style={{ fontSize: 11, color: 'var(--ss-dim)' }}>/ 200g</span>
          </div>

          <Link
            href="/shop"
            className="ss-btn"
            style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none', marginTop: 8 }}
          >
            ショップで購入する
          </Link>
        </div>
      </div>
    </div>
  );
}
