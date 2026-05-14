export default function Instagram() {
  return null
}

function _Instagram() {
  return (
    <section id="sns"
      className="relative min-h-screen flex flex-col items-center justify-center z-[2]
        gap-[44px] py-[110px] px-10 max-[700px]:py-[90px] max-[700px]:px-[22px]">
      <div className="sns-header text-center" data-reveal>
        <h2 className="font-serif font-light text-[clamp(16px,2.6vw,26px)]
          text-[rgba(240,235,224,0.45)] tracking-[0.22em] mb-2">
          Instagram
        </h2>
        <a
          href="https://instagram.com/siko_coffee"
          target="_blank"
          rel="noopener noreferrer"
          className="font-serif italic text-[13.5px] text-[#c8a96e]
            tracking-[0.1em] no-underline"
        >
          @siko_coffee
        </a>
      </div>

      <div
        className="sns-grid grid gap-[3px] max-w-[620px] w-full
          grid-cols-4 max-[700px]:grid-cols-2 max-[700px]:max-w-[300px]"
        data-reveal
        data-d="1"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square flex items-center justify-center
              font-serif text-[9px] tracking-[0.08em]
              text-[rgba(240,235,224,0.1)] border border-[rgba(240,235,224,0.05)]"
            style={{
              background:
                'repeating-linear-gradient(45deg,rgba(240,235,224,0.02),rgba(240,235,224,0.02) 1px,transparent 1px,transparent 9px)',
            }}
          >
            photo
          </div>
        ))}
      </div>
    </section>
  )
}
