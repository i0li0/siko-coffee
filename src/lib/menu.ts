import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getDocClient, TABLE } from '@/lib/db';
import type { Product } from '@/types/product';

export const MENU_FALLBACK: Product[] = [
  { id: 'menu_01', name: 'Hot Coffee',     nameJp: 'ホットコーヒー',       description: 'ディカフェで、深夜でも。',   price: 500,  type: 'menu', isPublic: true, canCustomize: false },
  { id: 'menu_02', name: 'Iced Coffee',    nameJp: 'アイスコーヒー',       description: '冷たく、静かに。',           price: 500,  type: 'menu', isPublic: true, canCustomize: false },
  { id: 'menu_03', name: 'Oat Latte',      nameJp: 'オーツオレ',           description: 'やさしさが溶けている。',     price: 500,  type: 'menu', isPublic: true, canCustomize: false },
  { id: 'menu_04', name: 'Iced Oat Latte', nameJp: 'アイスオーツオレ',     description: '夜の終わりに、もう一杯。',   price: 500,  type: 'menu', isPublic: true, canCustomize: false },
  { id: 'menu_05', name: 'Decaf Beans',    nameJp: 'ディカフェ豆（100g）', description: '自宅で、あの静けさを。',     price: 1000, type: 'menu', isPublic: true, canCustomize: false },
];

export async function fetchMenuItems(): Promise<Product[]> {
  try {
    const result = await getDocClient().send(
      new ScanCommand({
        TableName: TABLE.PRODUCTS,
        FilterExpression: '#type = :menu AND isPublic = :true',
        ExpressionAttributeNames: { '#type': 'type' },
        ExpressionAttributeValues: { ':menu': 'menu', ':true': true },
      }),
    );
    const items = (result.Items ?? []) as Product[];
    const sorted = items.sort((a, b) => a.id.localeCompare(b.id));
    return sorted.length > 0 ? sorted : MENU_FALLBACK;
  } catch {
    return MENU_FALLBACK;
  }
}
