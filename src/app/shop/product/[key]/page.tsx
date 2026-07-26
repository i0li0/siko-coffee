import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BEANS, PRICE_PER_100G } from '@/components/shop/blend/data';
import { isPaymentsEnabled } from '@/lib/payments';
import ProductClient from './ProductClient';

interface Props {
  params: Promise<{ key: string }>;
}

function getBean(key: string) {
  return BEANS.find((b) => b.key === key);
}

export async function generateStaticParams() {
  return BEANS.map((b) => ({ key: b.key }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params;
  const bean = getBean(key);
  if (!bean) return {};
  return {
    title: `${bean.name} — Sikō Coffee`,
    description: bean.desc,
  };
}

export default async function ProductPage({ params }: Props) {
  const { key } = await params;
  const bean = getBean(key);
  if (!bean) notFound();

  // 販売停止中に InStock を出し続けると構造化データが実態と食い違う（検索結果に在庫ありと出る）。
  const paymentsEnabled = isPaymentsEnabled();

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${bean.name} シングルオリジン`,
    description: bean.desc,
    brand: { '@type': 'Brand', name: 'Sikō Coffee' },
    offers: {
      '@type': 'Offer',
      price: PRICE_PER_100G * 2,
      priceCurrency: 'JPY',
      availability: paymentsEnabled
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: `https://www.sikocoffee.com/shop/product/${bean.key}`,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <ProductClient beanKey={key} paymentsEnabled={paymentsEnabled} />
    </>
  );
}
