export type CategoryKey = 'all' | 'bean' | 'drip' | 'goods';

export interface ShopCategory {
  key: CategoryKey;
  label: string;
  labelJp: string;
  available: boolean;
}

export const SHOP_CATEGORIES: ShopCategory[] = [
  { key: 'all',   label: 'All',      labelJp: 'すべて',         available: true  },
  { key: 'bean',  label: 'Beans',    labelJp: '珈琲豆',         available: true  },
  { key: 'drip',  label: 'Drip Bag', labelJp: 'ドリップバッグ', available: false },
  { key: 'goods', label: 'Goods',    labelJp: 'グッズ',         available: false },
];
