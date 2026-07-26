import CatalogClient from './CatalogClient'
import { isPaymentsEnabled } from '@/lib/payments'

export const metadata = { title: '焙煎家の豆でつくる — Sikō Coffee' }
export const dynamic = 'force-dynamic'

// 公開カタログからのブレンド作成（§14.4）。閲覧・作成は認証不要（決済で Stripe が email を取る）。
export default function CatalogPage() {
  return <CatalogClient paymentsEnabled={isPaymentsEnabled()} />
}
