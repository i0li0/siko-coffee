import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import Nav from '@/components/layout/Nav';
import Footer from '@/components/layout/Footer';
import type { Product } from '@/types/product';

export const preferredRegion = ['hnd1'];
export const dynamic = 'force-dynamic';

async function getProducts(): Promise<Product[]> {
  const client = new DynamoDBClient({ region: 'ap-northeast-1' });
  const docClient = DynamoDBDocumentClient.from(client);
  const result = await docClient.send(
    new ScanCommand({ TableName: 'siko-coffee-products' }),
  );
  const items = (result.Items ?? []) as Product[];
  return items
    .filter((p) => p.isPublic)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export const metadata = {
  title: 'Shop — Sikō Coffee',
  description: '静けさを、持ち帰る。 Sikō Coffee のオンラインショップ。',
};

export default async function ShopPage() {
  const products = await getProducts();

  return (
    <>
      <Nav visible logoHref="/" />

      <main className="relative min-h-screen z-[1]">
        {/* Back link */}
        <div className="relative z-[2] pt-[110px] px-20 max-[700px]:pt-[88px] max-[700px]:px-[22px]">
          <a
            href="/"
            className="inline-block font-serif italic text-[11.5px] tracking-[0.14em]
              text-[rgba(200,169,110,0.38)] no-underline
              border-b border-[rgba(200,169,110,0.15)] pb-[1px]
              transition-colors duration-300 hover:text-[#c8a96e]"
          >
            ← Sikō Coffee
          </a>
        </div>

        {/* Section */}
        <section className="relative z-[2] flex items-start justify-center
          py-[60px] px-20 max-[700px]:py-[44px] max-[700px]:px-[22px]">
          <div className="w-full max-w-[660px] relative max-[700px]:max-w-full">

            {/* Decorative background text */}
            <span
              className="font-serif font-light absolute top-1/2 left-1/2
                -translate-x-[60%] -translate-y-1/2 whitespace-nowrap
                pointer-events-none select-none tracking-[0.05em]
                text-[clamp(60px,16vw,160px)] text-[rgba(255,255,255,0.03)]"
              aria-hidden="true"
            >
              shop
            </span>

            {/* Header */}
            <div className="mb-[56px] max-[700px]:mb-[40px]">
              <h1 className="font-serif font-light text-[clamp(22px,3.5vw,36px)]
                text-[#f0ebe0] tracking-[0.08em] mb-[10px]">
                Shop
              </h1>
              <p className="font-serif italic text-[13px]
                text-[rgba(200,169,110,0.38)] tracking-[0.1em]">
                静けさを、持ち帰る。
              </p>
            </div>

            {/* Product list */}
            {products.length === 0 ? (
              <p className="font-serif italic text-[13px] text-[rgba(240,235,224,0.3)]
                tracking-[0.08em] text-center py-[60px]">
                現在、商品はございません。
              </p>
            ) : (
              products.map((product) => (
                <div
                  key={product.id}
                  className="py-[26px] border-b border-[rgba(240,235,224,0.08)]
                    grid gap-6 items-start cursor-default
                    first:border-t first:border-[rgba(240,235,224,0.08)]"
                  style={{ gridTemplateColumns: '1fr auto' }}
                >
                  <div>
                    <span className="block font-serif text-[clamp(17px,2.6vw,26px)] font-normal
                      text-[#f0ebe0] tracking-[0.05em] mb-[3px]">
                      {product.name}
                    </span>
                    <span className="block font-sans text-[10.5px] font-extralight
                      text-[rgba(200,169,110,0.45)] tracking-[0.14em] mb-[5px]">
                      {product.nameJp}
                    </span>
                    <span className="block font-serif italic text-[12.5px]
                      text-[rgba(200,185,150,0.42)] tracking-[0.07em]">
                      {product.description}
                    </span>
                    {product.canCustomize && (
                      <span className="inline-block mt-[10px] font-sans text-[9px]
                        tracking-[0.18em] text-[rgba(200,169,110,0.48)]
                        border border-[rgba(200,169,110,0.2)] px-[9px] py-[3px]">
                        CUSTOMIZE
                      </span>
                    )}
                  </div>
                  <span className="font-serif text-[13px] font-light
                    text-[rgba(200,169,110,0.58)] tracking-[0.06em] pt-1 text-right whitespace-nowrap">
                    ¥ {product.price.toLocaleString()}
                  </span>
                </div>
              ))
            )}

            {/* Contact note */}
            <p className="mt-[52px] font-serif italic text-[11.5px]
              text-[rgba(240,235,224,0.2)] tracking-[0.08em] text-center leading-[2.2]">
              ご注文・お問い合わせは{' '}
              <a
                href="mailto:siko.is.coffee@gmail.com"
                className="text-[rgba(200,169,110,0.45)] no-underline
                  border-b border-[rgba(200,169,110,0.2)] pb-[1px]
                  transition-colors duration-300 hover:text-[#c8a96e]"
              >
                siko.is.coffee@gmail.com
              </a>
              {' '}まで。
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
