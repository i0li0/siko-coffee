export default function Location() {
  return (
    <section id="location"
      className="relative min-h-screen flex items-start justify-center z-[2]
        py-[90px] min-[700px]:py-[120px]"
      style={{ paddingInline: 'clamp(24px, 6.25vw, 80px)' }}>
      <div className="location-inner max-w-[720px] w-full grid gap-[44px] items-start
        grid-cols-1 min-[700px]:grid-cols-[1fr_1fr] min-[700px]:gap-[80px]">
        <div className="loc-address" data-reveal>
          <h2 className="font-serif font-light text-[clamp(22px,3.5vw,38px)]
            text-[#E8EAEE] leading-[1.7] mb-7 tracking-[0.05em]">
            夜の静けさの中で、<br />あなたを待っています。
          </h2>
          <p className="font-sans font-extralight text-[13px]
            text-[rgba(232,234,238,0.45)] leading-[2.1] tracking-[0.06em] break-all max-[700px]:break-normal max-[700px]:text-[12px]">
            〒781-8008<br />
            高知県高知市潮新町１丁目１２−１７<br />
            コパン荘10号室
          </p>
          <a
            href="https://maps.google.com/?q=高知県高知市潮新町１丁目１２−１７"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-[22px] font-serif text-[11.5px] tracking-[0.12em]
              text-[rgba(184,190,200,0.42)] border-b border-[rgba(184,190,200,0.22)]
              no-underline transition-colors duration-300 hover:text-[#B8BEC8]"
          >
            → Google Maps で開く
          </a>
        </div>

        <div className="loc-hours" data-reveal data-d="1">
          <h3 className="font-serif font-light text-[12px] tracking-[0.22em]
            text-[#B8BEC8] uppercase mb-7">
            Hours
          </h3>
          {[
            { label: '月曜日 — 金曜日', hours: '定休日'          },
            { label: '土曜日',          hours: '17:00 — 22:00' },
            { label: '日曜日',          hours: '定休日'          },
          ].map((row) => (
            <div
              key={row.label}
              className="flex justify-between items-center py-[13px]
                border-b border-[rgba(232,234,238,0.06)]
                text-[12.5px] text-[rgba(232,234,238,0.45)]
                font-extralight tracking-[0.05em] max-[700px]:text-[11.5px] max-[700px]:tracking-[0.02em]"
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
