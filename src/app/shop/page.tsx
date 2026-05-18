'use client';

import { useEffect, useState } from 'react';
import Footer from '@/components/layout/Footer';
import Nav from '@/components/layout/Nav';

type Product = {
  id: string;
  name: string;
  nameJp: string;
  price: number;
  description: string;
  canCustomize: boolean;
  type: string;
};

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/products')
      .then((res) => res.json())
      .then((data) => {
        setProducts(data);
        setLoading(false);
      });
  }, []);

  return (
    <>
      <Nav visible />

      <main
        className="relative min-h-screen z-[2] px-20 py-[130px]
        max-[700px]:px-[22px] max-[700px]:py-[90px]"
      >
        {/* タイトル */}
        <div className="mb-[72px] text-center relative">
          <span
            className="font-serif font-light absolute top-1/2 left-1/2
              -translate-x-1/2 -translate-y-1/2 whitespace-nowrap
              pointer-events-none select-none tracking-[0.05em]
              text-[clamp(60px,16vw,160px)] text-[rgba(255,255,255,0.03)]"
            aria-hidden="true"
          >
            shop
          </span>
          <h1
            className="relative font-serif font-light text-[clamp(22px,3.5vw,38px)]
            tracking-[0.18em] text-[#f0ebe0]"
          >
            Shop
          </h1>
          <p
            className="font-serif italic text-[12.5px] tracking-[0.12em]
            text-[rgba(200,169,110,0.45)] mt-3"
          >
            ディカフェの静けさを、あなたの日常に。
          </p>
        </div>

        {/* 商品リスト */}
        {loading ? (
          <p
            className="text-center font-serif italic text-[rgba(240,235,224,0.2)]
            tracking-[0.1em] text-[13px]"
          >
            loading...
          </p>
        ) : (
          <div className="max-w-[660px] mx-auto">
            {products.map((product, i) => (
              <div
                key={product.id}
                className="py-[32px] border-b border-[rgba(240,235,224,0.08)]
                  grid gap-6 items-start
                  first:border-t first:border-[rgba(240,235,224,0.08)]"
                style={{ gridTemplateColumns: '1fr auto' }}
              >
                <div>
                  <span
                    className="block font-serif text-[clamp(17px,2.6vw,26px)]
                    font-normal text-[#f0ebe0] tracking-[0.05em] mb-[3px]"
                  >
                    {product.name}
                  </span>
                  <span
                    className="block font-sans text-[10.5px] font-extralight
                    text-[rgba(200,169,110,0.45)] tracking-[0.14em] mb-[5px]"
                  >
                    {product.nameJp}
                  </span>
                  <span
                    className="block font-serif italic text-[12.5px]
                    text-[rgba(200,185,150,0.42)] tracking-[0.07em] mb-[16px]"
                  >
                    {product.description}
                  </span>

                  {/* カスタマイズバッジ */}
                  {product.canCustomize && (
                    <span
                      className="inline-block font-sans text-[9.5px]
                      font-extralight tracking-[0.16em]
                      border border-[rgba(200,169,110,0.3)]
                      text-[rgba(200,169,110,0.6)]
                      px-[10px] py-[3px]"
                    >
                      CUSTOMIZE
                    </span>
                  )}
                </div>

                <div className="flex flex-col items-end gap-3 pt-1">
                  <span
                    className="font-serif text-[13px] font-light
                    text-[rgba(200,169,110,0.58)] tracking-[0.06em]"
                  >
                    ¥ {product.price.toLocaleString()}
                  </span>
                  <button
                    className="font-sans text-[10px] font-extralight
                    tracking-[0.16em] border border-[rgba(200,169,110,0.25)]
                    text-[rgba(200,169,110,0.5)] px-[14px] py-[6px]
                    transition-all duration-300
                    hover:border-[rgba(200,169,110,0.7)]
                    hover:text-[rgba(200,169,110,0.9)]"
                  >
                    ORDER →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </>
  );
}
