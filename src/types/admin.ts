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
