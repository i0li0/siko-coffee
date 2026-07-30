import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Pour Over 2: cron 4本の観測性。
// 8（EventBridge 移行）のあとは CloudWatch Logs が唯一の観測手段になるため、
// 「Sentry へ送ったか」ではなく **console にも出たか** を回帰テストで固定する。

const mockSend = vi.fn()
vi.mock('@/lib/db', () => ({
  getDocClient: () => ({ send: mockSend }),
  TABLE: { ORDERS: 'orders', CONFIG: 'config' },
  isDbConfigured: () => false,
}))
// 認可そのものは src/__tests__/cronAuth.test.ts の担当。ここは観測性だけを見る。
vi.mock('@/lib/cronAuth', () => ({ isAuthorizedCron: vi.fn(() => true) }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('@/lib/pos', () => ({ sweepPoTimeouts: vi.fn() }))
vi.mock('@/lib/reservations', () => ({
  sweepExpiredReservations: vi.fn(),
  reconcileLotReservations: vi.fn(),
}))

import * as Sentry from '@sentry/nextjs'
import { GET as poTimeouts } from '@/app/api/cron/po-timeouts/route'
import { GET as releaseReservations } from '@/app/api/cron/release-reservations/route'
import { GET as cleanupPending } from '@/app/api/cron/cleanup-pending/route'
import { GET as instagramRefresh } from '@/app/api/cron/instagram-refresh/route'
import { isAuthorizedCron } from '@/lib/cronAuth'
import { sweepPoTimeouts } from '@/lib/pos'
import { sweepExpiredReservations, reconcileLotReservations } from '@/lib/reservations'

const req = () => new Request('http://localhost/api/cron/x', { headers: { authorization: 'Bearer x' } })

let logSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

/** console.log/warn/error に出た行を1本の文字列にして返す。 */
function lines(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls.map((call) => call.map((arg) => String(arg)).join(' '))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isAuthorizedCron).mockReturnValue(true)
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('cron の観測性', () => {
  describe('po-timeouts', () => {
    it('成功すると start と件数つきの done を出す', async () => {
      vi.mocked(sweepPoTimeouts).mockResolvedValue({ timedOut: 2, skipped: 1 })

      const res = await poTimeouts(req())

      expect(res.status).toBe(200)
      expect(lines(logSpy)).toEqual([
        '[cron] cron/po-timeouts start',
        expect.stringContaining('[cron] cron/po-timeouts done'),
      ])
      expect(lines(logSpy)[1]).toContain('"timedOut":2')
    })

    it('失敗を console.error と Sentry の両方へ出す', async () => {
      vi.mocked(sweepPoTimeouts).mockRejectedValue(new Error('boom'))

      const res = await poTimeouts(req())

      expect(res.status).toBe(500)
      expect(lines(errorSpy)[0]).toContain('[cron] cron/po-timeouts fail')
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ tags: { route: 'cron/po-timeouts' } }),
      )
    })
  })

  describe('release-reservations', () => {
    it('成功すると released / reconciled を done に含める', async () => {
      vi.mocked(sweepExpiredReservations).mockResolvedValue(3)
      vi.mocked(reconcileLotReservations).mockResolvedValue({ checked: 1, fixed: 0 } as never)

      const res = await releaseReservations(req())

      expect(res.status).toBe(200)
      expect(lines(logSpy)[1]).toContain('"released":3')
    })

    it('失敗を console.error と Sentry の両方へ出す', async () => {
      vi.mocked(sweepExpiredReservations).mockRejectedValue(new Error('boom'))

      const res = await releaseReservations(req())

      expect(res.status).toBe(500)
      expect(lines(errorSpy)[0]).toContain('[cron] cron/release-reservations fail')
      expect(Sentry.captureException).toHaveBeenCalledOnce()
    })
  })

  describe('cleanup-pending', () => {
    const stalePending = {
      Items: [{ id: 'order-1', status: 'pending', createdAt: '2020-01-01T00:00:00.000Z' }],
    }

    it('削除件数を done に出す', async () => {
      mockSend.mockResolvedValueOnce(stalePending).mockResolvedValueOnce({})

      const res = await cleanupPending(req())

      expect(await res.json()).toEqual({ deleted: 1 })
      expect(lines(logSpy)[1]).toContain('"deleted":1')
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('条件不一致（すでに paid）は skipped として数え、エラー扱いしない', async () => {
      const conditional = Object.assign(new Error('conditional'), {
        name: 'ConditionalCheckFailedException',
      })
      mockSend.mockResolvedValueOnce(stalePending).mockRejectedValueOnce(conditional)

      const res = await cleanupPending(req())

      expect(await res.json()).toEqual({ deleted: 0 })
      expect(lines(logSpy)[1]).toContain('"skipped":1')
      expect(errorSpy).not.toHaveBeenCalled()
      expect(Sentry.captureException).not.toHaveBeenCalled()
    })

    it('条件不一致以外の削除エラーは握り潰さない', async () => {
      const throttled = Object.assign(new Error('slow down'), {
        name: 'ProvisionedThroughputExceededException',
      })
      mockSend.mockResolvedValueOnce(stalePending).mockRejectedValueOnce(throttled)

      const res = await cleanupPending(req())

      expect(res.status).toBe(200)
      expect(lines(errorSpy)[0]).toContain('[cron] cron/cleanup-pending fail')
      expect(Sentry.captureException).toHaveBeenCalledOnce()
    })

    it('Scan の失敗を console.error と Sentry の両方へ出す', async () => {
      mockSend.mockRejectedValueOnce(new Error('scan failed'))

      const res = await cleanupPending(req())

      expect(res.status).toBe(500)
      expect(lines(errorSpy)[0]).toContain('[cron] cron/cleanup-pending fail')
      expect(Sentry.captureException).toHaveBeenCalledOnce()
    })
  })

  describe('instagram-refresh', () => {
    const sixtyDays = 60 * 86400

    it('成功すると残日数つきの done を出す', async () => {
      mockSend.mockResolvedValueOnce({ Item: { value: 'old-token' } }).mockResolvedValueOnce({})
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'new-token', expires_in: sixtyDays }), {
          status: 200,
        }),
      ))

      const res = await instagramRefresh(req())

      expect(res.status).toBe(200)
      expect(lines(logSpy)[1]).toContain('"expiresInDays":60')
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('残りが短いトークンは warning として通知する', async () => {
      mockSend.mockResolvedValueOnce({ Item: { value: 'old-token' } }).mockResolvedValueOnce({})
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'new-token', expires_in: 5 * 86400 }), {
          status: 200,
        }),
      ))

      await instagramRefresh(req())

      expect(lines(warnSpy)[0]).toContain('expires soon')
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('expires soon'),
        expect.objectContaining({ level: 'warning' }),
      )
    })

    // 🔴 従来は fetch() 自体の例外と PutCommand が裸だった（＝落ちても誰も気づかない）。
    it('fetch の例外を phase つきで報告する', async () => {
      mockSend.mockResolvedValueOnce({ Item: { value: 'old-token' } })
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

      const res = await instagramRefresh(req())

      expect(res.status).toBe(500)
      expect(lines(errorSpy)[0]).toContain('[cron] cron/instagram-refresh fail')
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ extra: { phase: 'refresh' } }),
      )
    })

    it('保存（PutCommand）の例外を phase つきで報告する', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: { value: 'old-token' } })
        .mockRejectedValueOnce(new Error('put failed'))
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'new-token', expires_in: sixtyDays }), {
          status: 200,
        }),
      ))

      const res = await instagramRefresh(req())

      expect(res.status).toBe(500)
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ extra: { phase: 'persist' } }),
      )
    })

    it('非 200 応答を alert として通知する', async () => {
      mockSend.mockResolvedValueOnce({ Item: { value: 'old-token' } })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad token', { status: 400 })))

      const res = await instagramRefresh(req())

      expect(res.status).toBe(502)
      expect(lines(errorSpy)[0]).toContain('refresh request failed')
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('refresh request failed'),
        expect.objectContaining({ level: 'error' }),
      )
    })

    it('トークンが1つも無い場合を alert として通知する', async () => {
      const saved = process.env.INSTAGRAM_ACCESS_TOKEN
      delete process.env.INSTAGRAM_ACCESS_TOKEN
      mockSend.mockResolvedValueOnce({})

      const res = await instagramRefresh(req())

      expect(res.status).toBe(500)
      expect(lines(errorSpy)[0]).toContain('no Instagram token found')
      expect(Sentry.captureMessage).toHaveBeenCalledOnce()
      if (saved !== undefined) process.env.INSTAGRAM_ACCESS_TOKEN = saved
    })

    it('設定テーブルが読めない場合は warning を出して env var へ退避する', async () => {
      process.env.INSTAGRAM_ACCESS_TOKEN = 'env-token'
      mockSend.mockRejectedValueOnce(new Error('table missing')).mockResolvedValueOnce({})
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'new-token', expires_in: sixtyDays }), {
          status: 200,
        }),
      ))

      const res = await instagramRefresh(req())

      expect(res.status).toBe(200)
      expect(lines(warnSpy)[0]).toContain('falling back to env var')
      delete process.env.INSTAGRAM_ACCESS_TOKEN
    })
  })

  it('認証に失敗したら何も実行せずログも出さない', async () => {
    vi.mocked(isAuthorizedCron).mockReturnValue(false)

    const res = await poTimeouts(req())

    expect(res.status).toBe(401)
    expect(logSpy).not.toHaveBeenCalled()
    expect(sweepPoTimeouts).not.toHaveBeenCalled()
  })
})
