import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '特定商取引法に基づく表記 | Sikō Coffee',
  alternates: { canonical: 'https://www.sikocoffee.com/legal/tokushoho' },
}

export default function TokushohoPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--cream)' }}>
      <div className="mx-auto max-w-2xl px-6 py-20">
        <Link
          href="/"
          className="inline-block mb-12 text-xs tracking-[0.18em] uppercase"
          style={{ color: 'var(--dim)' }}
        >
          ← Sikō Coffee
        </Link>

        <h1 className="font-serif font-light text-2xl tracking-[0.12em] mb-12"
          style={{ color: 'var(--cream)' }}>
          特定商取引法に基づく表記
        </h1>

        <table className="w-full text-sm font-sans font-light leading-7 tracking-[0.05em]
          border-collapse"
          style={{ color: 'var(--cream)' }}>
          <tbody>
            <Row label="販売業者" value="Sikō Coffee（シコーコーヒー）" />
            <Row label="運営責任者" value="非公開（お問い合わせにて対応いたします）" />
            <Row
              label="所在地"
              value="〒781-8008 高知県高知市潮新町１丁目１２−１７ コパン荘10号室"
            />
            <Row
              label="お問い合わせ"
              value={
                <a href="mailto:siko.is.coffee@gmail.com"
                  style={{ color: 'var(--gold, #B8BEC8)' }}>
                  siko.is.coffee@gmail.com
                </a>
              }
            />
            <Row label="販売価格" value="各商品ページに記載の税込価格" />
            <Row
              label="送料"
              value="全国一律 ¥500（¥5,000 以上のご購入で送料無料）"
            />
            <Row
              label="代金のお支払い方法"
              value="クレジットカード（Visa / Mastercard / American Express / JCB）"
            />
            <Row
              label="代金のお支払い時期"
              value="ご注文時にお支払いが確定します"
            />
            <Row
              label="商品の引き渡し時期"
              value="ご注文確認後、3〜5営業日以内に発送いたします"
            />
            <Row
              label="返品・交換"
              value={
                <>
                  商品の性質上、お客様のご都合による返品・交換はお受けしておりません。
                  <br />
                  商品の破損・品質不良・誤配送の場合は、商品到着後7日以内に
                  <a href="mailto:siko.is.coffee@gmail.com"
                    style={{ color: 'var(--gold, #B8BEC8)' }}>
                    siko.is.coffee@gmail.com
                  </a>
                  までご連絡ください。送料当社負担にて交換または返金対応いたします。
                </>
              }
            />
            <Row
              label="販売数量"
              value="各商品ページに記載の在庫数を上限とします"
            />
          </tbody>
        </table>

        <p className="mt-12 text-xs font-sans font-light tracking-[0.05em]"
          style={{ color: 'var(--dim)' }}>
          最終更新: 2026年6月
        </p>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <tr className="border-b" style={{ borderColor: 'var(--faint)' }}>
      <th
        className="py-4 pr-6 text-left align-top font-light whitespace-nowrap w-36"
        style={{ color: 'var(--dim)' }}
      >
        {label}
      </th>
      <td className="py-4 align-top">{value}</td>
    </tr>
  )
}
