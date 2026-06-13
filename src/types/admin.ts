export type SaleItem = {
  date: string
  id: string
  type: string
  quantity: number
  amount: number
  customers?: number
  memo?: string
  createdAt: string
}

export type ExpenseItem = {
  yearMonth: string
  id: string
  date: string
  category: string
  amount: number
  description: string
  allocationRate: number
  allocatedAmount: number
  createdAt?: string
}

export type InventoryItem = {
  beanId: string
  name: string
  origin: string
  currentStock: number
  alertThreshold: number
  updatedAt: string
}

// ───────────────────────────────────────── 注文管理

export type OrderStatus =
  | 'pending'     // Stripe 決済完了前の事前保存（管理画面には表示しない）
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

export interface OrderItemRecord {
  name: string
  ratios: number[]
  grind?: string
  grams?: number
  custom?: boolean
  single?: boolean
  publish?: boolean
}

export interface ShippingAddress {
  postal_code?: string
  state?: string
  city?: string
  line1?: string
  line2?: string
}

export interface OrderRecord {
  id: string
  items: OrderItemRecord[]
  status: OrderStatus
  createdAt: string
  stripeSessionId?: string
  customerEmail?: string | null
  customerName?: string | null
  amount?: number | null
  currency?: string | null
  shippingAddress?: ShippingAddress | null
  shippingName?: string | null
  paidAt?: string
  // ステータス遷移のタイムスタンプ
  processingAt?: string
  shippedAt?: string
  deliveredAt?: string
  cancelledAt?: string
  refundedAt?: string
}

// ───────────────────────────────────────── ブレンド管理

export interface BlendAdminItem {
  id: string
  name: string
  ratios: number[]
  by: string
  publish: boolean
  bought: number
  comment?: string
  createdAt?: string
}
