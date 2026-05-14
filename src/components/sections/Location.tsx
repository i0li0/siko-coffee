export default function Location() {
  return (
    <section id="location"
      className="relative min-h-screen flex items-start justify-center z-[2]
        py-[120px] px-20 max-[700px]:py-[90px] max-[700px]:px-[22px]">
      <div className="location-inner max-w-[720px] w-full grid gap-[80px] items-start
        grid-cols-[1fr_1fr] max-[700px]:grid-cols-1 max-[700px]:gap-[44px]">
        <div className="loc-address" data-reveal>
          <h2 className="font-serif font-light text-[clamp(22px,3.5vw,38px)]
            text-[#f0ebe0] leading-[1.7] mb-7 tracking-[0.05em]">
            夜の静けさの中で、<br />あなたを待っています。
          </h2>
          <p className="font-sans font-extralight text-[13px]
            text-[rgba(240,235,224,0.45)] leading-[2.1] tracking-[0.06em]">
            〒 — — — — —<br />
            ○○市△△町 ○-○-○<br />
            — 駅より徒歩5分
          </p>
          <a
            href="https://maps.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-[22px] font-serif text-[11.5px] tracking-[0.12em]
              text-[rgba(200,169,110,0.42)] border-b border-[rgba(200,169,110,0.22)]
              no-underline transition-colors duration-300 hover:text-[#c8a96e]"
          >
            → Google Maps で開く
          </a>
        </div>

        <div className="loc-hours" data-reveal data-d="1">
          <h3 className="font-serif font-light text-[12px] tracking-[0.22em]
            text-[#c8a96e] uppercase mb-7">
            Hours
          </h3>
          {[
            { label: '月曜日 — 金曜日', hours: '08:00 — 18:00' },
            { label: '土曜日 · 日曜日', hours: '09:00 — 17:00' },
            { label: '祝日',            hours: '不定休'         },
          ].map((row) => (
            <div
              key={row.label}
              className="flex justify-between items-center py-[13px]
                border-b border-[rgba(240,235,224,0.06)]
                text-[12.5px] text-[rgba(240,235,224,0.45)]
                font-extralight tracking-[0.05em]"
            >
              <span>{row.label}</span>
              <span>{row.hours}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
