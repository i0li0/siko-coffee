import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockSend = vi.fn()
vi.mock('@/lib/db', () => ({
  getDocClient: () => ({ send: mockSend }),
  TABLE: { POS: 'pos', ORDERS: 'orders', ROASTERS: 'roasters' },
  isDbConfigured: () => false,
}))
vi.mock('@/lib/roasterAuth', () => ({ requireRoaster: vi.fn(), getOwnedBean: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({ checkGeneralRateLimit: vi.fn(), getClientIp: vi.fn() }))
vi.mock('@/lib/cronAuth', () => ({ isAuthorizedCron: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { GET as listPos } from '@/app/api/roaster/pos/route'
import { POST as respond } from '@/app/api/roaster/pos/[orderId]/respond/route'
import { GET as poTimeouts } from '@/app/api/cron/po-timeouts/route'
import { requireRoaster } from '@/lib/roasterAuth'
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit'
import { isAuthorizedCron } from '@/lib/cronAuth'
import type { PoRecord, RoasterRecord } from '@/types/platform'

const ROASTER_ID = 'roaster-1'
const ORDER_ID = 'order-1'
const BEAN_ID = 'bean-1'

const roaster = { roasterId: ROASTER_ID, status: 'active' } as RoasterRecord

const po: PoRecord = {
  roasterId: ROASTER_ID,
  poKey: `${ORDER_ID}#${BEAN_ID}`,
  orderId: ORDER_ID,
  beanId: BEAN_ID,
  beanName: 'テスト豆',
  qtyG: 300,
  poStatus: 'pending',
  timeoutAt: '2026-07-25T00:00:00.000Z',
  createdAt: '2026-07-23T00:00:00.000Z',
  updatedAt: '2026-07-23T00:00:00.000Z',
  gsiPk: 'PO#pending',
  gsiSk: '2026-07-25T00:00:00.000Z',
}

function sentCommands(name: string) {
  return mockSend.mock.calls.map((c) => c[0]).filter((cmd) => cmd.constructor.name === name)
}

function orderUpdate() {
  return sentCommands('UpdateCommand').find((cmd) => cmd.input.TableName === 'orders')
}

function respondRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/roaster/pos/${ORDER_ID}/respond`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const respondParams = { params: Promise.resolve({ orderId: ORDER_ID }) }

function conditionalFailure() {
  const err = new Error('conditional') as Error & { name: string }
  err.name = 'ConditionalCheckFailedException'
  return err
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getClientIp).mockReturnValue('1.2.3.4')
  vi.mocked(checkGeneralRateLimit).mockResolvedValue({ allowed: true })
  vi.mocked(requireRoaster).mockResolvedValue({ ok: true, userId: ROASTER_ID, roaster })
  vi.mocked(isAuthorizedCron).mockReturnValue(true)
})

describe('GET /api/roaster/pos', () => {
  it('自分宛の発注を PK Query で返し、要対応件数を添える', async () => {
    mockSend.mockResolvedValue({ Items: [po, { ...po, poKey: 'x', poStatus: 'accepted' }] })
    const res = await listPos(new NextRequest('http://localhost/api/roaster/pos'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { pos: PoRecord[]; pendingCount: number }
    expect(body.pos).toHaveLength(2)
    expect(body.pendingCount).toBe(1)
    const queries = sentCommands('QueryCommand').map((c) => c.input.KeyConditionExpression)
    // 期限切れの sweep（GSI）→ 自分宛の一覧（PK）の順で引く。Scan は使わない。
    expect(queries).toContain('gsiPk = :pk AND gsiSk <= :until')
    expect(queries).toContain('roasterId = :rid')
  })

  it('status で絞り込める', async () => {
    mockSend.mockResolvedValue({ Items: [po, { ...po, poKey: 'x', poStatus: 'accepted' }] })
    const res = await listPos(new NextRequest('http://localhost/api/roaster/pos?status=accepted'))
    const body = (await res.json()) as { pos: PoRecord[] }
    expect(body.pos.map((p) => p.poStatus)).toEqual(['accepted'])
  })

  it('active 焙煎者でなければガードの応答をそのまま返す', async () => {
    vi.mocked(requireRoaster).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    })
    expect((await listPos(new NextRequest('http://localhost/api/roaster/pos'))).status).toBe(403)
  })
})

describe('POST /api/roaster/pos/[orderId]/respond', () => {
  it('承認すると accepted になり、注文側の procurement も揃う', async () => {
    mockSend.mockImplementation(async (cmd: { constructor: { name: string }; input: { TableName?: string } }) => {
      if (cmd.constructor.name === 'UpdateCommand' && cmd.input.TableName === 'pos') {
        return { Attributes: { ...po, poStatus: 'accepted' } }
      }
      if (cmd.constructor.name === 'GetCommand') {
        return { Item: { procurement: [{ beanId: BEAN_ID, roasterId: ROASTER_ID, mode: 'po', poStatus: 'pending' }] } }
      }
      return {}
    })

    const res = await respond(respondRequest({ beanId: BEAN_ID, decision: 'accept' }), respondParams)
    expect(res.status).toBe(200)
    expect((await res.json()).poStatus).toBe('accepted')
    expect(orderUpdate()?.input.ExpressionAttributeValues[':p'][0].poStatus).toBe('accepted')
  })

  it('辞退すると注文に例外が立つ（休止・復帰未定なら T2）', async () => {
    vi.mocked(requireRoaster).mockResolvedValue({
      ok: true,
      userId: ROASTER_ID,
      roaster: { ...roaster, status: 'paused' } as RoasterRecord,
    })
    mockSend.mockImplementation(async (cmd: { constructor: { name: string }; input: { TableName?: string; ProjectionExpression?: string } }) => {
      if (cmd.constructor.name === 'UpdateCommand' && cmd.input.TableName === 'pos') {
        return { Attributes: { ...po, poStatus: 'declined' } }
      }
      if (cmd.constructor.name === 'GetCommand') {
        return { Item: { procurement: [{ beanId: BEAN_ID, mode: 'po' }], status: 'paid' } }
      }
      return {}
    })

    const res = await respond(respondRequest({ beanId: BEAN_ID, decision: 'decline' }), respondParams)
    expect(res.status).toBe(200)

    const exceptionUpdate = sentCommands('UpdateCommand').find(
      (cmd) => cmd.input.TableName === 'orders' && cmd.input.ExpressionAttributeValues[':e'],
    )
    expect(exceptionUpdate?.input.ExpressionAttributeValues[':e']).toMatchObject({
      type: 'T2',
      phase: 'post_charge',
      reason: 'declined',
      beanId: BEAN_ID,
    })
  })

  it('退会済みなら T3（「待つ」を出さない欠け方）', async () => {
    vi.mocked(requireRoaster).mockResolvedValue({
      ok: true,
      userId: ROASTER_ID,
      roaster: { ...roaster, status: 'withdrawn' } as RoasterRecord,
    })
    mockSend.mockImplementation(async (cmd: { constructor: { name: string }; input: { TableName?: string } }) => {
      if (cmd.constructor.name === 'UpdateCommand' && cmd.input.TableName === 'pos') {
        return { Attributes: { ...po, poStatus: 'declined' } }
      }
      if (cmd.constructor.name === 'GetCommand') return { Item: { procurement: [], status: 'pending' } }
      return {}
    })

    await respond(respondRequest({ beanId: BEAN_ID, decision: 'decline' }), respondParams)
    const exceptionUpdate = sentCommands('UpdateCommand').find(
      (cmd) => cmd.input.TableName === 'orders' && cmd.input.ExpressionAttributeValues[':e'],
    )
    expect(exceptionUpdate?.input.ExpressionAttributeValues[':e']).toMatchObject({ type: 'T3', phase: 'pre_charge' })
  })

  it('pending でない発注への応答は 409（遅延応答を弾く）', async () => {
    mockSend.mockRejectedValue(conditionalFailure())
    const res = await respond(respondRequest({ beanId: BEAN_ID, decision: 'accept' }), respondParams)
    expect(res.status).toBe(409)
  })

  it('decision が不正なら 400', async () => {
    const res = await respond(respondRequest({ beanId: BEAN_ID, decision: 'maybe' }), respondParams)
    expect(res.status).toBe(400)
  })
})

describe('GET /api/cron/po-timeouts', () => {
  it('CRON_SECRET が合わなければ 401', async () => {
    vi.mocked(isAuthorizedCron).mockReturnValue(false)
    const res = await poTimeouts(new Request('http://localhost/api/cron/po-timeouts'))
    expect(res.status).toBe(401)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('期限切れの pending を timeout にし、注文へ例外を立てる', async () => {
    mockSend.mockImplementation(async (cmd: { constructor: { name: string }; input: { TableName?: string } }) => {
      if (cmd.constructor.name === 'QueryCommand') return { Items: [po] }
      if (cmd.constructor.name === 'UpdateCommand' && cmd.input.TableName === 'pos') {
        return { Attributes: { ...po, poStatus: 'timeout' } }
      }
      if (cmd.constructor.name === 'GetCommand' && cmd.input.TableName === 'roasters') {
        return { Item: { ...roaster, status: 'paused', pausedUntil: '2026-08-01' } }
      }
      if (cmd.constructor.name === 'GetCommand') return { Item: { procurement: [], status: 'paid' } }
      return {}
    })

    const res = await poTimeouts(new Request('http://localhost/api/cron/po-timeouts'))
    expect(await res.json()).toEqual({ timedOut: 1, skipped: 0 })

    const query = sentCommands('QueryCommand')[0]
    expect(query.input.IndexName).toBe('by-status')
    expect(query.input.ExpressionAttributeValues[':pk']).toBe('PO#pending')

    const exceptionUpdate = sentCommands('UpdateCommand').find(
      (cmd) => cmd.input.TableName === 'orders' && cmd.input.ExpressionAttributeValues[':e'],
    )
    // 復帰日ありの休止 = T1（ETA を出せるので「待つ」を提示できる）
    expect(exceptionUpdate?.input.ExpressionAttributeValues[':e']).toMatchObject({ type: 'T1', reason: 'timeout' })
  })

  it('直前に応答された発注（条件不成立）は skipped', async () => {
    mockSend.mockImplementation(async (cmd: { constructor: { name: string } }) => {
      if (cmd.constructor.name === 'QueryCommand') return { Items: [po] }
      if (cmd.constructor.name === 'UpdateCommand') throw conditionalFailure()
      return {}
    })
    const res = await poTimeouts(new Request('http://localhost/api/cron/po-timeouts'))
    expect(await res.json()).toEqual({ timedOut: 0, skipped: 1 })
  })
})
