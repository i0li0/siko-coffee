import { timingSafeEqual } from 'crypto'

// 秘密トークンの定数時間比較。長さが異なる場合も早期 return せず false を返す。
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    // 長さ漏えいを避けるためダミー比較してから false。
    timingSafeEqual(bufA, bufA)
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

// `Authorization: Bearer <secret>` ヘッダを定数時間で検証する。
export function verifyBearer(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret || !authHeader) return false
  return safeEqual(authHeader, `Bearer ${secret}`)
}
