// ブレンド共創プラットフォームの型（docs/blend-platform-plan.md §11）
// 既存 src/types/admin.ts と同じスタイル（type/interface 併用・null 許容は明示）。

// ───────────────────────────────────────── 販売者（焙煎者） §11.2②

export type RoasterStatus =
  | 'pending'      // 昇格申請済み・admin 承認待ち（§13.2）
  | 'active'       // 承認済み・販売中
  | 'paused'       // 一時休止（pausedUntil 有＝T1 判定源・§6.3）
  | 'withdrawn'    // 退会
  | 'selling_out'  // 退会後の売り切り期間（optIns.allowSelloutAfterExit 時）

export type LicenseType = 'permit' | 'notification' // 許可(期限あり) / 届出(期限なし)

export interface RoasterOptIns {
  allowBlend: boolean            // 自分の豆を他者のブレンドに使ってよいか
  allowNameStory: boolean        // 名前/ストーリーの掲載可否
  allowSelloutAfterExit: boolean // 退会後の売り切り許可
}

export interface RoasterRecord {
  roasterId: string              // = userId（アカウント統一）
  displayName: string
  status: RoasterStatus
  pausedUntil?: string | null    // ISO。有ればT1/無ければT2の判定源（§6.3）
  licenseType: LicenseType
  licenseNo: string
  licenseExpiry?: string         // permit のみ（yyyy-mm-dd）
  invoiceRegNo?: string          // T番号（保持のみ・価格非連動・§6.1.1）
  termsVersion: string
  termsAgreedAt: string
  optIns: RoasterOptIns
  createdAt: string
  updatedAt: string
  // GSI license-expiry 用の非正規化キー（permit のときだけ書く＝sparse・§11.6）
  licenseGsiPk?: 'LICENSE'
}

// ───────────────────────────────────────── 掲載豆（§11.2③ / §6.2.1 申告5項目）

// 焙煎度（8段階）。ROAST_LEVELS（src/lib/validation.ts）と同期させること。
export type RoastLevel =
  | 'light'
  | 'cinnamon'
  | 'medium'
  | 'high'
  | 'city'
  | 'full_city'
  | 'french'
  | 'italian'

export type BeanOrderStatus = 'on' | 'off' | 'paused' // ⑤受注ON/OFF＋休止

export interface BeanRecord {
  beanId: string
  roasterId: string           // 所有者（= 焙煎者の userId）
  name: string                // ①掲載する豆
  greenOrigin: string         // 生豆生産国/地域（法定ラベルの素・§3.4）
  roastLevel: RoastLevel
  pricePer100g: number        // ③価格（税込・円/100g・価格決定権 §6.1.2）
  weeklyCapKg: number         // ②受注上限＝週あたり量(kg/週)・自動承認の入力源
  leadTimeDays: number        // ④リードタイム（在庫なし時のETA）
  orderStatus: BeanOrderStatus
  createdAt: string
  updatedAt: string
  // GSI list-index 用（公開カタログ）。orderStatus!=="off" のときだけ書く＝sparse。
  gsiPk?: 'BEAN#PUBLIC'
  gsiSk?: string              // = createdAt
}

// ───────────────────────────────────────── 在庫ロット（§11.2④ / §7）

export type LotStatus = 'fresh' | 'discount' | 'expired'

export interface LotRecord {
  beanId: string              // PK（= BeanRecord.beanId）
  roastDate: string           // SK（yyyy-mm-dd）＝焙煎日でロットを分ける
  roasterId: string           // 所有者。豆の owner を非正規化（ロット単体で所有者判定するため）
  onHandG: number             // 実在庫(g)
  reservedG: number           // 決済中の確保ぶん(g)・§11.2⑤
  availableG: number          // = onHandG − reservedG を**実体として保持**（下の注記参照）
  parRankG: number            // 在庫ランク上限(100g刻み・§7)
  freshBy: string             // 鮮度期限（ISO）
  status: LotStatus
  // 計測（§11.2⑦ のロールアップ元）
  purchasedG: number
  soldG: number
  wastedG: number
  createdAt: string
  updatedAt: string
  // GSI by-freshBy（鮮度切れ間近ロットの抽出）
  gsiPk: 'LOT'
  gsiSk: string               // = freshBy
}

// なぜ availableG を持つか（§13.3 の在庫確保に効く実装制約）:
// DynamoDB の ConditionExpression は**算術式を書けない**ため、計画書の
// `reservedG + qty <= onHandG` はそのままでは表現できない。
// 派生値を属性として保持すれば `availableG >= :qty` という単純比較で条件付き更新でき、
// TransactWriteItems での all-or-nothing 確保もそのまま実装できる。
// → lots への書き込みでは常に availableG = onHandG − reservedG を維持すること。

// ───────────────────────────────────────── 在庫確保（§11.2⑤ / §9）

export type ReservationState = 'held' | 'committed' | 'released'

export interface ReservationRecord {
  orderId: string             // PK
  lotKey: string              // SK = `${beanId}#${roastDate}`
  beanId: string
  roastDate: string
  roasterId: string
  qtyG: number
  state: ReservationState
  expireAt: number            // epoch"秒"（DynamoDB ネイティブTTL。確実な戻しは cron が主・§13.4）
  createdAt: string
  updatedAt: string
  gsiPk: 'RSV'                // GSI by-expire（cron が失効ぶんを Query）
}

export function lotKeyOf(beanId: string, roastDate: string): string {
  return `${beanId}#${roastDate}`
}

// ───────────────────────────────────────── 注文の調達・ラベル（§11.2⑥ / §3.4）

export type ProcurementMode = 'stock' | 'po'
export type PoStatus = 'auto_approved' | 'pending' | 'declined' | 'timeout'

export interface ProcurementEntry {
  roasterId: string
  beanId: string
  qtyG: number
  mode: ProcurementMode
  poStatus?: PoStatus         // mode==="po" のときだけ
  timeoutAt?: string          // pending の48h期限（§6.3）
  leadTimeDays?: number       // ETA の素
}

// 法定ラベル（生豆生産国・重量比）を発注時点で固定するスナップショット（§3.4）
export interface LabelSnapshotEntry {
  beanId: string
  roasterId: string
  name: string
  greenOrigin: string
  roastLevel: RoastLevel
  ratioPct: number
  grams: number
  pricePer100g: number
}

// ───────────────────────────────────────── 計測ロールアップ（§11.2⑦）

export interface RoasterMetricsRecord {
  roasterId: string           // PK
  month: string               // SK（yyyy-mm）
  gmvYen?: number
  orderCount?: number
  lostCount?: number
  purchasedG?: number
  soldG?: number
  wastedG?: number
  updatedAt?: string
}
