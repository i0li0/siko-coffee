// 送料ロジック（特商法ページの表記と一致させること）。
// 全国一律 ¥500、¥5,000 以上のご購入で送料無料。

export const SHIPPING_FEE = 500;
export const FREE_SHIPPING_THRESHOLD = 5000;

// 小計（送料抜き・JPY）から送料を算出する。
export function calcShipping(subtotal: number): number {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
}

// Stripe Checkout の shipping_options を生成する。
// subtotal に応じて ¥0（無料）または ¥500 の固定レートを返す。
export function buildShippingOptions(subtotal: number) {
  const amount = calcShipping(subtotal);
  return [
    {
      shipping_rate_data: {
        type: 'fixed_amount' as const,
        fixed_amount: { amount, currency: 'jpy' as const },
        display_name: amount === 0 ? '送料無料' : '全国一律',
      },
    },
  ];
}
