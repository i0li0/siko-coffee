import type { Metadata } from 'next';
import ShopApp from '@/components/shop/blend/ShopApp';

export const metadata: Metadata = {
  title: 'Shop — Sikō Coffee',
  description: 'じぶんだけのブレンドに、名前をつけて。Sikō Coffee のオンラインショップ。',
};

export default function ShopPage() {
  return <ShopApp />;
}
