'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BEANS, evenSplit, activeBeans, singleRatios,
} from './data';
import type { Blend, Bean } from './data';
import {
  ScreenTop, ScreenSelect, ScreenSingle, ScreenMaker,
  ScreenQuiz, ScreenDetail, ScreenCart, ScreenMyPage,
} from './screens';
import type { CartItem, SavedBlend, Draft, ScreenName, NavFn } from './screens';

interface Route {
  name: ScreenName;
  param?: string | number[];
}

function ShopHeader({ route, nav, cartCount }: { route: Route; nav: NavFn; cartCount: number }) {
  return (
    <header className="ss-header">
      <div className="ss-header-in">
        <button style={{ display: 'flex', alignItems: 'baseline', gap: 9, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }} onClick={() => nav('top')}>
          <span className="ss-serif" style={{ fontSize: 21, letterSpacing: '0.16em', color: 'var(--ss-cream)' }}>Sikō</span>
          <span className="ss-eyebrow" style={{ fontSize: 9 }}>shop</span>
        </button>
        <nav style={{ display: 'flex', gap: 18, marginLeft: 10 }} className="ss-header-nav">
          <button className={`ss-nav-link${['maker', 'select', 'single'].includes(route.name) ? ' is-on' : ''}`} onClick={() => nav('select')}>つくる</button>
          <button className={`ss-nav-link${route.name === 'quiz' ? ' is-on' : ''}`} onClick={() => nav('quiz')}>好み診断</button>
          <button className={`ss-nav-link${route.name === 'mypage' ? ' is-on' : ''}`} onClick={() => nav('mypage')}>マイページ</button>
        </nav>
        <button onClick={() => nav('cart')} style={{ marginLeft: 'auto', position: 'relative', width: 38, height: 38, borderRadius: 10, border: '1px solid rgba(200,169,110,0.35)', background: 'transparent', cursor: 'pointer', color: 'var(--ss-gold)', fontSize: 15, transition: 'background 0.2s' }}>
          ☕
          {cartCount > 0 && (
            <span style={{ position: 'absolute', top: -7, right: -7, minWidth: 18, height: 18, borderRadius: 9, background: 'var(--ss-gold)', color: '#14100a', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

export default function ShopApp() {
  const [route, setRoute] = useState<Route>({ name: 'top' });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saved, setSaved] = useState<SavedBlend[]>([]);
  const [draft, setDraft] = useState<Draft>({ ratios: [34, 33, 33], base: 'まっさら', selected: [0, 1, 2] });
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, [route]);

  const nav: NavFn = (name, param) => setRoute({ name, param });

  const startMaker = (ratios: number[], base: string, editIndex?: number) => {
    const r = ratios ?? [34, 33, 33];
    const sel = activeBeans(r);
    setDraft({ ratios: r, base: base ?? 'まっさら', selected: sel.length >= 2 ? sel : [0, 1, 2], editIndex });
    nav('maker');
  };

  const onSelectDone = (selected: number[]) => {
    if (selected.length === 1) { nav('single', BEANS[selected[0]].key); return; }
    setDraft({ ratios: evenSplit(selected), base: 'まっさら', selected });
    nav('maker');
  };

  const addSingleToCart = (bean: Bean, grind = '豆のまま') => {
    const idx = BEANS.indexOf(bean);
    setCart((c) => [...c, { name: bean.name, ratios: singleRatios(idx), grind, single: true, origin: bean.origin }]);
    nav('cart');
  };

  const addToCart = (blend: Blend, grind = '豆のまま') => {
    setCart((c) => [...c, { name: blend.name, ratios: blend.ratios, grind }]);
    nav('cart');
  };

  const addCustomToCart = (b: { ratios: number[]; name: string; publish: boolean }) => {
    setCart((c) => [...c, { name: b.name, ratios: b.ratios, grind: '豆のまま', custom: true, publish: b.publish }]);
    nav('cart');
  };

  const onSaveBlend = ({ ratios, name, publish }: { ratios: number[]; name: string; publish: boolean }) => {
    const entry: SavedBlend = { name, ratios, publish, fans: 0 };
    if (draft.editIndex != null) {
      setCart((c) => {
        const next = [...c];
        next[draft.editIndex!] = { ...next[draft.editIndex!], name, ratios, publish };
        return next;
      });
    } else {
      setSaved((s) => [entry, ...s]);
      setCart((c) => [...c, { name, ratios, grind: '豆のまま', custom: true, publish }]);
    }
    nav('cart');
  };

  const checkout = async () => {
    if (checkingOut || cart.length === 0) return;
    setCheckingOut(true);
    try {
      const res = await fetch('/api/checkout/blend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? '決済の準備に失敗しました。もう一度お試しください。');
        setCheckingOut(false);
      }
    } catch {
      alert('通信エラーが発生しました。もう一度お試しください。');
      setCheckingOut(false);
    }
  };

  const routeParam = route.param;

  return (
    <div className="ss-root">
      <div className="ss-stars" />
      <ShopHeader route={route} nav={nav} cartCount={cart.length} />
      <main className="ss-main">
        {route.name === 'top' && (
          <ScreenTop nav={nav} addToCart={addToCart} startMaker={startMaker} addSingleToCart={addSingleToCart} />
        )}
        {route.name === 'select' && (
          <ScreenSelect nav={nav} initial={Array.isArray(routeParam) ? routeParam : undefined} onSelectDone={onSelectDone} />
        )}
        {route.name === 'single' && typeof routeParam === 'string' && (
          <ScreenSingle beanKey={routeParam} nav={nav} addSingleToCart={addSingleToCart} />
        )}
        {route.name === 'maker' && (
          <ScreenMaker key={JSON.stringify(draft)} draft={draft} nav={nav} onSaveBlend={onSaveBlend} />
        )}
        {route.name === 'quiz' && (
          <ScreenQuiz nav={nav} startMaker={startMaker} addCustomToCart={addCustomToCart} />
        )}
        {route.name === 'detail' && typeof routeParam === 'string' && (
          <ScreenDetail id={routeParam} nav={nav} addToCart={addToCart} startMaker={startMaker} />
        )}
        {route.name === 'cart' && (
          <ScreenCart cart={cart} nav={nav} removeAt={(i) => setCart((c) => c.filter((_, j) => j !== i))} startMaker={startMaker} checkout={checkout} checkingOut={checkingOut} />
        )}
        {route.name === 'mypage' && (
          <ScreenMyPage saved={saved} nav={nav} addCustomToCart={addCustomToCart} startMaker={startMaker} />
        )}
      </main>
      <footer style={{ borderTop: '1px solid var(--ss-hair)', padding: '26px 22px', textAlign: 'center', display: 'flex', gap: 18, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="ss-eyebrow" style={{ fontSize: 9 }}>Sikō Coffee — Online Shop</span>
        <Link href="/legal/tokushoho" style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--ss-dim)', textDecoration: 'none', textTransform: 'uppercase' }}>特定商取引法</Link>
        <Link href="/legal/privacy" style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--ss-dim)', textDecoration: 'none', textTransform: 'uppercase' }}>プライバシー</Link>
      </footer>
    </div>
  );
}
