'use client';

import { useState, useEffect } from 'react';
import type { Product } from '@/types/product';

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
      .catch(() => {});
  }, []);

  return (
    <section id="menu"
      className="relative min-h-screen flex items-start justify-center z-[2]
        py-[130px] px-20 max-[700px]:py-[90px] max-[700px]:px-[22px]">
      <div className="menu-inner w-full max-w-[660px] relative max-[700px]:max-w-full">

        {/* Watermark */}
        <span
          className="font-serif font-light absolute top-1/2 left-1/2
            -translate-x-[60%] -translate-y-1/2 whitespace-nowrap
            pointer-events-none select-none tracking-[0.05em]
            text-[clamp(60px,16vw,160px)]"
          style={{ color: 'rgba(212,160,23,0.025)' }}
          aria-hidden="true"
        >
          menu
        </span>

        {/* CLI header */}
        <div
          className="font-mono text-[11px] tracking-[0.16em] mb-10 select-none"
          style={{ color: 'var(--amber2)' }}
          data-reveal
        >
          <span style={{ color: 'var(--amber)' }}>{'>'}</span>
          {' '}ls -la drinks/
        </div>

        {items.map((item, i) => (
          <div
            key={item.id}
            className="menu-item py-[26px] grid gap-6 items-start cursor-default
              border-b first:border-t"
            style={{
              borderColor: 'rgba(212,160,23,0.1)',
              gridTemplateColumns: '1fr auto',
            }}
            data-reveal
            data-d={i}
          >
            <div>
              <span
                className="block font-serif text-[clamp(17px,2.6vw,26px)] font-normal
                  tracking-[0.05em] mb-[3px]"
                style={{ color: 'var(--cream)' }}
              >
                {item.name}
              </span>
              <span
                className="block font-sans text-[10.5px] font-extralight
                  tracking-[0.14em] mb-[5px]"
                style={{ color: 'var(--amber2)' }}
              >
                {item.nameJp}
              </span>
              <span
                className="item-desc block font-serif italic text-[12.5px] tracking-[0.07em]"
                style={{ color: 'rgba(212,160,23,0.38)' }}
              >
                {item.description}
              </span>
            </div>
            <span
              className="font-mono text-[12px] font-light tracking-[0.06em] pt-1
                text-right whitespace-nowrap"
              style={{ color: 'var(--amber2)' }}
            >
              ¥{item.price.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
