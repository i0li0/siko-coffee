import { Suspense } from 'react';
import Link from 'next/link';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import Nav from '@/components/layout/Nav';
import Footer from '@/components/layout/Footer';
import ShopSidebar from '@/components/shop/ShopSidebar';
import ShopProductList from '@/components/shop/ShopProductList';
import type { Product } from '@/types/product';
import { SHOP_CATEGORIES, type CategoryKey } from '@/lib/shopCategories';

export const preferredRegion = ['hnd1'];
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Shop — Sikō Coffee',
  description: '静けさを、持ち帰る。 Sikō Coffee のオンラインショップ。',
};

async function getProducts(): Promise<Product[]> {
  const client = new DynamoDBClient({ region: 'ap-northeast-1' });
  const docClient = DynamoDBDocumentClient.from(client);
  const result = await docClient.send(
    new ScanCommand({ TableName: 'siko-coffee-products' }),
  );
  const items = (result.Items ?? []) as Product[];
  return items
    .filter((p) => p.isPublic && p.type !== 'menu')
    .sort((a, b) => a.id.localeCompare(b.id));
}

function filterProducts(products: Product[], category: CategoryKey): Product[] {
  if (category === 'all') return products;
  return products.filter((p) => p.type === category);
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category: rawCategory } = await searchParams;

  // 不正な値はデフォルト 'all' にフォールバック
  const validKeys = SHOP_CATEGORIES.map((c) => c.key);
  const category: CategoryKey = validKeys.includes(rawCategory as CategoryKey)
    ? (rawCategory as CategoryKey)
    : 'all';

  const allProducts = await getProducts();
  const filtered = filterProducts(allProducts, category);

  return (
    <>
      <Nav visible logoHref="/" />

      <main className="relative min-h-screen z-[1]">
        {/* Back link */}
        <div className="relative z-[2] pt-[110px] px-20 max-[760px]:pt-[88px] max-[760px]:px-[22px]">
          <Link
            href="/"
            className="inline-block font-serif italic text-[11.5px] tracking-[0.14em]
              text-[rgba(184,190,200,0.38)] no-underline
              border-b border-[rgba(184,190,200,0.15)] pb-[1px]
              transition-colors duration-300 hover:text-[#B8BEC8]"
          >
            ← Sikō Coffee
          </Link>
        </div>

        {/* Header */}
        <div className="relative z-[2] pt-[44px] pb-[48px] px-20
          max-[760px]:pt-[32px] max-[760px]:pb-[36px] max-[760px]:px-[22px]">

          {/* Decorative background text */}
          <span
            className="font-serif font-light absolute top-1/2 left-1/2
              -translate-x-[55%] -translate-y-1/2 whitespace-nowrap
              pointer-events-none select-none tracking-[0.05em]
              text-[clamp(60px,16vw,160px)] text-[rgba(255,255,255,0.025)]"
            aria-hidden="true"
          >
            shop
          </span>

          <h1 className="relative font-serif font-light text-[clamp(22px,3.5vw,36px)]
            text-[#E8EAEE] tracking-[0.08em] mb-[10px]">
            Shop
          </h1>
          <p className="relative font-serif italic text-[13px]
            text-[rgba(184,190,200,0.38)] tracking-[0.1em]">
            静けさを、持ち帰る。
          </p>
        </div>

        {/* Content: sidebar + products
            flex-col on mobile (sidebar=tabs above, products below)
            flex-row on desktop (sidebar left, products right)        */}
        <section className="relative z-[2] px-20 pb-[80px]
          max-[760px]:px-[22px] max-[760px]:pb-[60px]">
          <div className="flex flex-col min-[760px]:flex-row gap-[48px] items-start">

            {/* Sidebar — renders mobile tabs on small, desktop aside on large */}
            <Suspense fallback={null}>
              <ShopSidebar />
            </Suspense>

            {/* Product list */}
            <div className="flex-1 min-w-0 max-w-[660px]">
              <ShopProductList products={filtered} category={category} />

              {/* Contact note */}
              <p className="mt-[52px] font-serif italic text-[11.5px]
                text-[rgba(232,234,238,0.2)] tracking-[0.08em] text-center leading-[2.2]">
                カスタムオーダー・お問い合わせは{' '}
                <a
                  href="mailto:siko.is.coffee@gmail.com"
                  className="text-[rgba(184,190,200,0.45)] no-underline
                    border-b border-[rgba(184,190,200,0.2)] pb-[1px]
                    transition-colors duration-300 hover:text-[#B8BEC8]"
                >
                  siko.is.coffee@gmail.com
                </a>
                {' '}まで。
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
