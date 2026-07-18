import CyclingWord from '@/components/hero/CyclingWord';

// シコウの同音異義語。identity 安定のためモジュール定数（CyclingWord の effect deps 用）。
const SHIKOU_WORDS = ['思考', '試行', '至高', '嗜好'];

export default function Hero() {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center justify-center z-[2] overflow-hidden"
    >
      {/* 「光がある」を視覚化する淡いアンバーのハロー（ロゴの背後でフェードイン） */}
      <div className="hero-glow" data-reveal aria-hidden="true" />

      {/* 大きな署名マークとサブラインを画面中央にまとめて配置 */}
      <div className="relative z-[1] flex flex-col items-center text-center px-8">
        {/* 見出しはロゴのみ（テキストなし）。視覚は静止版 <img>（reduced-motion/JS無効の
            フォールバック）。JS モーフ起動時は data-siko-morph="on" で静止版を隠し、
            HomeClient の fixed 手書きマークがこの #hero-siko-slot の位置に重なる。
            読み上げ用に sr-only「Sikō」。 */}
        <h1 className="hero-tagline m-0 leading-none" data-reveal>
          <span
            id="hero-siko-slot"
            className="siko-slot block"
            style={{ height: 'min(240px, 30vh, 56vw)', aspectRatio: '822 / 840' }}
          >
            {/* 静止版 SVG は next/image で最適化しない（SVGは対象外）。フォールバック用途。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="siko-static"
              src="/images/logo/logo-siko.svg"
              alt=""
              aria-hidden="true"
              style={{ height: '100%', width: '100%', display: 'block' }}
            />
            <span className="sr-only">Sikō</span>
          </span>
        </h1>

        <span
          className="hero-tagline-sub block font-serif font-light mt-8
            text-[clamp(13px,1.7vw,19px)] tracking-[0.14em]"
          style={{ color: 'var(--amber2)' }}
          lang="ja"
          data-reveal
        >
          <span aria-hidden="true">
            私たちは、
            <CyclingWord words={SHIKOU_WORDS} interval={3200} className="text-[var(--cream)]" />
            する。
          </span>
          <span className="sr-only">私たちは、思考する、試行する、至高する、嗜好する。</span>
        </span>
      </div>

      {/* スクロール指標（下部固定・中央グループを押し上げないよう絶対配置） */}
      <a
        href="#story"
        id="hero-scroll-link"
        aria-label="ストーリーセクションへスクロール"
        className="hero-scroll group absolute bottom-10 left-1/2 -translate-x-1/2
          inline-flex flex-col items-center gap-3 cursor-pointer no-underline"
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
    </section>
  );
}
