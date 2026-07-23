// §6.3「運用パラメータ（暫定既定・要再調整）」の外出し。
// 計画書の指示どおり**ハードコードせず設定値**にする＝コード改修なしに env で変えられる。
// ローンチ後に実測（差替頻度・失注率・鮮度廃棄）で再調整する前提の初期値。

function num(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

// 発注の無応答タイムアウト（§6.2-5・既定48h）
export const PO_TIMEOUT_HOURS = num('PLATFORM_PO_TIMEOUT_HOURS', 48)

// T1 課金後の遅延閾値 Δ（日）。Δ<=silent はサイレント、<=choice は選択肢提示、超は能動選択必須。
export const DELAY_SILENT_DAYS = num('PLATFORM_DELAY_SILENT_DAYS', 3)
export const DELAY_CHOICE_DAYS = num('PLATFORM_DELAY_CHOICE_DAYS', 7)

// 差替の推薦バンド／吸収バンド（円/100g）。|Δ| がこの範囲なら Sikō が飲む＝価格据え置き。
export const SUBSTITUTION_BAND_YEN_PER_100G = num('PLATFORM_SUBSTITUTION_BAND_YEN', 100)

export function poTimeoutAt(from: Date = new Date()): string {
  return new Date(from.getTime() + PO_TIMEOUT_HOURS * 3600 * 1000).toISOString()
}
