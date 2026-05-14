import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="relative z-[2] flex justify-between items-center
      px-20 py-[38px] border-t border-[rgba(200,169,110,0.07)]
      max-[700px]:flex-col max-[700px]:gap-[10px] max-[700px]:text-center max-[700px]:px-5 max-[700px]:py-7">
      <div className="flex items-center gap-[10px]">
        <Image
          src="/images/logo/logo_siko8.png"
          alt="Sikō Coffee"
          width={48}
          height={48}
          className="h-6 w-auto brightness-[0.7]"
        />
        <span className="font-serif font-light text-[13px] tracking-[0.18em]
          text-[rgba(200,169,110,0.5)]">
          Coffee
        </span>
      </div>
      <span className="font-sans font-extralight text-[10.5px] tracking-[0.14em]
        text-[rgba(240,235,224,0.16)]">
        思考 · 試行 · 至高 · 嗜好
      </span>
      <span className="font-serif text-[10.5px] tracking-[0.05em]
        text-[rgba(240,235,224,0.12)]">
        © 2026
      </span>
    </footer>
  )
}
