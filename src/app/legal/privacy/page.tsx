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

          <Section title="1. 基本方針">
            <p>
              Sikō Coffee（嗜好珈琲。以下「当店」といいます）は、当店が運営するウェブサイト
              および関連サービス（以下「本サービス」といいます）において取得するお客様の個人情報を、
              個人情報の保護に関する法律（個人情報保護法）その他の関係法令およびガイドラインを遵守し、
              適切に取り扱います。本ポリシーは、当店がどのような情報を取得し、どのように利用・管理するかを
              定めるものです。
            </p>
          </Section>

          <Section title="2. 取得する個人情報">
            <p className="mb-4">
              当店は、本サービスの提供にあたり、以下の情報を取得します。
            </p>

            <SubTitle>(1) お客様にご提供いただく情報</SubTitle>
            <List items={[
              '会員登録時: メールアドレス、お名前（任意）、パスワード（暗号化して保存し、当店が内容を知ることはできません）',
              'ご注文時: お届け先のお名前・郵便番号・住所・電話番号、メールアドレス',
              'お問い合わせ時: お名前、メールアドレス、お問い合わせ内容',
            ]} />

            <SubTitle className="mt-5">(2) ソーシャルログインを通じて取得する情報</SubTitle>
            <p>
              Google または LINE のアカウントでログインされた場合、各事業者から、
              メールアドレス、お名前、プロフィール画像、および当該サービス上の利用者識別子を取得します。
              当店がお客様のソーシャルアカウントのパスワードや友だち・連絡先等を取得することはありません。
              詳細は第5項をご参照ください。
            </p>

            <SubTitle className="mt-5">(3) 自動的に取得する情報</SubTitle>
            <List items={[
              'IPアドレス、ブラウザの種類・言語、OS・端末に関する情報',
              'アクセス日時、閲覧ページ、リファラー等のアクセスログ',
              'Cookie および類似技術により生成・取得される識別情報',
            ]} />
          </Section>

          <Section title="3. 利用目的">
            <p className="mb-4">当店は、取得した個人情報を以下の目的で利用します。</p>
            <List items={[
              '会員登録・ログイン認証・本人確認、およびアカウントの管理',
              '商品の発送・お届け、ご注文内容や配送状況に関するご連絡',
              'ご注文・お問い合わせへの対応、アフターサービスの提供',
              '不正アクセス・なりすまし・不正利用の防止、本サービスの安全確保',
              '本サービスの利用状況の分析、品質・利便性の維持・改善',
              '新商品・キャンペーン等のご案内（ご同意いただいた場合に限ります）',
              '法令または行政機関等の要請に基づく対応',
            ]} />
          </Section>

          <Section title="4. 個人情報の取得方法">
            <p>
              当店は、お客様ご自身による入力、ソーシャルログイン提供事業者からの取得、
              および本サービスのご利用に伴う自動的な記録により、適正かつ適法な手段で個人情報を取得します。
            </p>
          </Section>

          <Section title="5. ソーシャルログイン（Google・LINE）について">
            <p className="mb-4">
              本サービスでは、Google および LINE が提供する認証サービスを利用したログインをご利用いただけます。
              ログインの際、お客様の同意に基づき、各事業者からメールアドレス・お名前・プロフィール画像・
              利用者識別子の提供を受け、当店のアカウントの作成・認証に利用します。
            </p>
            <p className="mb-4">
              各事業者におけるお客様の情報の取り扱いについては、それぞれのプライバシーポリシーをご確認ください。
            </p>
            <List items={[
              'Google: https://policies.google.com/privacy',
              'LINE（LY Corporation）: https://line.me/ja/terms/policy/',
            ]} />
            <p className="mt-4">
              ソーシャルログイン連携の解除をご希望の場合は、第17項のお問い合わせ窓口までご連絡ください。
            </p>
          </Section>

          <Section title="6. Cookie および類似技術の利用">
            <p>
              当店は、ログイン状態の維持、セキュリティの確保、および本サービスの改善・分析のために
              Cookie および類似技術を使用します。ログインの維持等に必要な Cookie は本サービスの提供に
              不可欠です。分析等を目的とする Cookie は、ブラウザの設定により無効化することができますが、
              その場合、一部の機能をご利用いただけないことがあります。
            </p>
          </Section>

          <Section title="7. アクセス解析ツールの利用">
            <p>
              当サイトでは、利用状況の把握・分析のために Google LLC が提供する
              「Google アナリティクス」を使用しています。Google アナリティクスは Cookie を利用して
              個人を特定しない形で情報を収集します。収集された情報は Google 社のプライバシーポリシーに
              基づき管理されます。データの収集を無効化したい場合は、
              「Google アナリティクス オプトアウト アドオン」の利用、またはブラウザの設定変更により
              拒否することができます。
            </p>
          </Section>

          <Section title="8. 外部送信される利用者情報について">
            <p className="mb-4">
              本サービスでは、機能の提供・分析・品質維持のため、お客様の端末から以下の外部事業者へ
              情報が送信される場合があります（電気通信事業法に基づく開示）。
            </p>
            <div className="space-y-4">
              <Vendor
                name="Google LLC（Google アナリティクス）"
                data="Cookie 識別子、IPアドレス、閲覧情報"
                purpose="アクセス状況の測定・分析"
              />
              <Vendor
                name="Vercel Inc.（ホスティング・配信）"
                data="IPアドレス、リクエスト情報、アクセスログ"
                purpose="本サービスの配信・稼働・セキュリティ確保"
              />
              <Vendor
                name="Functional Software, Inc.（Sentry／エラー監視）"
                data="IPアドレス、端末・ブラウザ情報、エラー発生時の技術情報"
                purpose="障害の検知・原因調査・品質改善"
              />
              <Vendor
                name="Stripe, Inc.（決済）"
                data="決済処理に必要な情報"
                purpose="不正検知を含む決済処理"
              />
            </div>
          </Section>

          <Section title="9. 決済情報の取り扱い">
            <p>
              クレジットカード等の決済情報は、決済代行サービスである Stripe, Inc. が
              国際的なセキュリティ基準（PCI DSS）に準拠して安全に処理します。
              カード番号等の情報が当店のサーバーに保存されることはありません。
            </p>
          </Section>

          <Section title="10. 個人情報の処理の委託">
            <p className="mb-4">
              当店は、利用目的の達成に必要な範囲で、個人情報の取り扱いの全部または一部を外部事業者に
              委託することがあります。この場合、委託先に対して必要かつ適切な監督を行います。
              主な委託先・利用サービスは以下のとおりです。
            </p>
            <List items={[
              'Amazon Web Services（データの保管・メール送信。データセンターは東京リージョン）',
              'Vercel Inc.（本サービスのホスティング・配信）',
              'Stripe, Inc.（決済処理）',
              'Google LLC（アクセス解析）',
              'Functional Software, Inc.（エラー監視）',
              'Slack Technologies, LLC（運用通知）',
            ]} />
          </Section>

          <Section title="11. 第三者提供">
            <p>
              当店は、次のいずれかに該当する場合を除き、あらかじめお客様の同意を得ることなく
              個人情報を第三者に提供することはありません。
            </p>
            <List items={[
              '法令に基づく場合',
              '人の生命・身体・財産の保護に必要で、本人の同意取得が困難な場合',
              '商品の配送のために配送事業者へ必要な範囲で提供する場合',
              '利用目的の達成に必要な範囲で業務を委託する場合（第10項）',
            ]} />
          </Section>

          <Section title="12. 外国にある第三者への提供">
            <p>
              当店が利用する委託先・外部サービスの一部（Stripe、Vercel、Google、Sentry、Slack 等）は
              米国その他の外国に所在し、これらのサービスの利用に伴い、お客様の個人情報が当該国において
              取り扱われる場合があります。当店は、これらの事業者が適切な保護措置を講じていることを確認した上で、
              法令に従い必要な措置を講じます。
            </p>
          </Section>

          <Section title="13. 個人情報の保管期間">
            <p>
              当店は、利用目的の達成に必要な期間、または法令で定められた期間に限り個人情報を保管し、
              当該期間の経過後は、不要となった個人情報を遅滞なく消去または匿名化します。
              アカウントを削除された場合、認証・本人確認に関する情報は、法令上の保存義務がある場合等を除き削除します。
            </p>
          </Section>

          <Section title="14. 安全管理措置">
            <p>
              当店は、個人情報の漏洩・滅失・毀損・不正アクセス等を防止するため、
              通信の暗号化（TLS）、パスワードの暗号化保存、アクセス権限の管理、不正ログイン対策（レート制限等）
              その他の組織的・技術的な安全管理措置を講じます。万一、重大な漏洩等が発生した場合には、
              法令に従い必要な対応を行います。
            </p>
          </Section>

          <Section title="15. 開示・訂正・利用停止等の請求">
            <p>
              お客様は、ご自身の個人情報について、開示・訂正・追加・削除・利用停止・第三者提供の停止等を
              請求することができます。アカウントの登録情報の一部（プロフィール画像等）は、
              ログイン後のアカウント画面からご自身で変更いただけます。開示・削除・利用停止その他のご請求、
              およびアカウントの削除をご希望の場合は、第17項のお問い合わせ窓口までご連絡ください。
              ご本人であることを確認の上、法令に従い合理的な範囲で速やかに対応いたします。
            </p>
          </Section>

          <Section title="16. 未成年の方の利用">
            <p>
              未成年の方が本サービスをご利用になる場合は、保護者の同意を得た上でご利用ください。
            </p>
          </Section>

          <Section title="17. お問い合わせ窓口">
            <p>
              本ポリシーおよび個人情報の取り扱いに関するお問い合わせ・ご請求は、以下までご連絡ください。
            </p>
            <p className="mt-3">
              <span style={{ color: 'var(--dim)' }}>Sikō Coffee（嗜好珈琲）個人情報お問い合わせ窓口</span>
              <br />
              <a href="mailto:siko.is.coffee@gmail.com"
                style={{ color: 'var(--gold, #B8BEC8)' }}>
                siko.is.coffee@gmail.com
              </a>
            </p>
          </Section>

          <Section title="18. 準拠法とポリシーの改定">
            <p>
              本ポリシーの解釈・適用は日本法に準拠します。当店は、法令の変更やサービス内容の変更に応じて
              本ポリシーを改定することがあります。重要な変更を行う場合は、本サービス上での掲示等により
              お知らせします。改定後の本ポリシーは、本ページに掲載した時点から効力を生じます。
            </p>
          </Section>
        </div>

        <p className="mt-12 text-xs font-sans font-light tracking-[0.05em]"
          style={{ color: 'var(--dim)' }}>
          最終改定日: 2026年6月24日
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

function SubTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`font-sans text-sm mb-2 ${className}`} style={{ color: 'var(--cream)' }}>
      {children}
    </p>
  )
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-none space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span style={{ color: 'var(--dim)' }}>—</span>
          <span style={{ wordBreak: 'break-word' }}>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function Vendor({ name, data, purpose }: { name: string; data: string; purpose: string }) {
  return (
    <div>
      <p style={{ color: 'var(--cream)' }}>{name}</p>
      <p className="text-xs" style={{ color: 'var(--dim)' }}>
        送信される情報: {data}
      </p>
      <p className="text-xs" style={{ color: 'var(--dim)' }}>
        利用目的: {purpose}
      </p>
    </div>
  )
}
