// Bean data, blend presets, community blends, and pure helper functions.
// No React imports — usable in server and client contexts.

export const MAX_BEANS = 3;

export interface Bean {
  key: string;
  name: string;
  en: string;
  sub: string;
  color: string;
  taste: { acid: number; roast: number; body: number };
  origin: string;
  process: string;
  roast: string;
  bought: number;
  desc: string;
}

export interface Blend {
  id: string;
  name: string;
  en?: string;
  ratios: number[];
  by?: string | null;
  desc?: string;
  bought?: number;
  comment?: string;
}

export const BEANS: Bean[] = [
  {
    key: 'brazil', name: 'ブラジル', en: 'Brazil', sub: 'コクと甘み', color: '#9a6844',
    taste: { acid: 1.5, roast: 3.5, body: 4.5 },
    origin: 'ブラジル セラード', process: 'ナチュラル精製', roast: '中深煎り', bought: 521,
    desc: 'チョコレートのような甘みと、ナッツの香ばしさ。どっしり落ちつく、まいにちの一杯に。',
  },
  {
    key: 'ethiopia', name: 'エチオピア', en: 'Ethiopia', sub: '華やかな果実感', color: '#d9a25e',
    taste: { acid: 4.5, roast: 1.5, body: 2 },
    origin: 'エチオピア イルガチェフェ', process: 'ウォッシュド', roast: '浅煎り', bought: 478,
    desc: 'ベリーや花を思わせる、華やかな香り。冷めてもおいしい、果実のような一杯。',
  },
  {
    key: 'colombia', name: 'コロンビア', en: 'Colombia', sub: 'まんなかのバランス', color: '#8fa06a',
    taste: { acid: 3, roast: 2.5, body: 3.5 },
    origin: 'コロンビア ウイラ', process: 'ウォッシュド', roast: '中煎り', bought: 364,
    desc: '甘みと酸味のちょうどいいバランス。どんな飲み方にも合う、ふだんの一杯。',
  },
];

export const AXES = [
  { key: 'acid' as const, label: '酸味', word: 'フルーティさ' },
  { key: 'roast' as const, label: '苦味', word: 'ロースト感' },
  { key: 'body' as const, label: 'コク', word: '飲みごたえ' },
];

export const PRICE_PER_100G = 1000;
export const PRICE = PRICE_PER_100G;

export const GRAM_OPTIONS = [100, 150, 200, 250, 300, 350, 400, 450, 500] as const;
export type GramOption = typeof GRAM_OPTIONS[number];
export const DEFAULT_GRAMS: GramOption = 200;

export function calcPrice(grams: number): number {
  return Math.round((grams / 100) * PRICE_PER_100G);
}

export const PRESETS: Blend[] = [
  { id: 'asayake', name: 'あさやけ', en: 'Asayake', ratios: [50, 30, 20], by: null, desc: 'コクと甘みのバランス型。はじめての一袋に。', bought: 412 },
  { id: 'madoromi', name: 'まどろみ', en: 'Madoromi', ratios: [20, 55, 25], by: null, desc: '果実のようにみずみずしく、かろやか。', bought: 287 },
  { id: 'yofukashi', name: 'よふかし', en: 'Yofukashi', ratios: [30, 10, 60], by: null, desc: 'どっしり濃いめ。ミルクにも負けない。', bought: 198 },
  { id: 'hidamari', name: 'ひだまり', en: 'Hidamari', ratios: [34, 33, 33], by: null, desc: '3つの豆をちょうど三等分。まよったらこれ。', bought: 156 },
];

export const COMMUNITY: Blend[] = [
  { id: 'c1', name: 'よあけ', by: 'ken', ratios: [30, 55, 15], bought: 128, comment: '夜明けに飲みたい、果実感のあるかるい一杯' },
  { id: 'c2', name: '日曜の朝', by: 'mio', ratios: [55, 20, 25], bought: 96, comment: 'なにもしない日曜のための、やさしい甘さ' },
  { id: 'c3', name: '残業のおとも', by: 'スタッフ', ratios: [25, 15, 60], bought: 84, comment: 'もうひとふんばり、に効く濃さです' },
  { id: 'c4', name: 'はつこい', by: 'rui', ratios: [20, 65, 15], bought: 61, comment: 'あまずっぱいです。そういうことです' },
  { id: 'c5', name: 'キャンプの夜', by: 'tomo', ratios: [40, 10, 50], bought: 47, comment: '焚き火と星に合うように作りました' },
];

// Returns a ratios array with only the given index set to 100
export function singleRatios(idx: number): number[] {
  const r = [0, 0, 0];
  r[idx] = 100;
  return r;
}

// Even split across selected bean indices, total = 100
export function evenSplit(selected: number[]): number[] {
  const r = [0, 0, 0];
  const n = selected.length;
  const base = Math.floor(100 / n);
  const rem = 100 - base * n;
  selected.forEach((idx, k) => { r[idx] = base + (k < rem ? 1 : 0); });
  return r;
}

// Which bean indices have ratio > 0
export function activeBeans(ratios: number[]): number[] {
  return ratios.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
}

export function tasteOf(ratios: number[]) {
  const t = { acid: 0, roast: 0, body: 0 };
  BEANS.forEach((b, i) => {
    t.acid += (b.taste.acid * ratios[i]) / 100;
    t.roast += (b.taste.roast * ratios[i]) / 100;
    t.body += (b.taste.body * ratios[i]) / 100;
  });
  return t;
}

export function tasteDots(ratios: number[]): number[] {
  const t = tasteOf(ratios);
  return AXES.map((a) => Math.max(1, Math.min(5, Math.round(t[a.key]))));
}

export function tasteWord(ratios: number[]): string {
  const t = tasteOf(ratios);
  const arr = [
    { v: t.acid, hi: 'フルーティ寄り', word2: 'すっきり' },
    { v: t.roast, hi: 'ロースト感しっかり', word2: 'ほろにが' },
    { v: t.body, hi: '飲みごたえどっしり', word2: 'まろやか' },
  ];
  const top = [...arr].sort((a, b) => b.v - a.v)[0];
  const spread = Math.max(t.acid, t.roast, t.body) - Math.min(t.acid, t.roast, t.body);
  if (spread < 0.9) return 'バランス◎・まいにち向き';
  return `${top.hi}・${top.word2}`;
}

// Normalize all beans: change index i to value v, redistribute the rest proportionally
export function normalizeRatios(ratios: number[], i: number, v: number): number[] {
  v = Math.max(0, Math.min(100, v));
  const rest = 100 - v;
  const others = ratios.filter((_, j) => j !== i);
  const sum = others.reduce((a, b) => a + b, 0);
  const out = [...ratios];
  out[i] = v;
  let acc = 0;
  let idx = 0;
  ratios.forEach((r, j) => {
    if (j === i) return;
    let nv: number;
    if (idx === others.length - 1) nv = rest - acc;
    else nv = sum === 0 ? Math.round(rest / others.length) : Math.round((r / sum) * rest);
    acc += nv;
    idx += 1;
    out[j] = nv;
  });
  return out;
}

// Normalize within selected subset only: non-selected beans stay at 0
export function normalizeSubset(ratios: number[], selected: number[], i: number, v: number): number[] {
  v = Math.max(0, Math.min(100, Math.round(v)));
  const out = ratios.map((_, idx) => (selected.includes(idx) ? ratios[idx] : 0));
  const others = selected.filter((j) => j !== i);
  if (others.length === 0) { out[i] = 100; return out; }
  out[i] = v;
  const rest = 100 - v;
  const sum = others.reduce((a, j) => a + ratios[j], 0);
  let acc = 0;
  others.forEach((j, k) => {
    let nv: number;
    if (k === others.length - 1) nv = rest - acc;
    else nv = sum === 0 ? Math.round(rest / others.length) : Math.round((ratios[j] / sum) * rest);
    acc += nv;
    out[j] = nv;
  });
  return out;
}

export function findBlend(id: string): Blend | undefined {
  return PRESETS.find((b) => b.id === id) || COMMUNITY.find((b) => b.id === id);
}
