import { notFound } from 'next/navigation'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import Nav from '@/components/layout/Nav'
import Footer from '@/components/layout/Footer'
import { getDocClient, TABLE } from '@/lib/db'
import { verifyOrderToken } from '@/lib/orderToken'
import { carrierLabel } from '@/lib/carriers'
import type { OrderRecord, OrderItemRecord, OrderStatus } from '@/types/admin'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

export const metadata = {
  title: 'ご注文状況 — Sikō Coffee',
  robots: { index: false, follow: false },
}

// 配達までの進行段階（cancelled / refunded は別表示）。
const TIMELINE: { key: OrderStatus; label: string }[] = [
  { key: 'paid', label: '支払い完了' },
  { key: 'processing', label: '準備中' },
  { key: 'shipped', label: '発送済み' },
  { key: 'delivered', label: '配達完了' },
]

const TERMINAL_LABEL: Partial<Record<OrderStatus, string>> = {
  cancelled: 'キャンセル済み',
  refunded: '返金済み',
}

function itemLine(it: OrderItemRecord): string {
  const grams = it.grams ?? 200
  const grind = it.grind ?? '豆のまま'
  const tag = it.single ? 'シングルオリジン' : it.custom ? 'オリジナルブレンド' : 'ブレンド'
  return `${it.name}（${tag}・${grind}・${grams}g）`
}

function addressText(a: OrderRecord['shippingAddress']): string {
  if (!a) return ''
  return `${a.postal_code ?? ''} ${a.state ?? ''} ${a.city ?? ''} ${a.line1 ?? ''} ${a.line2 ?? ''}`.trim()
}

export default async function OrderLookupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { id } = await params
  const { t } = await searchParams

  // トークン検証（本人のみ閲覧可）。
  if (!t || !(await verifyOrderToken(id, t))) notFound()

  let order: OrderRecord | undefined
  try {
    const res = await getDocClient().send(new GetCommand({ TableName: TABLE.ORDERS, Key: { id } }))
    order = res.Item as OrderRecord | undefined
  } catch {
    order = undefined
  }

  if (!order || order.status === 'pending') notFound()

  const currentIdx = TIMELINE.findIndex((s) => s.key === order.status)
  const isTerminal = order.status === 'cancelled' || order.status === 'refunded'
  const addr = addressText(order.shippingAddress)

  return (
    <>
      <Nav visible logoHref="/" />

      <main className="relative min-h-screen z-[1] px-[22px] py-[110px] max-w-[560px] mx-auto">
        <h1 className="font-serif font-light text-[clamp(22px,3.5vw,30px)] text-[#E8EAEE] tracking-[0.08em] mb-[6px]">
          ご注文状況
        </h1>
        <p className="font-sans font-extralight text-[11px] tracking-[0.18em] text-[rgba(184,190,200,0.45)] mb-[44px]">
          注文番号 {id.slice(0, 8).toUpperCase()}
        </p>

        {isTerminal ? (
          <div className="border border-[rgba(184,190,200,0.2)] px-[22px] py-[18px] mb-[44px]">
            <span className="font-serif text-[15px] text-[#E8EAEE] tracking-[0.06em]">
              {TERMINAL_LABEL[order.status]}
            </span>
          </div>
        ) : (
          <ol className="flex flex-col gap-0 mb-[44px]">
            {TIMELINE.map((step, i) => {
              const done = i <= currentIdx
              return (
                <li key={step.key} className="flex items-center gap-[14px] py-[10px]">
                  <span
                    className="inline-block w-[10px] h-[10px] rounded-full shrink-0"
                    style={{ background: done ? '#B8BEC8' : 'rgba(184,190,200,0.2)' }}
                    aria-hidden="true"
                  />
                  <span
                    className="font-sans text-[13px] tracking-[0.1em]"
                    style={{ color: done ? '#E8EAEE' : 'rgba(184,190,200,0.4)', fontWeight: i === currentIdx ? 400 : 200 }}
                  >
                    {step.label}
                  </span>
                </li>
              )
            })}
          </ol>
        )}

        {order.trackingNumber && (
          <div className="mb-[40px]">
            <p className="font-sans font-extralight text-[10px] tracking-[0.2em] text-[rgba(184,190,200,0.4)] mb-[8px]">
              配送
            </p>
            <p className="font-serif text-[13px] text-[#E8EAEE] tracking-[0.05em] leading-[2]">
              {carrierLabel(order.carrier)}
              <br />
              {order.trackingUrl ? (
                <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer"
                  className="underline text-[rgba(184,190,200,0.7)] hover:text-[#E8EAEE]">
                  {order.trackingNumber}（追跡する）
                </a>
              ) : (
                order.trackingNumber
              )}
            </p>
          </div>
        )}

        <div className="mb-[40px]">
          <p className="font-sans font-extralight text-[10px] tracking-[0.2em] text-[rgba(184,190,200,0.4)] mb-[10px]">
            ご注文内容
          </p>
          <ul className="flex flex-col gap-[8px]">
            {(order.items ?? []).map((it, i) => (
              <li key={i} className="font-serif text-[13px] text-[rgba(232,234,238,0.85)] tracking-[0.04em] leading-[1.8]">
                {itemLine(it)}
              </li>
            ))}
          </ul>
          {typeof order.amount === 'number' && (
            <p className="font-serif text-[16px] text-[#E8EAEE] tracking-[0.05em] mt-[16px]">
              合計 ¥{order.amount.toLocaleString()}
            </p>
          )}
        </div>

        {addr && (
          <div className="mb-[40px]">
            <p className="font-sans font-extralight text-[10px] tracking-[0.2em] text-[rgba(184,190,200,0.4)] mb-[8px]">
              お届け先
            </p>
            <p className="font-serif text-[13px] text-[rgba(232,234,238,0.85)] tracking-[0.04em] leading-[1.9]">
              {order.shippingName && <>{order.shippingName}<br /></>}
              {addr}
            </p>
          </div>
        )}

        <a
          href="/shop"
          className="inline-block font-sans font-extralight text-[10px] tracking-[0.22em]
            text-[rgba(184,190,200,0.5)] border border-[rgba(184,190,200,0.2)] px-[28px] py-[13px]
            transition-all duration-400 hover:text-[#B8BEC8] hover:border-[rgba(184,190,200,0.45)]"
        >
          SHOP へ戻る
        </a>
      </main>

      <Footer />
    </>
  )
}
