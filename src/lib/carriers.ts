// 配送業者と追跡URLの生成。発送時に管理画面で「業者＋追跡番号」を手入力する。

export interface Carrier {
  id: string
  label: string
  // 追跡番号を埋め込んで追跡URLを生成する。
  trackingUrl: (n: string) => string
}

export const CARRIERS: Carrier[] = [
  {
    id: 'yamato',
    label: 'ヤマト運輸',
    trackingUrl: (n) =>
      `https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?number=${encodeURIComponent(n)}`,
  },
  {
    id: 'japanpost',
    label: '日本郵便',
    trackingUrl: (n) =>
      `https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=${encodeURIComponent(n)}&searchKind=S002&locale=ja`,
  },
  {
    id: 'clickpost',
    label: 'クリックポスト',
    trackingUrl: (n) =>
      `https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=${encodeURIComponent(n)}&searchKind=S002&locale=ja`,
  },
  {
    id: 'sagawa',
    label: '佐川急便',
    trackingUrl: (n) =>
      `https://k2k.sagawa-exp.co.jp/p/web/okurijoinput.do?okurijoNo=${encodeURIComponent(n)}`,
  },
]

export function getCarrier(id: string | undefined | null): Carrier | undefined {
  return CARRIERS.find((c) => c.id === id)
}

// 業者IDと追跡番号から追跡URLを生成する（不明な業者なら undefined）。
export function buildTrackingUrl(carrierId: string, trackingNumber: string): string | undefined {
  return getCarrier(carrierId)?.trackingUrl(trackingNumber)
}

export function carrierLabel(id: string | undefined | null): string {
  return getCarrier(id)?.label ?? (id ?? '')
}
