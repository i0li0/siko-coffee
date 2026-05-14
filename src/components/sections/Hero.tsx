export default function Hero() {
  return (
    <section id="hero" className="relative min-h-screen flex items-center justify-center z-[2]">
      <div className="text-center">
        <p
          className="hero-tagline font-serif font-light tracking-[0.1em] leading-[1.85]
            text-[clamp(20px,3.8vw,44px)] text-[#f0ebe0] mb-[14px]"
          data-reveal
        >
          暗闇の向こうに、光がある。
        </p>
        <span
          className="hero-tagline-en block font-serif italic font-light
            text-[clamp(11px,1.6vw,17px)] tracking-[0.18em]
            text-[rgba(240,235,224,0.45)] mb-[52px]"
          data-reveal
          data-d="1"
        >
          Somewhere beyond the darkness, there is light.
        </span>
        <a
          href="#story"
          id="hero-scroll-link"
          className="hero-scroll inline-block text-[rgba(200,169,110,0.36)]
            font-serif text-xl cursor-pointer no-underline"
          data-reveal
          data-d="2"
        >
          ↓
        </a>
      </div>
    </section>
  )
}
