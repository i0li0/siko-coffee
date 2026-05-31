'use client';

import { useState, useEffect } from 'react';
import type { Product } from '@/types/product';

// DynamoDB が空 or 未登録のときに表示するフォールバック
const FALLBACK: Product[] = [
  { id: 'menu_01', name: 'Hot Coffee',     nameJp: 'ホットコーヒー',       description: 'ディカフェで、深夜でも。',   price: 500,  type: 'menu', isPublic: true, canCustomize: false },
  { id: 'menu_02', name: 'Iced Coffee',    nameJp: 'アイスコーヒー',       description: '冷たく、静かに。',           price: 500,  type: 'menu', isPublic: true, canCustomize: false },
  { id: 'menu_03', name: 'Oat Latte',      nameJp: 'オーツオレ',           description: 'やさしさが溶けている。',     price: 500,  type: 'menu', isPublic: true, canCustomize: false },
  { id: 'menu_04', name: 'Iced Oat Latte', nameJp: 'アイスオーツオレ',     description: '夜の終わりに、もう一杯。',   price: 500,  type: 'menu', isPublic: true, canCustomize: false },
  { id: 'menu_05', name: 'Decaf Beans',    nameJp: 'ディカフェ豆（100g）', description: '自宅で、あの静けさを。',     price: 1000, type: 'menu', isPublic: true, canCustomize: false },
];

export default function Menu() {
  const [items, setItems] = useState<Product[]>(FALLBACK);

  useEffect(() => {
    fetch('/api/menu')
      .then((r) => r.json())
      .then((data: Product[]) => {
        if (Array.isArray(data) && data.length > 0) setItems(data);
      })
      .catch(() => {}); // エラー時はフォールバックを維持
  }, []);

  return (
    <section id="menu"
      className="relative min-h-screen flex items-start justify-center z-[2]
        py-[130px] px-20 max-[700px]:py-[90px] max-[700px]:px-[22px]">
      <div className="menu-inner w-full max-w-[660px] relative max-[700px]:max-w-full">
        <span
          className="font-serif font-light absolute top-1/2 left-1/2
            -translate-x-[60%] -translate-y-1/2 whitespace-nowrap
            pointer-events-none select-none tracking-[0.05em]
            text-[clamp(60px,16vw,160px)] text-[rgba(255,255,255,0.03)]"
          aria-hidden="true"
        >
          menu
        </span>
        {items.map((item, i) => (
          <div
            key={item.id}
            className="menu-item py-[26px] border-b border-[rgba(232,234,238,0.08)]
              grid gap-6 items-start cursor-default
              first:border-t first:border-[rgba(232,234,238,0.08)]"
            style={{ gridTemplateColumns: '1fr auto' }}
            data-reveal
            data-d={i}
          >
            <div>
              <span className="block font-serif text-[clamp(17px,2.6vw,26px)] font-normal
                text-[#E8EAEE] tracking-[0.05em] mb-[3px]">
                {item.name}
              </span>
              <span className="block font-sans text-[10.5px] font-extralight
                text-[rgba(184,190,200,0.45)] tracking-[0.14em] mb-[5px]">
                {item.nameJp}
              </span>
              <span className="item-desc block font-serif italic text-[12.5px]
                text-[rgba(200,185,150,0.42)] tracking-[0.07em]">
                {item.description}
              </span>
            </div>
            <span className="font-serif text-[13px] font-light
              text-[rgba(184,190,200,0.58)] tracking-[0.06em] pt-1 text-right whitespace-nowrap">
              ¥ {item.price.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
