'use client';

import { useState } from 'react';
import type { Product } from '@/types/product';
import type { CategoryKey } from '@/lib/shopCategories';

interface Props {
  products: Product[];
  category: CategoryKey;
}

function BuyButton({ productId }: { productId: string }) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      action="/api/checkout"
      method="POST"
      className="mt-[18px]"
      onSubmit={() => setSubmitting(true)}
    >
      <input type="hidden" name="productId" value={productId} />
      <button
        type="submit"
        disabled={submitting}
        className="font-sans font-extralight text-[9.5px] tracking-[0.22em]
          text-[rgba(184,190,200,0.55)] border border-[rgba(184,190,200,0.22)]
          px-[22px] py-[10px] cursor-pointer bg-transparent
          transition-all duration-300
          hover:text-[#B8BEC8] hover:border-[rgba(184,190,200,0.5)]
          disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting ? '処理中...' : '購入する'}
      </button>
    </form>
  );
}

export default function ShopProductList({ products, category }: Props) {
  if (category === 'drip' || category === 'goods') {
    return (
      <div className="flex flex-col items-center justify-center py-[80px] gap-[24px]">
        <span
          className="font-serif font-light text-[clamp(36px,8vw,72px)]
            text-[rgba(184,190,200,0.06)] tracking-[0.05em] select-none"
          aria-hidden="true"
        >
          soon
        </span>
        <p className="font-serif italic text-[13px] text-[rgba(184,190,200,0.35)]
          tracking-[0.1em] text-center leading-[2.2]">
          このカテゴリは現在準備中です。<br />
          今しばらくお待ちください。
        </p>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <p className="font-serif italic text-[13px] text-[rgba(232,234,238,0.3)]
        tracking-[0.08em] text-center py-[60px]">
        現在、商品はございません。
      </p>
    );
  }

  return (
    <div>
      {products.map((product) => (
        <div
          key={product.id}
          className="py-[26px] border-b border-[rgba(232,234,238,0.08)]
            first:border-t first:border-[rgba(232,234,238,0.08)]"
        >
          <div className="grid gap-6 items-start" style={{ gridTemplateColumns: '1fr auto' }}>
            <div>
              <span className="block font-serif text-[clamp(17px,2.6vw,26px)] font-normal
                text-[#E8EAEE] tracking-[0.05em] mb-[3px]">
                {product.name}
              </span>
              <span className="block font-sans text-[10.5px] font-extralight
                text-[rgba(184,190,200,0.45)] tracking-[0.14em] mb-[5px]">
                {product.nameJp}
              </span>
              <span className="block font-serif italic text-[12.5px]
                text-[rgba(200,185,150,0.42)] tracking-[0.07em]">
                {product.description}
              </span>
              {product.canCustomize && (
                <span className="inline-block mt-[10px] font-sans text-[9px]
                  tracking-[0.18em] text-[rgba(184,190,200,0.48)]
                  border border-[rgba(184,190,200,0.2)] px-[9px] py-[3px]">
                  CUSTOMIZE
                </span>
              )}
            </div>
            <span className="font-serif text-[13px] font-light
              text-[rgba(184,190,200,0.58)] tracking-[0.06em] pt-1 text-right whitespace-nowrap">
              ¥ {product.price.toLocaleString()}
            </span>
          </div>

          {!product.canCustomize && <BuyButton productId={product.id} />}
        </div>
      ))}
    </div>
  );
}
