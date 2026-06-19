export default function Hero() {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center justify-center z-[2]"
    >
      <div className="text-center px-8">
        <h1
          className="hero-tagline font-serif font-light tracking-[0.1em] leading-[1.85]
            text-[clamp(22px,4vw,46px)]"
          style={{ color: 'var(--cream)' }}
          data-reveal
        >
          暗闇の向こうに、光がある。
        </h1>
        <span
          className="hero-tagline-en block font-mono font-light mt-3
            text-[clamp(10px,1.2vw,13px)] tracking-[0.22em]"
          style={{ color: 'var(--amber2)' }}
          data-reveal
          data-d="1"
        >
          Somewhere beyond the darkness, there is light.
        </span>
        <a
          href="#story"
          id="hero-scroll-link"
          className="hero-scroll inline-block mt-14 font-serif text-xl
            cursor-pointer no-underline"
          style={{ color: 'rgba(212,160,23,0.6)' }}
          data-reveal
          data-d="2"
        >
          ↓
        </a>
      </div>
    </section>
  );
}
