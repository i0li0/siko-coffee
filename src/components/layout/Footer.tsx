import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="relative z-[2] flex justify-between items-center
      flex-col gap-[10px] text-center py-7
      min-[700px]:flex-row min-[700px]:gap-0 min-[700px]:text-left min-[700px]:py-[38px]
      border-t border-[rgba(184,190,200,0.07)]"
      style={{ paddingInline: 'clamp(24px, 6.25vw, 80px)' }}>
      <div className="flex items-center gap-[10px]">
        <Image
          src="/images/logo/logo_siko8.png"
          alt="Sikō Coffee"
          width={48}
          height={48}
          className="h-6 w-auto brightness-[0.7]"
        />
        <span className="font-serif font-light text-[13px] tracking-[0.18em]
          text-[rgba(184,190,200,0.5)]">
          Coffee
        </span>
      </div>
      <span className="font-sans font-extralight text-[10.5px] tracking-[0.14em]
        text-[rgba(232,234,238,0.16)]">
        思考 · 試行 · 至高 · 嗜好
      </span>
      <span className="font-serif text-[10.5px] tracking-[0.05em]
        text-[rgba(232,234,238,0.12)]">
        © 2026
      </span>
    </footer>
  )
}
