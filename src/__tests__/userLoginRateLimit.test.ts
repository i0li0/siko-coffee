import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'

// DynamoDB をインメモリ Map で差し替えてロックアウト挙動を検証する。
const h = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  configured: true,
}))

vi.mock('@/lib/db', () => ({
  TABLE: { CONFIG: 'config' },
  isDbConfigured: () => h.configured,
  getDocClient: () => ({
    send: async (cmd: unknown) => {
      if (cmd instanceof GetCommand) {
        return { Item: h.store.get(cmd.input.Key!.configKey as string) }
      }
      if (cmd instanceof PutCommand) {
        const item = cmd.input.Item as Record<string, unknown>
        h.store.set(item.configKey as string, item)
        return {}
      }
      if (cmd instanceof DeleteCommand) {
        h.store.delete(cmd.input.Key!.configKey as string)
        return {}
      }
      return {}
    },
  }),
}))

import { checkLoginAllowed, recordLoginFailure, clearLoginFailures } from '@/lib/userLoginRateLimit'

beforeEach(() => {
  h.store.clear()
  h.configured = true
})

describe('userLoginRateLimit', () => {
  it('DB 未設定ならレート制限をスキップ（常に許可）', async () => {
    h.configured = false
    for (let i = 0; i < 30; i++) await recordLoginFailure('1.1.1.1', 'a@example.com')
    const res = await checkLoginAllowed('1.1.1.1', 'a@example.com')
    expect(res.allowed).toBe(true)
  })

  it('同一メールへの8回失敗でロックされる', async () => {
    const ip = '1.1.1.1'
    const email = 'victim@example.com'
    expect((await checkLoginAllowed(ip, email)).allowed).toBe(true)
    for (let i = 0; i < 8; i++) await recordLoginFailure(ip, email)
    const res = await checkLoginAllowed(ip, email)
    expect(res.allowed).toBe(false)
    expect(res.retryAfter).toBeGreaterThan(0)
  })

  it('成功時のクリアでロックが解ける', async () => {
    const ip = '2.2.2.2'
    const email = 'user@example.com'
    for (let i = 0; i < 5; i++) await recordLoginFailure(ip, email)
    await clearLoginFailures(ip, email)
    expect((await checkLoginAllowed(ip, email)).allowed).toBe(true)
  })

  it('同一IPから多数アカウントへの試行は20回でIPロック', async () => {
    const ip = '3.3.3.3'
    for (let i = 0; i < 20; i++) await recordLoginFailure(ip, `u${i}@example.com`)
    // 各メールは1回ずつ（メール別閾値未満）だが、IP 合算で上限に達する。
    const res = await checkLoginAllowed(ip, 'fresh@example.com')
    expect(res.allowed).toBe(false)
  })
})
