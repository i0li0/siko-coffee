import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockSend = vi.fn()
vi.mock('@/lib/db', () => ({
  getDocClient: () => ({ send: mockSend }),
  TABLE: { LOTS: 'lots', BEANS: 'beans', ROASTER_METRICS: 'roaster_metrics' },
  isDbConfigured: () => false,
}))
vi.mock('@/lib/roasterAuth', () => ({
  requireRoaster: vi.fn(),
  getOwnedBean: vi.fn(),
}))
vi.mock('@/lib/roasterMetrics', () => ({
  addRoasterMetrics: vi.fn(),
}))
vi.mock('@/lib/rateLimit', () => ({
  checkGeneralRateLimit: vi.fn(),
  getClientIp: vi.fn(),
}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { GET, POST } from '@/app/api/roaster/lots/route'
import { PATCH } from '@/app/api/roaster/lots/[beanId]/[roastDate]/route'
import { getOwnedBean, requireRoaster } from '@/lib/roasterAuth'
import { addRoasterMetrics } from '@/lib/roasterMetrics'
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit'
import type { BeanRecord, LotRecord } from '@/types/platform'

const ROASTER_ID = 'roaster-1'
const BEAN_ID = 'bean-1'

const activeRoaster = {
  ok: true as const,
  userId: ROASTER_ID,
  roaster: { roasterId: ROASTER_ID, status: 'active' } as never,
}

const ownedBean = { beanId: BEAN_ID, roasterId: ROASTER_ID } as BeanRecord

const baseLot: LotRecord = {
  beanId: BEAN_ID,
  roastDate: '2026-07-20',
  roasterId: ROASTER_ID,
  onHandG: 1000,
  reservedG: 200,
  availableG: 800,
  parRankG: 2000,
  freshBy: '2026-08-10',
  status: 'fresh',
  purchasedG: 1000,
  soldG: 0,
  wastedG: 0,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  gsiPk: 'LOT',
  gsiSk: '2026-08-10',
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/roaster/lots', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function patchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/roaster/lots/bean-1/2026-07-20', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const patchParams = { params: Promise.resolve({ beanId: BEAN_ID, roastDate: '2026-07-20' }) }

// mockSend に渡ったコマンドを種類で拾う（PutCommand / UpdateCommand / GetCommand / QueryCommand）
function sentCommand(name: string) {
  return mockSend.mock.calls.map((c) => c[0]).find((cmd) => cmd.constructor.name === name)
}

function conditionalFailure() {
  const err = new Error('conditional') as Error & { name: string }
  err.name = 'ConditionalCheckFailedException'
  return err
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getClientIp).mockReturnValue('1.2.3.4')
  vi.mocked(checkGeneralRateLimit).mockResolvedValue({ allowed: true })
  vi.mocked(requireRoaster).mockResolvedValue(activeRoaster)
  vi.mocked(getOwnedBean).mockResolvedValue(ownedBean)
  vi.mocked(addRoasterMetrics).mockResolvedValue(undefined)
})

describe('POST /api/roaster/lots', () => {
  it('active 焙煎者でなければ 403（ガードの戻りをそのまま返す）', async () => {
    vi.mocked(requireRoaster).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    })
    const res = await POST(postRequest({}))
    expect(res.status).toBe(403)
  })

  it('自分の豆でなければ 404', async () => {
    vi.mocked(getOwnedBean).mockResolvedValue(null)
    const res = await POST(
      postRequest({ beanId: BEAN_ID, roastDate: '2026-07-20', onHandG: 1000, parRankG: 2000, freshBy: '2026-08-10' }),
    )
    expect(res.status).toBe(404)
  })

  it('parRankG が100g刻みでなければ 400', async () => {
    const res = await POST(
      postRequest({ beanId: BEAN_ID, roastDate: '2026-07-20', onHandG: 1000, parRankG: 1050, freshBy: '2026-08-10' }),
    )
    expect(res.status).toBe(400)
  })

  it('登録すると availableG=onHandG・purchasedG が入り、GSI キーと仕入れ計測が付く', async () => {
    mockSend.mockResolvedValue({})
    const res = await POST(
      postRequest({ beanId: BEAN_ID, roastDate: '2026-07-20', onHandG: 1000, parRankG: 2000, freshBy: '2026-08-10' }),
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as LotRecord
    expect(body).toMatchObject({
      beanId: BEAN_ID,
      roasterId: ROASTER_ID,
      onHandG: 1000,
      reservedG: 0,
      availableG: 1000,
      purchasedG: 1000,
      status: 'fresh',
      gsiPk: 'LOT',
      gsiSk: '2026-08-10',
    })
    expect(sentCommand('PutCommand')?.input.ConditionExpression).toBe('attribute_not_exists(beanId)')
    expect(addRoasterMetrics).toHaveBeenCalledWith(ROASTER_ID, { purchasedG: 1000 })
  })

  it('同じ豆×焙煎日の二重登録は 409', async () => {
    mockSend.mockRejectedValue(conditionalFailure())
    const res = await POST(
      postRequest({ beanId: BEAN_ID, roastDate: '2026-07-20', onHandG: 500, parRankG: 1000, freshBy: '2026-08-10' }),
    )
    expect(res.status).toBe(409)
    expect(addRoasterMetrics).not.toHaveBeenCalled()
  })
})

describe('GET /api/roaster/lots', () => {
  it('beanId 無しは 400', async () => {
    const res = await GET(new NextRequest('http://localhost/api/roaster/lots'))
    expect(res.status).toBe(400)
  })

  it('自分の豆のロットを roastDate 降順で Query（Scan を使わない）', async () => {
    mockSend.mockResolvedValue({ Items: [baseLot] })
    const res = await GET(new NextRequest(`http://localhost/api/roaster/lots?beanId=${BEAN_ID}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([baseLot])
    const query = sentCommand('QueryCommand')
    expect(query?.input.KeyConditionExpression).toBe('beanId = :bid')
    expect(query?.input.ScanIndexForward).toBe(false)
  })
})

describe('PATCH /api/roaster/lots/[beanId]/[roastDate]', () => {
  it('他人のロットは 404（存在を漏らさない）', async () => {
    mockSend.mockResolvedValue({ Item: { ...baseLot, roasterId: 'someone-else' } })
    const res = await PATCH(patchRequest({ wasteG: 100 }), patchParams)
    expect(res.status).toBe(404)
  })

  it('receivedG / wasteG の同時指定は 400', async () => {
    const res = await PATCH(patchRequest({ receivedG: 100, wasteG: 50 }), patchParams)
    expect(res.status).toBe(400)
  })

  it('廃棄すると onHandG 減・availableG 追従・wastedG 加算＋計測に載る', async () => {
    mockSend.mockResolvedValueOnce({ Item: baseLot }).mockResolvedValueOnce({ Attributes: baseLot })
    const res = await PATCH(patchRequest({ wasteG: 300 }), patchParams)
    expect(res.status).toBe(200)
    const update = sentCommand('UpdateCommand')
    expect(update?.input.ExpressionAttributeValues).toMatchObject({
      ':onHandG': 700,
      ':availableG': 500, // 700 − reservedG 200
      ':wastedG': 300,
    })
    expect(addRoasterMetrics).toHaveBeenCalledWith(ROASTER_ID, { wastedG: 300 })
  })

  it('確保済み(reservedG)を下回る調整は 409 で弾く', async () => {
    mockSend.mockResolvedValueOnce({ Item: baseLot })
    const res = await PATCH(patchRequest({ onHandG: 100 }), patchParams)
    expect(res.status).toBe(409)
    expect(sentCommand('UpdateCommand')).toBeUndefined()
    expect(addRoasterMetrics).not.toHaveBeenCalled()
  })

  it('追加入荷は purchasedG に積み上がる', async () => {
    mockSend.mockResolvedValueOnce({ Item: baseLot }).mockResolvedValueOnce({ Attributes: baseLot })
    const res = await PATCH(patchRequest({ receivedG: 500 }), patchParams)
    expect(res.status).toBe(200)
    expect(sentCommand('UpdateCommand')?.input.ExpressionAttributeValues).toMatchObject({
      ':onHandG': 1500,
      ':availableG': 1300,
      ':purchasedG': 1500,
    })
    expect(addRoasterMetrics).toHaveBeenCalledWith(ROASTER_ID, { purchasedG: 500 })
  })

  it('freshBy を変えると GSI by-freshBy の gsiSk も追従する', async () => {
    mockSend.mockResolvedValueOnce({ Item: baseLot }).mockResolvedValueOnce({ Attributes: baseLot })
    await PATCH(patchRequest({ freshBy: '2026-08-20', status: 'discount' }), patchParams)
    expect(sentCommand('UpdateCommand')?.input.ExpressionAttributeValues).toMatchObject({
      ':freshBy': '2026-08-20',
      ':gsiSk': '2026-08-20',
      ':status': 'discount',
    })
  })

  it('CAS 条件は読んだ onHandG / reservedG と所有者を条件にする', async () => {
    mockSend.mockResolvedValueOnce({ Item: baseLot }).mockResolvedValueOnce({ Attributes: baseLot })
    await PATCH(patchRequest({ parRankG: 3000 }), patchParams)
    const update = sentCommand('UpdateCommand')
    expect(update?.input.ConditionExpression).toContain('#cOnHandG = :cOnHandG')
    expect(update?.input.ExpressionAttributeValues).toMatchObject({
      ':cOnHandG': 1000,
      ':cReservedG': 200,
      ':cRoasterId': ROASTER_ID,
    })
  })

  it('割り込み更新（条件不成立）は 409 で計測も動かさない', async () => {
    mockSend.mockResolvedValueOnce({ Item: baseLot }).mockRejectedValueOnce(conditionalFailure())
    const res = await PATCH(patchRequest({ wasteG: 100 }), patchParams)
    expect(res.status).toBe(409)
    expect(addRoasterMetrics).not.toHaveBeenCalled()
  })
})
