'use client'

import { useSyncExternalStore } from 'react'

// 外部ツールのリンク集。塩漬け防止のため、各ツールへの導線・用途・最後に開いた日をまとめる。
// セキュリティ上の原則: ここに置くのは「ログイン画面への素のURL」だけ。
// APIキー・Slack webhook URL・署名付きURL などのシークレットは絶対に載せない（env に留める）。

type Tool = {
  key: string
  name: string
  url: string
  purpose: string   // 何を見る場所か（一言）
  detail: string    // 補足
  color: string     // ロゴの表示色（暗い管理画面で見える色に調整）
  path: string      // ブランドロゴの SVG パス（viewBox 0 0 24 24）
}

const TOOLS: Tool[] = [
  {
    key: 'vercel',
    name: 'Vercel',
    url: 'https://vercel.com/dashboard',
    purpose: 'デプロイ・環境変数',
    detail: 'ビルド状況、ドメイン、env の確認・更新',
    color: 'var(--cream)',
    path: 'm12 1.608 12 20.784H0Z',
  },
  {
    key: 'stripe',
    name: 'Stripe',
    url: 'https://dashboard.stripe.com',
    purpose: '入金・返金',
    detail: '決済の確認、返金処理、Webhook の状態（ライブ）',
    color: '#8b85ff',
    path: 'M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z',
  },
  {
    key: 'sentry',
    name: 'Sentry',
    url: 'https://sentry.io',
    purpose: 'エラー監視',
    detail: '本番のエラー・例外、パフォーマンスの確認',
    color: '#b58fd6',
    path: 'M13.91 2.505c-.873-1.448-2.972-1.448-3.844 0L6.904 7.92a15.478 15.478 0 0 1 8.53 12.811h-2.221A13.301 13.301 0 0 0 5.784 9.814l-2.926 5.06a7.65 7.65 0 0 1 4.435 5.848H2.194a.365.365 0 0 1-.298-.534l1.413-2.402a5.16 5.16 0 0 0-1.614-.913L.296 19.275a2.182 2.182 0 0 0 .812 2.999 2.24 2.24 0 0 0 1.086.288h6.983a9.322 9.322 0 0 0-3.845-8.318l1.11-1.922a11.47 11.47 0 0 1 4.95 10.24h5.915a17.242 17.242 0 0 0-7.885-15.28l2.244-3.845a.37.37 0 0 1 .504-.13c.255.14 9.75 16.708 9.928 16.9a.365.365 0 0 1-.327.543h-2.287c.029.612.029 1.223 0 1.831h2.297a2.206 2.206 0 0 0 1.922-3.31z',
  },
  {
    key: 'aws',
    name: 'AWS Console',
    url: 'https://654512230021.signin.aws.amazon.com/console',
    purpose: 'DynamoDB / SES / Route53',
    detail: 'データ・メール送信上限・DNS・IAM・ログ（account 654512230021）',
    color: '#ff9900',
    path: 'M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.375 6.18 6.18 0 0 1-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.862.272a2.287 2.287 0 0 1-.28.104.488.488 0 0 1-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.279-.144.614-.264 1.005-.36a4.84 4.84 0 0 1 1.246-.151c.95 0 1.644.216 2.091.647.439.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 0 0-.735-.136 6.02 6.02 0 0 0-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 0 1 .32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 0 1-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758.777.777 0 0 0-.215-.559c-.144-.151-.416-.287-.807-.415l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.902 1.902 0 0 1-.4-1.158c0-.335.073-.63.216-.886.144-.255.335-.479.575-.654.24-.184.51-.32.83-.415.32-.096.655-.136 1.006-.136.175 0 .359.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 0 1 .24.2.43.43 0 0 1 .071.263v.375c0 .168-.064.256-.184.256a.83.83 0 0 1-.303-.096 3.652 3.652 0 0 0-1.532-.311c-.455 0-.815.071-1.062.223-.248.152-.375.383-.375.71 0 .224.08.416.24.567.159.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767.247.327.367.702.367 1.117 0 .343-.072.655-.207.926-.144.272-.336.511-.583.703-.248.2-.543.343-.886.447-.36.111-.734.167-1.142.167zM21.698 16.207c-2.626 1.94-6.442 2.969-9.722 2.969-4.598 0-8.74-1.7-11.87-4.526-.247-.223-.024-.527.272-.351 3.384 1.963 7.559 3.153 11.877 3.153 2.914 0 6.114-.607 9.06-1.852.439-.2.814.287.383.607zM22.792 14.961c-.336-.43-2.22-.207-3.074-.103-.255.032-.295-.192-.063-.36 1.5-1.053 3.967-.75 4.254-.399.287.36-.08 2.826-1.485 4.007-.215.184-.423.088-.327-.151.32-.79 1.03-2.57.695-2.994z',
  },
  {
    key: 'github',
    name: 'GitHub',
    url: 'https://github.com/i0li0/siko-coffee',
    purpose: 'リポジトリ・PR',
    detail: 'コード、Pull Request、Issue、Actions',
    color: 'var(--cream)',
    path: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  },
  {
    key: 'slack',
    name: 'Slack',
    url: 'https://app.slack.com',
    purpose: '運用通知の確認',
    detail: '新規登録・注文の通知が届くワークスペース',
    color: '#e8638f',
    path: 'M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z',
  },
  {
    key: 'notion',
    name: 'Notion',
    url: 'https://www.notion.so',
    purpose: 'ドキュメント',
    detail: '設計メモ・議事録・運用手順',
    color: 'var(--cream)',
    path: 'M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z',
  },
]

const STORAGE_KEY = 'admin-links-last-viewed'

// 「最後に開いた日」は localStorage（このブラウザ内のみ）に保存する。
// useSyncExternalStore で購読し、SSR では空（getServerSnapshot）を返してハイドレーション差分を防ぐ。
type ViewedMap = Record<string, string>
const EMPTY: ViewedMap = {}
const listeners = new Set<() => void>()
let cachedRaw: string | null | undefined
let cachedParsed: ViewedMap = EMPTY

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  window.addEventListener('storage', cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', cb)
  }
}

function getSnapshot(): ViewedMap {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    // localStorage 不可なら空扱い
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw
    try {
      cachedParsed = raw ? (JSON.parse(raw) as ViewedMap) : EMPTY
    } catch {
      cachedParsed = EMPTY
    }
  }
  return cachedParsed
}

function getServerSnapshot(): ViewedMap {
  return EMPTY
}

function markViewed(key: string): void {
  const next = { ...getSnapshot(), [key]: new Date().toISOString() }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 保存失敗は無視（遷移は止めない）
  }
  listeners.forEach((l) => l())
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

export default function AdminLinksPage() {
  // 最後に開いた日（ブラウザの localStorage に保存。サーバには送らない）
  const lastViewed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return (
    <div>
      <style>{`
        .links-card:hover {
          border-color: var(--admin-accent) !important;
          background: rgba(240,235,224,0.03) !important;
        }
        .links-card:hover .links-arrow { opacity: 1 !important; transform: translateX(0) !important; }
        @media (prefers-reduced-motion: reduce) {
          .links-card, .links-arrow { transition: none !important; }
        }
      `}</style>

      <h1 style={{
        fontFamily: 'var(--font-serif)',
        fontSize: '22px',
        fontWeight: 300,
        color: 'var(--cream)',
        letterSpacing: '0.10em',
        marginBottom: '8px',
      }}>
        外部ツール
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--dim)', lineHeight: 1.7, marginBottom: '28px', maxWidth: '640px' }}>
        運用で使う外部サービスへの導線。塩漬け防止に、たまに各ツールを覗いて状態を確認しましょう。
        リンクを開くと「最後に開いた日」が自動で記録されます（このブラウザ内のみ）。
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '14px',
        maxWidth: '960px',
      }}>
        {TOOLS.map((tool) => (
          <a
            key={tool.key}
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => markViewed(tool.key)}
            className="links-card"
            style={{
              display: 'flex',
              gap: '14px',
              alignItems: 'flex-start',
              padding: '18px',
              background: 'var(--admin-card-bg)',
              border: '1px solid var(--admin-border)',
              borderRadius: '10px',
              textDecoration: 'none',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            {/* ロゴ */}
            <span style={{
              flexShrink: 0,
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'var(--admin-sidebar-bg)',
              border: '1px solid var(--admin-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill={tool.color} aria-hidden="true">
                <path d={tool.path} />
              </svg>
            </span>

            {/* 本文 */}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', color: 'var(--cream)', letterSpacing: '0.04em' }}>
                  {tool.name}
                </span>
                <span className="links-arrow" style={{
                  fontSize: '12px',
                  color: 'var(--admin-accent)',
                  opacity: 0,
                  transform: 'translateX(-4px)',
                  transition: 'opacity 0.15s, transform 0.15s',
                }}>
                  ↗
                </span>
              </span>
              <span style={{
                display: 'inline-block',
                fontSize: '11px',
                color: 'var(--admin-accent)',
                letterSpacing: '0.06em',
                margin: '6px 0 0',
              }}>
                {tool.purpose}
              </span>
              <span style={{ display: 'block', fontSize: '12px', color: 'var(--dim)', lineHeight: 1.6, marginTop: '4px' }}>
                {tool.detail}
              </span>
              <span style={{
                display: 'block',
                fontSize: '11px',
                color: 'var(--dim)',
                opacity: 0.7,
                marginTop: '10px',
              }}>
                最後に開いた日: {lastViewed[tool.key] ? formatDate(lastViewed[tool.key]) : '—'}
              </span>
            </span>
          </a>
        ))}
      </div>

      <p style={{ fontSize: '11px', color: 'var(--dim)', opacity: 0.7, lineHeight: 1.7, marginTop: '28px', maxWidth: '640px' }}>
        ※ ここに載せるのはログイン画面への素のリンクのみ。APIキー・Slack の Webhook URL・署名付きURL などのシークレットは載せません（環境変数で管理）。
      </p>
    </div>
  )
}
