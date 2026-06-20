export type ProductStatus = 'active' | 'paused' | 'discontinued';

export interface Product {
  id: string;
  name: string;
  nameJp: string;
  price: number;
  description: string;
  type: string;
  isPublic: boolean;
  canCustomize: boolean;
  status: ProductStatus;
  recipe?: string;
  unit?: string;
  sortOrder?: number;
}
