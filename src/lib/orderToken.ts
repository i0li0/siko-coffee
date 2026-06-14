// 注文照会リンク用の HMAC トークン。会員登録なしで「本人のみ」が
// /shop/order/[id] を閲覧できるよう、注文ID を署名して URL に載せる。
// adminSession.ts と同じ WebCrypto HMAC パターンを踏襲。

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

// 注文ID から照会トークンを生成する。
export async function signOrderToken(orderId: string): Promise<string> {
  const key = await getKey(getSecret())
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(orderId))
  return Buffer.from(sig).toString('base64url')
}

// トークンが当該注文IDのものとして正しいか検証する。
export async function verifyOrderToken(orderId: string, token: string): Promise<boolean> {
  try {
    if (!orderId || !token) return false
    const key = await getKey(getSecret())
    return await crypto.subtle.verify(
      'HMAC',
      key,
      Buffer.from(token, 'base64url'),
      new TextEncoder().encode(orderId),
    )
  } catch {
    return false
  }
}
