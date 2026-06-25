import DecryptedText from '@/components/reactbits/DecryptedText';

export default function Hero() {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center justify-center z-[2] overflow-hidden"
    >
      {/* 「光がある」を視覚化する淡いアンバーのハロー（タグラインの背後でフェードイン） */}
      <div className="hero-glow" data-reveal aria-hidden="true" />

      <div className="relative z-[1] text-center px-8">
        <h1
          className="hero-tagline font-serif font-light tracking-[0.06em] leading-[1.85]
            text-[clamp(20px,4vw,46px)]"
          style={{ color: 'var(--cream)' }}
          data-reveal
        >
          暗闇の向こうに、光がある。
        </h1>
        <span
          className="hero-tagline-en block font-mono font-light mt-3
            text-[clamp(10px,1.2vw,13px)] tracking-[0.22em]"
          style={{ color: 'var(--amber2)' }}
          lang="en"
          data-reveal
        >
          <DecryptedText
            text="Somewhere beyond the darkness, there is light."
            animateOn="view"
            sequential
            revealDirection="start"
            speed={28}
            useOriginalCharsOnly
            parentClassName="inline-block"
          />
        </span>

        <a
          href="#story"
          id="hero-scroll-link"
          aria-label="ストーリーセクションへスクロール"
          className="hero-scroll group inline-flex flex-col items-center gap-3 mt-16
            cursor-pointer no-underline"
          data-reveal
        >
          <span
            className="font-mono text-[10px] tracking-[0.35em] transition-colors duration-300"
            style={{ color: 'var(--amber2)' }}
            aria-hidden="true"
          >
            SCROLL
          </span>
          <span className="hero-scroll-line" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
