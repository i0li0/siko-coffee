import Image from 'next/image'
import Link from 'next/link'

export default function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="relative z-[2] border-t border-[var(--faint)]"
      style={{ paddingInline: 'clamp(24px, 6.25vw, 80px)' }}>
      <div className="flex justify-between items-center
        flex-col gap-[10px] text-center py-7
        min-[700px]:flex-row min-[700px]:gap-0 min-[700px]:text-left min-[700px]:py-[38px]">
        <div className="flex items-center gap-[10px]">
          <Image
            src="/images/logo/logo_siko8.png"
            alt="Sikō Coffee"
            width={48}
            height={48}
            className="h-6 w-auto brightness-[0.7]"
          />
          <span className="font-serif font-light text-[13px] tracking-[0.18em]
            text-[rgba(212,160,23,0.5)]">
            Coffee
          </span>
        </div>
        <span className="font-sans font-extralight text-[10.5px] tracking-[0.14em]
          text-[rgba(232,224,208,0.22)]">
          思考 · 試行 · 至高 · 嗜好
        </span>
        <span className="font-serif text-[10.5px] tracking-[0.05em]
          text-[rgba(232,224,208,0.2)]">
          © {year}
        </span>
      </div>
      <div className="flex justify-center gap-6 pb-6 min-[700px]:pb-8">
        <Link href="/feedback?from=footer"
          className="text-[10px] tracking-[0.14em] hover:opacity-70 transition-opacity"
          style={{ color: 'var(--dim)' }}>
          ご意見・ご感想
        </Link>
        <Link href="/legal/tokushoho"
          className="text-[10px] tracking-[0.14em] hover:opacity-70 transition-opacity"
          style={{ color: 'var(--dim)' }}>
          特定商取引法に基づく表記
        </Link>
        <Link href="/legal/privacy"
          className="text-[10px] tracking-[0.14em] hover:opacity-70 transition-opacity"
          style={{ color: 'var(--dim)' }}>
          プライバシーポリシー
        </Link>
      </div>
    </footer>
  )
}
