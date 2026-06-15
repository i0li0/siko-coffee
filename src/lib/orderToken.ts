// 注文照会リンク用の HMAC トークン。会員登録なしで「本人のみ」が
// /shop/order/[id] を閲覧できるよう、注文ID を署名して URL に載せる。
// adminSession.ts と同じ WebCrypto HMAC パターンを踏襲。
//
// 新形式は有効期限付き（`{expPayload}.{sig}`）。旧形式（注文IDのみを署名した
// 期限なしトークン）も検証可能にして、既に送信済みメール内のリンクを壊さない。

const TOKEN_TTL_SEC = 60 * 60 * 24 * 180 // 180 days

function getSecret(): string {
  const secret = process.env.ORDER_TOKEN_SECRET
  if (!secret) throw new Error('ORDER_TOKEN_SECRET is not set')
  return secret
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function sign(data: string): Promise<string> {
  const key = await getKey(getSecret())
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return Buffer.from(sig).toString('base64url')
}

async function verify(data: string, sigB64: string): Promise<boolean> {
  const key = await getKey(getSecret())
  return crypto.subtle.verify(
    'HMAC',
    key,
    Buffer.from(sigB64, 'base64url'),
    new TextEncoder().encode(data),
  )
}

// 注文ID から照会トークンを生成する（有効期限付き・新形式）。
export async function signOrderToken(orderId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC
  const expPayload = Buffer.from(JSON.stringify({ exp })).toString('base64url')
  const sig = await sign(`${orderId}.${expPayload}`)
  return `${expPayload}.${sig}`
}

// トークンが当該注文IDのものとして正しいか検証する。
// 新形式（期限付き）と旧形式（期限なし）の両方を受け付ける。
export async function verifyOrderToken(orderId: string, token: string): Promise<boolean> {
  try {
    if (!orderId || !token) return false

    const dotIndex = token.lastIndexOf('.')
    if (dotIndex !== -1) {
      // 新形式: {expPayload}.{sig}
      const expPayload = token.slice(0, dotIndex)
      const sig = token.slice(dotIndex + 1)
      if (!expPayload || !sig) return false
      if (!(await verify(`${orderId}.${expPayload}`, sig))) return false
      const { exp } = JSON.parse(Buffer.from(expPayload, 'base64url').toString())
      return typeof exp === 'number' && exp > Math.floor(Date.now() / 1000)
    }

    // 旧形式: 注文IDのみを署名した期限なしトークン（後方互換）。
    return await verify(orderId, token)
  } catch {
    return false
  }
}
