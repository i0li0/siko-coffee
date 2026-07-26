import type { Metadata } from 'next';
import ShopApp from '@/components/shop/blend/ShopApp';
import { isPaymentsEnabled } from '@/lib/payments';

export const metadata: Metadata = {
  title: 'Shop — Sikō Coffee',
  description: 'じぶんだけのブレンドに、名前をつけて。Sikō Coffee のオンラインショップ。',
};

// 販売可否は API と同じ `isPaymentsEnabled()` を唯一の判定元にする（フラグを二重化しない）。
// サーバー側で評価して props で渡すため、再開時の手順は「env 更新 → 再デプロイ」のままでよい。
export default function ShopPage() {
  return <ShopApp paymentsEnabled={isPaymentsEnabled()} />;
}
