import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'プライバシーポリシー | Sikō Coffee',
  alternates: { canonical: 'https://www.sikocoffee.com/legal/privacy' },
}

export default function PrivacyPage() {
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

        <h1 className="font-serif font-light text-2xl tracking-[0.12em] mb-2"
          style={{ color: 'var(--cream)' }}>
          プライバシーポリシー
        </h1>
        <p className="font-sans font-light text-xs tracking-[0.14em] mb-12"
          style={{ color: 'var(--dim)' }}>
          Privacy Policy
        </p>

        <div className="space-y-10 font-sans font-light text-sm leading-8 tracking-[0.05em]"
          style={{ color: 'var(--cream)' }}>

          <Section title="1. 個人情報の取得">
            <p>
              Sikō Coffee（以下「当店」）は、商品の購入・お問い合わせの際に、お名前・メールアドレス・郵便番号・住所・電話番号等の個人情報をご提供いただく場合があります。
            </p>
          </Section>

          <Section title="2. 利用目的">
            <ul className="list-none space-y-2">
              {[
                '商品の発送・お届けに関する連絡',
                'ご注文・お問い合わせへの対応',
                '当店サービスの改善・新商品のご案内（ご同意いただいた場合のみ）',
                '法令に基づく対応',
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <span style={{ color: 'var(--dim)' }}>—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="3. 第三者への提供">
            <p>
              当店は、法令に定める場合を除き、お客様の個人情報を第三者に提供・開示することはありません。
              ただし、商品発送のための配送業者へ必要な範囲で情報を提供する場合があります。
            </p>
          </Section>

          <Section title="4. 決済情報の取り扱い">
            <p>
              クレジットカード情報は、決済代行サービス Stripe, Inc. が安全に処理します。
              当店のサーバーにはカード情報は保存されません。
            </p>
          </Section>

          <Section title="5. Google アナリティクスの利用">
            <p>
              当サイトでは、利用状況の分析のために Google アナリティクスを使用しています。
              Google アナリティクスは Cookie を使用してデータを収集します。
              Cookie の使用を無効にするには、ブラウザの設定をご変更ください。
              収集されるデータはGoogle社のプライバシーポリシーに従い管理されます。
            </p>
          </Section>

          <Section title="6. 情報の安全管理">
            <p>
              当店は個人情報の漏洩・紛失・改ざん等を防ぐため、適切なセキュリティ対策を講じます。
            </p>
          </Section>

          <Section title="7. 個人情報の開示・訂正・削除">
            <p>
              お客様ご自身の個人情報の開示・訂正・削除をご希望の場合は、
              下記のお問い合わせ先までご連絡ください。合理的な範囲で対応いたします。
            </p>
          </Section>

          <Section title="8. お問い合わせ">
            <p>
              個人情報の取り扱いに関するお問い合わせは、以下までご連絡ください。
            </p>
            <p className="mt-3">
              <span style={{ color: 'var(--dim)' }}>Sikō Coffee</span>
              <br />
              <a href="mailto:siko.is.coffee@gmail.com"
                style={{ color: 'var(--gold, #B8BEC8)' }}>
                siko.is.coffee@gmail.com
              </a>
            </p>
          </Section>

          <Section title="9. ポリシーの変更">
            <p>
              本ポリシーは予告なく変更することがあります。変更後はこのページに掲載します。
            </p>
          </Section>
        </div>

        <p className="mt-12 text-xs font-sans font-light tracking-[0.05em]"
          style={{ color: 'var(--dim)' }}>
          最終更新: 2026年6月
        </p>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-serif font-light text-base tracking-[0.10em] mb-3"
        style={{ color: 'var(--cream)' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}
