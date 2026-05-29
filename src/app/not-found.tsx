import Nav from '@/components/layout/Nav';
import Footer from '@/components/layout/Footer';

export const metadata = {
  title: '404 — Sikō Coffee',
};

export default function NotFound() {
  return (
    <>
      <Nav visible logoHref="/" />

      <main className="relative min-h-screen z-[1] flex items-center justify-center">
        <div className="text-center px-[22px] py-[120px] max-w-[480px] mx-auto">

          <div
            className="font-serif font-light text-[clamp(80px,18vw,160px)]
              text-[rgba(200,169,110,0.08)] tracking-[0.05em] select-none leading-none mb-[32px]"
            aria-hidden="true"
          >
            404
          </div>

          <h1 className="font-serif font-light text-[clamp(18px,3vw,28px)]
            text-[#f0ebe0] tracking-[0.08em] mb-[14px]">
            ページが見つかりません
          </h1>

          <p className="font-serif italic text-[12.5px] text-[rgba(200,169,110,0.5)]
            tracking-[0.1em] leading-[2.2] mb-[52px]">
            お探しのページは存在しないか、<br />
            移動した可能性があります。
          </p>

          <a
            href="/"
            className="inline-block font-sans font-extralight text-[10px]
              tracking-[0.22em] text-[rgba(200,169,110,0.5)]
              border border-[rgba(200,169,110,0.2)] px-[28px] py-[13px]
              transition-all duration-300
              hover:text-[#c8a96e] hover:border-[rgba(200,169,110,0.45)]"
          >
            TOP へ戻る
          </a>
        </div>
      </main>

      <Footer />
    </>
  );
}
