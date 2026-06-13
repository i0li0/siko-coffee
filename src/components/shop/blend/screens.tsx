'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import {
  BEANS, PRESETS, COMMUNITY, PRICE, MAX_BEANS,
  singleRatios, evenSplit, activeBeans,
  tasteWord, normalizeRatios, normalizeSubset,
  findBlend,
} from './data';
import type { Bean, Blend } from './data';
import { Bag, RatioBar, TasteDots, BeanLegend, BlendCardH, SingleCard, SectionHead } from './atoms';

// ─── types ───────────────────────────────────────────────

export interface CartItem {
  name: string;
  ratios: number[];
  grind: string;
  custom?: boolean;
  single?: boolean;
  publish?: boolean;
  origin?: string;
}

export interface SavedBlend {
  name: string;
  ratios: number[];
  publish: boolean;
  fans?: number;
}

export interface Draft {
  ratios: number[];
  base: string;
  selected: number[];
  editIndex?: number;
}

export type ScreenName = 'top' | 'select' | 'single' | 'maker' | 'quiz' | 'detail' | 'cart' | 'done' | 'mypage';

export interface NavFn {
  (name: ScreenName, param?: string | number[]): void;
}

// ─── ScreenTop ───────────────────────────────────────────

function MiniMaker({ goMaker }: { goMaker: (ratios: number[], base: string) => void }) {
  const [ratios, setRatios] = useState([45, 30, 25]);
  return (
    <div className="ss-card" style={{ padding: '22px 22px 24px', display: 'flex', flexDirection: 'column', gap: 14, border: '1px solid rgba(200,169,110,0.3)', background: 'rgba(200,169,110,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="ss-sticker">さわってためせる</span>
        <span style={{ fontSize: 11, color: 'var(--ss-dim)' }}>ミニ工房</span>
      </div>
      {BEANS.map((b, i) => (
        <div key={b.key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: b.color, alignSelf: 'center', flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, fontWeight: 400 }}>{b.name}</span>
            <span style={{ marginLeft: 'auto', fontSize: 14, fontFamily: 'var(--ss-serif)', color: 'var(--ss-gold)' }}>{ratios[i]}%</span>
          </div>
          <input type="range" className="ss-range" min="0" max="100" value={ratios[i]}
            style={{ '--tr-pct': `${ratios[i]}%`, '--tr-fill': b.color } as CSSProperties}
            onChange={(e) => setRatios(normalizeRatios(ratios, i, +e.target.value))} />
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <RatioBar ratios={ratios} h={7} style={{ flex: 1 }} />
        <span className="ss-hand" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{tasteWord(ratios)}</span>
      </div>
      <button className="ss-btn" onClick={() => goMaker(ratios, 'まっさら')}>この比率でつづける →</button>
    </div>
  );
}

export function ScreenTop({ nav, addToCart, startMaker, addSingleToCart }: {
  nav: NavFn;
  addToCart: (b: Blend, grind?: string) => void;
  startMaker: (ratios: number[], base: string) => void;
  addSingleToCart: (bean: Bean) => void;
}) {
  return (
    <div className="ss-screen">
      <div style={{ position: 'relative', padding: '64px 0 10px' }}>
        <span className="ss-watermark" style={{ fontSize: 'clamp(80px,14vw,170px)', top: 10, left: -10 }}>blend</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,420px)', gap: 40, alignItems: 'center' }} className="ss-hero-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <span className="ss-eyebrow">Sikō Coffee — Online Shop</span>
            <h1 className="ss-serif" style={{ fontSize: 'clamp(30px,4.6vw,46px)', fontWeight: 400, lineHeight: 1.35 }}>
              じぶんだけのブレンドに、<br />
              <span style={{ color: 'var(--ss-gold)' }}>名前をつけて。</span>
            </h1>
            <p style={{ fontSize: 13.5, lineHeight: 2, color: 'var(--ss-dim)', maxWidth: 400 }}>
              すきな豆をえらんで、すきな割合で。1種ならシングルオリジン、<br />
              2〜3種ならあなただけのブレンドに。どれでも <span style={{ color: 'var(--ss-cream)' }}>¥1,480 / 200g</span>。
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button className="ss-btn" onClick={() => nav('select')}>豆をえらんでつくる →</button>
              <button className="ss-btn ss-btn--ghost" onClick={() => nav('quiz')}>はじめてなら: 30秒の好み診断</button>
            </div>
            <span className="ss-hand" style={{ fontSize: 14 }}>↑ コーヒーにくわしくなくても、だいじょうぶ</span>
          </div>
          <div className="ss-hero-maker">
            <MiniMaker goMaker={startMaker} />
          </div>
        </div>
      </div>

      <SectionHead eyebrow="Classics" title="迷ったら、定番ブレンド" right="すべて見る" />
      <div className="ss-grid-cards">
        {PRESETS.map((b) => (
          <BlendCardH key={b.id} blend={b} onBuy={() => addToCart(b)} onOpen={() => nav('detail', b.id)} />
        ))}
      </div>

      <SectionHead eyebrow="Single Origin" title="そのままの、一杯" hand="ブレンドしない選択も" right="すべて見る" />
      <div className="ss-grid-cards">
        {BEANS.map((b) => (
          <SingleCard key={b.key} bean={b} onBuy={() => addSingleToCart(b)} onOpen={() => nav('single', b.key)} />
        ))}
      </div>

      <div className="ss-card" style={{ marginTop: 26, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', borderStyle: 'dashed', borderColor: 'rgba(200,169,110,0.3)' }}>
        <span style={{ fontSize: 22 }}>☕</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 400 }}>どれがいいか、わからない?</span>
          <span style={{ fontSize: 11.5, color: 'var(--ss-dim)' }}>3つの質問に答えると、ぴったりの配合を提案します</span>
        </div>
        <button className="ss-btn ss-btn--sm" style={{ marginLeft: 'auto' }} onClick={() => nav('quiz')}>好み診断をはじめる</button>
      </div>

      <SectionHead eyebrow="Community" title="みんなのブレンド" hand="お客様の作品です" right="ランキング" />
      <div className="ss-grid-cards">
        {COMMUNITY.map((b) => (
          <BlendCardH key={b.id} blend={b} onBuy={() => addToCart(b)} onOpen={() => nav('detail', b.id)} />
        ))}
      </div>
      <div style={{ marginTop: 22, display: 'flex', justifyContent: 'center' }}>
        <button className="ss-btn ss-btn--ghost" onClick={() => nav('select')}>＋ じぶんのブレンドをつくって、ここに並べる</button>
      </div>
    </div>
  );
}

// ─── ScreenSelect ─────────────────────────────────────────

export function ScreenSelect({ nav, initial, onSelectDone }: {
  nav: NavFn;
  initial?: number[];
  onSelectDone: (selected: number[]) => void;
}) {
  const [sel, setSel] = useState<number[]>(Array.isArray(initial) ? initial.slice(0, MAX_BEANS) : []);
  const [bump, setBump] = useState(0);

  const toggle = (i: number) => {
    if (sel.includes(i)) { setSel(sel.filter((x) => x !== i)); return; }
    if (sel.length >= MAX_BEANS) { setBump((n) => n + 1); return; }
    setSel([...sel, i]);
  };

  const n = sel.length;
  const isSingle = n === 1;
  const preview = n >= 1 ? evenSplit(sel) : [0, 0, 0];

  let ctaLabel = '豆をえらんでください';
  if (isSingle) ctaLabel = 'シングルオリジンで進む →';
  else if (n >= 2) ctaLabel = `${n}種でブレンド工房へ →`;

  return (
    <div className="ss-screen" style={{ maxWidth: 760, margin: '0 auto', paddingTop: 34 }}>
      <button className="ss-nav-link" onClick={() => nav('top')}>← もどる</button>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, margin: '14px 0 6px', flexWrap: 'wrap' }}>
        <span className="ss-eyebrow">Step 1 — Choose beans</span>
      </div>
      <h1 className="ss-serif" style={{ fontSize: 32, fontWeight: 400, marginBottom: 8 }}>豆をえらぶ</h1>
      <p style={{ fontSize: 12.5, color: 'var(--ss-dim)', lineHeight: 1.9, marginBottom: 24, maxWidth: 540 }}>
        <span style={{ color: 'var(--ss-cream)' }}>1種だけ</span>えらぶとシングルオリジン(そのままの一杯)。
        <span style={{ color: 'var(--ss-cream)' }}>2〜3種</span>えらぶと、ブレンド工房で配合を調整できます。
      </p>

      <div className="ss-grid-cards" style={{ '--bump': bump } as CSSProperties}>
        {BEANS.map((b, i) => {
          const on = sel.includes(i);
          const order = sel.indexOf(i) + 1;
          return (
            <button key={b.key} className="ss-card ss-card--hover" onClick={() => toggle(i)}
              style={{
                position: 'relative', padding: 16, display: 'flex', flexDirection: 'column', gap: 11,
                textAlign: 'left', cursor: 'pointer', color: 'var(--ss-cream)', fontFamily: 'var(--ss-sans)',
                '--hover-rot': i % 2 ? '0.7deg' : '-0.7deg',
                border: on ? '1px solid rgba(200,169,110,0.7)' : '1px solid var(--ss-hair)',
                background: on ? 'rgba(200,169,110,0.07)' : 'var(--ss-card)',
              } as CSSProperties}>
              <span style={{
                position: 'absolute', top: 12, right: 12, width: 24, height: 24, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                fontFamily: 'var(--ss-serif)', transition: 'all 0.2s var(--ss-spring)',
                background: on ? 'var(--ss-gold)' : 'transparent', color: on ? '#14100a' : 'var(--ss-dim)',
                border: on ? '1px solid var(--ss-gold)' : '1px solid var(--ss-faint)',
              }}>{on ? order : '+'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 30, height: 30, borderRadius: '50%', background: b.color, flexShrink: 0, boxShadow: on ? '0 0 0 4px rgba(200,169,110,0.18)' : 'none', transition: 'box-shadow 0.2s' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span className="ss-serif" style={{ fontSize: 19, lineHeight: 1.1 }}>{b.name}</span>
                  <span className="ss-eyebrow" style={{ fontSize: 8.5 }}>{b.en}</span>
                </div>
              </div>
              <span style={{ fontSize: 11.5, color: 'var(--ss-dim)', lineHeight: 1.7 }}>{b.origin} ・ {b.roast}</span>
              <TasteDots ratios={singleRatios(i)} size={7} gap={4} />
            </button>
          );
        })}
        <div className="ss-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderColor: 'var(--ss-hair)', minHeight: 150 }}>
          <span style={{ fontSize: 22, color: 'var(--ss-faint)' }}>＋</span>
          <span className="ss-hand" style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>あたらしい産地<br />じゅんびちゅう</span>
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--ss-dim)', marginTop: 16, lineHeight: 1.8 }}>
        ※ いまは最大{MAX_BEANS}種まで。取りあつかう豆は、これからすこしずつ増えていく予定です。
      </p>

      <div className="ss-card" style={{ position: 'sticky', bottom: 14, marginTop: 22, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', border: '1px solid rgba(200,169,110,0.3)', background: 'rgba(10,10,22,0.92)', backdropFilter: 'blur(10px)' }}>
        {n >= 1 ? (
          <Bag name={isSingle ? BEANS[sel[0]].name : null} ratios={preview} w={52} hand={false} />
        ) : (
          <div style={{ width: 52, height: 52, borderRadius: 10, border: '1px dashed var(--ss-faint)', flexShrink: 0 }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span className="ss-sticker" style={{ fontSize: 11.5 }}>
              {n === 0 ? '未選択' : isSingle ? 'シングルオリジン' : `${n}種ブレンド`}
            </span>
            {n >= 1 && <span style={{ fontSize: 11.5, color: 'var(--ss-dim)' }}>{sel.map((i) => BEANS[i].name).join(' ・ ')}</span>}
          </div>
          {n >= 2 && <span className="ss-hand" style={{ fontSize: 13 }}>つぎは配合を調整します</span>}
        </div>
        <button className="ss-btn" style={{ height: 50, minWidth: 200 }} disabled={n === 0} onClick={() => onSelectDone(sel)}>
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}

// ─── ScreenSingle ─────────────────────────────────────────

export function ScreenSingle({ beanKey, nav, addSingleToCart }: {
  beanKey: string;
  nav: NavFn;
  addSingleToCart: (bean: Bean, grind: string) => void;
}) {
  const b = BEANS.find((x) => x.key === beanKey);
  const [grind, setGrind] = useState('豆のまま');

  if (!b) return <div className="ss-screen" style={{ paddingTop: 60 }}>見つかりませんでした</div>;

  const idx = BEANS.indexOf(b);
  const ratios = singleRatios(idx);

  return (
    <div className="ss-screen" style={{ maxWidth: 720, margin: '0 auto', paddingTop: 34 }}>
      <button className="ss-nav-link" onClick={() => nav('select')}>← 豆をえらびなおす</button>
      <div style={{ display: 'flex', gap: 34, marginTop: 22, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <Bag name={b.name} ratios={ratios} w={170} hand={false} />
          <span className="ss-sticker">♡ {b.bought}人が購入</span>
        </div>
        <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="ss-eyebrow">Single Origin</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h1 className="ss-serif" style={{ fontSize: 38, fontWeight: 400 }}>{b.name}</h1>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: b.color, alignSelf: 'center' }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--ss-dim)' }}>{b.origin}</span>
          </div>
          <p style={{ fontSize: 13, lineHeight: 2, color: 'var(--ss-dim)' }}>{b.desc}</p>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', borderTop: '1px solid var(--ss-hair)', borderBottom: '1px solid var(--ss-hair)', padding: '12px 0' }}>
            {([['焙煎', b.roast], ['精製', b.process], ['内容量', '200g']] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span className="ss-eyebrow" style={{ fontSize: 8.5 }}>{k}</span>
                <span style={{ fontSize: 13.5, color: 'var(--ss-cream)' }}>{v}</span>
              </div>
            ))}
          </div>
          <TasteDots ratios={ratios} words />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6 }}>
            <span style={{ fontSize: 11.5, color: 'var(--ss-dim)', letterSpacing: '0.08em' }}>挽き方</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {['豆のまま', '挽いて(ドリッパー用)'].map((g) => (
                <button key={g} className={`ss-chip${grind === g ? ' is-on' : ''}`} onClick={() => setGrind(g)}>{g}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6 }}>
            <span className="ss-serif" style={{ fontSize: 26, color: 'var(--ss-gold)' }}>
              ¥ 1,480 <span style={{ fontSize: 13, color: 'var(--ss-dim)' }}>/ 200g</span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="ss-btn" style={{ flex: 1, minWidth: 180 }} onClick={() => addSingleToCart(b, grind)}>カートに入れる</button>
            <button className="ss-btn ss-btn--ghost" style={{ flex: 1, minWidth: 180 }} onClick={() => nav('select', [idx])}>この豆を入れてブレンドする →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ScreenMaker + NamingSheet ────────────────────────────

const NAME_IDEAS = ['朝のごほうび', 'よりみち', '三日月ブレンド', 'ねこのひたい', 'しずかな火曜日', 'ひとやすみ', 'ベランダ喫茶', 'おつかれさま', 'ゆきどけ', 'まほうのじかん'];

function Confetti({ seed }: { seed: number }) {
  if (!seed) return null;
  const colors = ['#c8a96e', '#e8c896', '#9a6844', '#d9a25e', '#f0ebe0'];
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
      {Array.from({ length: 18 }).map((_, i) => (
        <span key={`${seed}-${i}`} className="ss-confetti" style={{
          left: '50%', top: '40%', background: colors[i % colors.length],
          '--cx': `${Math.cos((i / 18) * Math.PI * 2) * (60 + (i % 3) * 30)}px`,
          '--cy': `${Math.sin((i / 18) * Math.PI * 2) * (40 + (i % 4) * 22) - 30}px`,
          '--cr': `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg`,
        } as CSSProperties} />
      ))}
    </div>
  );
}

function NamingSheet({ ratios, base, onClose, onSave }: {
  ratios: number[]; base?: string; onClose: () => void; onSave: (name: string, publish: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [publish, setPublish] = useState(true);
  const [burst, setBurst] = useState(0);
  const roll = () => { setName(NAME_IDEAS[Math.floor(Math.random() * NAME_IDEAS.length)]); setBurst(Date.now()); };

  return (
    <div className="ss-overlay" onClick={onClose}>
      <div className="ss-sheet" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
        <Confetti seed={burst} />
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--ss-faint)', margin: '0 auto 18px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
          <span className="ss-hand" style={{ fontSize: 15 }}>できあがり!</span>
          <span className="ss-serif" style={{ fontSize: 26 }}>名前をつけよう</span>
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 18 }}>
          <Bag name={name || undefined} ratios={ratios} w={104} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            <span style={{ fontSize: 11, color: 'var(--ss-dim)', lineHeight: 1.8 }}>
              名前はそのまま袋のラベルに印字されます。{base ? `(ベース: ${base})` : ''}
            </span>
            <BeanLegend ratios={ratios} size={8} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <input className="ss-input" placeholder="例: 朝のごほうび(10文字まで)" maxLength={10}
            value={name} onChange={(e) => setName(e.target.value)} />
          <button className="ss-btn ss-btn--ghost" style={{ height: 48, padding: '0 16px', whiteSpace: 'nowrap' }} onClick={roll}>🎲 名前の案</button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 2px', cursor: 'pointer', borderTop: '1px solid var(--ss-hair)' }}>
          <span onClick={() => setPublish(!publish)} style={{ width: 42, height: 23, borderRadius: 12, flexShrink: 0, background: publish ? 'var(--ss-gold)' : 'rgba(240,235,224,0.15)', position: 'relative', transition: 'background 0.2s' }}>
            <span style={{ position: 'absolute', top: 2.5, left: publish ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#0a0a14', transition: 'left 0.25s var(--ss-spring)' }} />
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13 }}>「みんなのブレンド」に公開する</span>
            <span style={{ fontSize: 10.5, color: 'var(--ss-dim)' }}>他のお客様が購入・アレンジできるようになります(あとから非公開にもできます)</span>
          </span>
        </label>
        <button className="ss-btn" style={{ width: '100%', height: 52, marginTop: 10 }} disabled={!name.trim()}
          onClick={() => onSave(name.trim(), publish)}>
          「{name.trim() || '…'}」を保存してカートへ — ¥1,480
        </button>
      </div>
    </div>
  );
}

export function ScreenMaker({ draft, nav, onSaveBlend }: {
  draft: Draft; nav: NavFn; onSaveBlend: (data: { ratios: number[]; name: string; publish: boolean }) => void;
}) {
  const selected = (draft.selected && draft.selected.length >= 2)
    ? draft.selected
    : activeBeans(draft.ratios ?? [34, 33, 33]);
  const [ratios, setRatios] = useState(draft.ratios ?? evenSplit(selected));
  const [naming, setNaming] = useState(false);
  const word = tasteWord(ratios);

  return (
    <div className="ss-screen" style={{ maxWidth: 660, margin: '0 auto', paddingTop: 34 }}>
      <button className="ss-nav-link" onClick={() => nav('select', selected)}>← 豆をえらびなおす</button>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, margin: '14px 0 6px', flexWrap: 'wrap' }}>
        <h1 className="ss-serif" style={{ fontSize: 32, fontWeight: 400 }}>ブレンド工房</h1>
        <span className="ss-sticker">{selected.length}種ブレンド</span>
        {draft.base && draft.base !== 'まっさら' && <span className="ss-sticker">出発点: {draft.base}</span>}
      </div>
      <p style={{ fontSize: 12, color: 'var(--ss-dim)', lineHeight: 1.9, marginBottom: 22 }}>
        えらんだ{selected.length}種の豆を、すきな割合で。スライダーをうごかすと「いまの味」がリアルタイムに変わり、合計はいつも100%になるよう自動調整します。
      </p>

      <div className="ss-card" style={{ padding: 20, marginBottom: 22, display: 'flex', gap: 20, alignItems: 'center', border: '1px solid rgba(200,169,110,0.3)' }}>
        <Bag name={null} ratios={ratios} w={86} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span className="ss-eyebrow" style={{ fontSize: 9.5 }}>いまの味</span>
            <span className="ss-hand" style={{ fontSize: 19 }} key={word}>「{word}」</span>
          </div>
          <RatioBar ratios={ratios} h={8} />
          <TasteDots ratios={ratios} words />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {selected.map((i) => {
          const b = BEANS[i];
          return (
            <div key={b.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: b.color, alignSelf: 'center', flexShrink: 0 }} />
                <span style={{ fontSize: 15, fontWeight: 400 }}>{b.name}</span>
                <span style={{ fontSize: 11, color: 'var(--ss-dim)' }}>{b.sub}</span>
                <span className="ss-serif" style={{ marginLeft: 'auto', fontSize: 23, color: 'var(--ss-gold)' }}>
                  {ratios[i]}<span style={{ fontSize: 13 }}>%</span>
                </span>
              </div>
              <input type="range" className="ss-range" min="0" max="100" value={ratios[i]}
                style={{ '--tr-pct': `${ratios[i]}%`, '--tr-fill': b.color } as CSSProperties}
                onChange={(e) => setRatios(normalizeSubset(ratios, selected, i, +e.target.value))} />
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 26px' }}>
        <span style={{ fontSize: 11, color: 'var(--ss-dim)' }}>合計</span>
        <span className="ss-serif" style={{ fontSize: 16, color: 'var(--ss-cream)' }}>100%</span>
        <span style={{ fontSize: 11, color: 'var(--ss-dim)', marginLeft: 'auto' }}>¥1,480 / 200g(どの配合でも一律)</span>
      </div>
      <button className="ss-btn" style={{ width: '100%', height: 54, fontSize: 14.5 }} onClick={() => setNaming(true)}>
        できあがり! 名前をつける →
      </button>

      {naming && (
        <NamingSheet ratios={ratios} base={draft.base !== 'まっさら' ? draft.base : undefined}
          onClose={() => setNaming(false)}
          onSave={(name, publish) => { setNaming(false); onSaveBlend({ ratios, name, publish }); }} />
      )}
    </div>
  );
}

// ─── ScreenQuiz ───────────────────────────────────────────

const QUIZ = [
  { q: '朝のコーヒー、どっち派?', hint: 'なんとなくでOK', opts: [
    { e: '☀', t: 'すっきり目ざめたい', v: { acid: 1, body: -1 } },
    { e: '🍫', t: 'ゆっくり濃いめがいい', v: { roast: 1, body: 1 } },
  ]},
  { q: '果物のような酸味、どう感じる?', hint: '「酸味」はレモンというより、果実のみずみずしさのこと', opts: [
    { e: '🍓', t: 'すき! フルーティ大歓迎', v: { acid: 2 } },
    { e: '🤔', t: 'ちょっとなら、いいよ', v: { acid: 0.5 } },
    { e: '☕', t: '苦みとコクが正義', v: { roast: 1.5, body: 1 } },
  ]},
  { q: 'ミルクは入れる?', hint: '', opts: [
    { e: '🖤', t: 'ブラックのまま', v: {} },
    { e: '🥛', t: 'ミルクと半々くらい', v: { body: 1.5, roast: 0.5 } },
  ]},
] as const;

function quizToRatios(answers: number[]): number[] {
  const s = { acid: 0, roast: 0, body: 0 };
  answers.forEach((ai, qi) => {
    const v = QUIZ[qi].opts[ai].v as Record<string, number>;
    Object.keys(v).forEach((k) => { (s as Record<string, number>)[k] += v[k]; });
  });
  let w = BEANS.map((b) => 1 + b.taste.acid * s.acid * 0.18 + b.taste.roast * s.roast * 0.18 + b.taste.body * s.body * 0.15);
  w = w.map((x) => Math.max(0.15, x));
  const sum = w.reduce((a, b) => a + b, 0);
  const r = w.map((x) => Math.round((x / sum) * 100));
  r[2] = 100 - r[0] - r[1];
  return r;
}

function quizArchetype(answers: number[]): string {
  const [a0, a1, a2] = answers;
  if (a1 === 0) return a0 === 0 ? '朝のすっきり派' : 'あまずっぱ党';
  if (a1 === 2) return a2 === 1 ? 'ミルクと濃いめ党' : 'ほろにが夜型';
  return a0 === 0 ? 'バランスじょうず' : 'まったり中道派';
}

export function ScreenQuiz({ nav, startMaker, addCustomToCart }: {
  nav: NavFn;
  startMaker: (ratios: number[], base: string) => void;
  addCustomToCart: (b: { ratios: number[]; name: string; publish: boolean }) => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const done = answers.length === QUIZ.length;

  if (done) {
    const ratios = quizToRatios(answers);
    const arch = quizArchetype(answers);
    return (
      <div className="ss-screen" style={{ maxWidth: 560, margin: '0 auto', paddingTop: 40, textAlign: 'center' }}>
        <span className="ss-eyebrow">Result</span>
        <p style={{ fontSize: 12, color: 'var(--ss-dim)', margin: '14px 0 4px' }}>あなたにぴったりなのは…</p>
        <h1 className="ss-hand" style={{ fontSize: 36, fontWeight: 400, marginBottom: 24 }}>「{arch}」</h1>
        <div className="ss-card" style={{ padding: 24, display: 'flex', gap: 22, alignItems: 'center', textAlign: 'left', border: '1px solid rgba(200,169,110,0.35)' }}>
          <Bag name={arch} ratios={ratios} w={100} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minWidth: 0 }}>
            <RatioBar ratios={ratios} h={8} />
            <BeanLegend ratios={ratios} size={8} />
            <TasteDots ratios={ratios} words />
            <span className="ss-hand" style={{ fontSize: 15 }}>「{tasteWord(ratios)}」な一杯です</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
          <button className="ss-btn" style={{ height: 52 }} onClick={() => addCustomToCart({ ratios, name: arch, publish: false })}>
            このまま買う — ¥1,480
          </button>
          <button className="ss-btn ss-btn--ghost" onClick={() => startMaker(ratios, '診断結果')}>比率を微調整する(工房へ)</button>
          <button className="ss-nav-link" style={{ margin: '6px auto 0' }} onClick={() => { setAnswers([]); setStep(0); }}>もういちど診断する</button>
        </div>
      </div>
    );
  }

  const q = QUIZ[step];
  return (
    <div className="ss-screen" style={{ maxWidth: 520, margin: '0 auto', paddingTop: 40 }}>
      <button className="ss-nav-link" onClick={() => step === 0 ? nav('top') : setStep(step - 1)}>← もどる</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0 26px' }}>
        <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(240,235,224,0.1)' }}>
          <div style={{ width: `${((step + 1) / QUIZ.length) * 100}%`, height: '100%', borderRadius: 3, background: 'var(--ss-gold)', transition: 'width 0.4s var(--ss-spring)' }} />
        </div>
        <span className="ss-serif" style={{ fontSize: 15, color: 'var(--ss-gold)' }}>{step + 1} / {QUIZ.length}</span>
      </div>
      <h1 className="ss-serif" style={{ fontSize: 28, fontWeight: 400, lineHeight: 1.5, marginBottom: 6 }}>Q{step + 1}. {q.q}</h1>
      {q.hint && <p className="ss-hand" style={{ fontSize: 13.5, marginBottom: 18 }}>{q.hint}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
        {q.opts.map((o, i) => (
          <button key={i} className="ss-card ss-card--hover"
            style={{ padding: '20px 20px', display: 'flex', alignItems: 'center', gap: 16, color: 'var(--ss-cream)', fontFamily: 'var(--ss-sans)', fontSize: 15.5, fontWeight: 400, cursor: 'pointer', textAlign: 'left', '--hover-rot': i % 2 ? '0.6deg' : '-0.6deg' } as CSSProperties}
            onClick={() => { const next = [...answers, i]; setAnswers(next); if (step < QUIZ.length - 1) setStep(step + 1); }}>
            <span style={{ fontSize: 24 }}>{o.e}</span>{o.t}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--ss-dim)', marginTop: 22, lineHeight: 1.8 }}>正解はありません。きょうの気分でどうぞ。</p>
    </div>
  );
}

// ─── ScreenDetail ─────────────────────────────────────────

export function ScreenDetail({ id, nav, addToCart, startMaker }: {
  id: string; nav: NavFn; addToCart: (b: Blend, grind: string) => void; startMaker: (ratios: number[], base: string) => void;
}) {
  const b = findBlend(id);
  const [grind, setGrind] = useState('豆のまま');
  if (!b) return <div className="ss-screen" style={{ paddingTop: 60 }}>見つかりませんでした</div>;

  return (
    <div className="ss-screen" style={{ maxWidth: 720, margin: '0 auto', paddingTop: 34 }}>
      <button className="ss-nav-link" onClick={() => nav('top')}>← もどる</button>
      <div style={{ display: 'flex', gap: 34, marginTop: 22, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <Bag name={b.name} ratios={b.ratios} w={170} />
          {b.by && <span className="ss-sticker">♡ {b.bought}人が購入</span>}
        </div>
        <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="ss-eyebrow">{b.by ? 'Community Blend' : 'Classic Blend'}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h1 className="ss-serif" style={{ fontSize: 38, fontWeight: 400 }}>{b.name}</h1>
              {b.by && <span className="ss-hand" style={{ fontSize: 15 }}>by {b.by} さん</span>}
            </div>
          </div>
          <p style={{ fontSize: 13, lineHeight: 2, color: 'var(--ss-dim)' }}>
            {b.by ? <>「{b.comment}」<span style={{ fontSize: 11 }}>(作者コメント)</span></> : b.desc}
          </p>
          <RatioBar ratios={b.ratios} h={8} />
          <BeanLegend ratios={b.ratios} />
          <TasteDots ratios={b.ratios} words />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--ss-hair)', paddingTop: 14 }}>
            <span style={{ fontSize: 11.5, color: 'var(--ss-dim)', letterSpacing: '0.08em' }}>挽き方</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {['豆のまま', '挽いて(ドリッパー用)'].map((g) => (
                <button key={g} className={`ss-chip${grind === g ? ' is-on' : ''}`} onClick={() => setGrind(g)}>{g}</button>
              ))}
            </div>
          </div>
          <span className="ss-serif" style={{ fontSize: 26, color: 'var(--ss-gold)' }}>
            ¥ 1,480 <span style={{ fontSize: 13, color: 'var(--ss-dim)' }}>/ 200g</span>
          </span>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="ss-btn" style={{ flex: 1, minWidth: 180 }} onClick={() => addToCart(b, grind)}>カートに入れる</button>
            <button className="ss-btn ss-btn--ghost" style={{ flex: 1, minWidth: 180 }} onClick={() => startMaker(b.ratios, `${b.name} をアレンジ`)}>これをベースにアレンジ →</button>
          </div>
          {b.by && <p className="ss-hand" style={{ fontSize: 12.5 }}>アレンジしてできた袋には「Based on {b.name}」と入ります</p>}
        </div>
      </div>
    </div>
  );
}

// ─── ScreenCart ───────────────────────────────────────────

export function ScreenCart({ cart, nav, removeAt, startMaker, checkout, checkingOut }: {
  cart: CartItem[]; nav: NavFn; removeAt: (i: number) => void;
  startMaker: (ratios: number[], base: string, editIndex?: number) => void;
  checkout: () => void; checkingOut: boolean;
}) {
  const total = cart.length * PRICE;
  const ship = total >= 3000 || cart.length === 0 ? 0 : 350;

  return (
    <div className="ss-screen" style={{ maxWidth: 620, margin: '0 auto', paddingTop: 34 }}>
      <button className="ss-nav-link" onClick={() => nav('top')}>← 買い物をつづける</button>
      <h1 className="ss-serif" style={{ fontSize: 32, fontWeight: 400, margin: '14px 0 22px' }}>カート</h1>

      {cart.length === 0 && (
        <div className="ss-card" style={{ padding: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span className="ss-hand" style={{ fontSize: 17 }}>まだ、からっぽです</span>
          <button className="ss-btn" style={{ margin: '0 auto' }} onClick={() => nav('select')}>豆をえらんでつくる →</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {cart.map((item, i) => (
          <div key={i} className="ss-card" style={{ padding: 14, display: 'flex', gap: 14, alignItems: 'center' }}>
            <Bag name={item.name} ratios={item.ratios} w={58} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span className="ss-serif" style={{ fontSize: 17 }}>{item.name}</span>
                {item.custom && <span className="ss-sticker" style={{ fontSize: 11 }}>あなたの作品</span>}
                {item.single && <span className="ss-sticker" style={{ fontSize: 11 }}>シングルオリジン</span>}
              </div>
              <RatioBar ratios={item.ratios} h={5} />
              <span style={{ fontSize: 10.5, color: 'var(--ss-dim)' }}>{item.grind || '豆のまま'} / 200g</span>
              {item.custom && (
                <button className="ss-nav-link" style={{ alignSelf: 'flex-start', fontSize: 11 }}
                  onClick={() => startMaker(item.ratios, `${item.name} を再編集`, i)}>比率を編集 →</button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
              <span className="ss-serif" style={{ fontSize: 16 }}>¥1,480</span>
              <button className="ss-nav-link" style={{ fontSize: 11 }} onClick={() => removeAt(i)}>削除</button>
            </div>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <div style={{ marginTop: 22, borderTop: '1px solid var(--ss-hair)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', fontSize: 12.5, color: 'var(--ss-dim)' }}>
            <span>送料</span>
            <span style={{ marginLeft: 'auto' }}>{ship === 0 ? '無料' : `¥${ship}`}(¥3,000以上で無料)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14 }}>合計</span>
            <span className="ss-serif" style={{ marginLeft: 'auto', fontSize: 28, color: 'var(--ss-gold)' }}>
              ¥ {(total + ship).toLocaleString()}
            </span>
          </div>
          <button className="ss-btn" style={{ height: 52, marginTop: 8 }} disabled={checkingOut} onClick={checkout}>
            {checkingOut ? '処理中…' : '購入手続きへ(ゲストOK)'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ScreenMyPage ─────────────────────────────────────────

export function ScreenMyPage({ saved, nav, addCustomToCart, startMaker }: {
  saved: SavedBlend[]; nav: NavFn;
  addCustomToCart: (b: SavedBlend) => void;
  startMaker: (ratios: number[], base: string) => void;
}) {
  return (
    <div className="ss-screen" style={{ maxWidth: 620, margin: '0 auto', paddingTop: 34 }}>
      <button className="ss-nav-link" onClick={() => nav('top')}>← もどる</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '18px 0 26px' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', border: '1px solid rgba(200,169,110,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--ss-serif)', fontSize: 20, color: 'var(--ss-gold)' }}>m</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="ss-serif" style={{ fontSize: 22 }}>マイページ</span>
          <span style={{ fontSize: 11, color: 'var(--ss-dim)' }}>公開中のブレンド {saved.filter((s) => s.publish).length} / 保存 {saved.length}</span>
        </div>
      </div>
      <SectionHead eyebrow="My Blends" title="じぶんのブレンド" hand="ぜんぶ、あなたの作品" />
      {saved.length === 0 && (
        <div className="ss-card" style={{ padding: 36, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="ss-hand" style={{ fontSize: 15 }}>まだブレンドがありません</span>
          <button className="ss-btn" style={{ margin: '0 auto' }} onClick={() => nav('select')}>はじめてのブレンドをつくる →</button>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {saved.map((b, i) => (
          <div key={i} className="ss-card" style={{ padding: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
            <Bag name={b.name} ratios={b.ratios} w={62} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span className="ss-serif" style={{ fontSize: 18 }}>{b.name}</span>
                {b.publish
                  ? <span style={{ fontSize: 10.5, color: 'rgba(200,169,110,0.7)' }}>公開中 · ♡ {b.fans ?? 0}人が購入</span>
                  : <span style={{ fontSize: 10.5, color: 'var(--ss-dim)' }}>非公開</span>}
              </div>
              <RatioBar ratios={b.ratios} h={5} />
              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                <button className="ss-btn ss-btn--sm" onClick={() => addCustomToCart(b)}>もう一度買う</button>
                <button className="ss-btn ss-btn--ghost ss-btn--sm" onClick={() => startMaker(b.ratios, `${b.name} をアレンジ`)}>アレンジ</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
