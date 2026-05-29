'use client';

import { useEffect } from 'react';
import Footer from '@/components/layout/Footer';
import Nav from '@/components/layout/Nav';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <Nav visible logoHref="/" />

      <main className="relative min-h-screen z-[1] flex items-center justify-center">
        <div className="text-center px-[22px] py-[120px] max-w-[480px] mx-auto">

          <div
            className="font-serif font-light text-[clamp(40px,10vw,80px)]
              text-[rgba(200,169,110,0.12)] tracking-[0.1em] select-none mb-[32px]"
            aria-hidden="true"
          >
            —
          </div>

          <h1 className="font-serif font-light text-[clamp(18px,3vw,28px)]
            text-[#f0ebe0] tracking-[0.08em] mb-[14px]">
            エラーが発生しました
          </h1>

          <p className="font-serif italic text-[12.5px] text-[rgba(200,169,110,0.5)]
            tracking-[0.1em] leading-[2.2] mb-[52px]">
            しばらくしてから、もう一度お試しください。
          </p>

          <div className="flex gap-4 justify-center">
            <button
              onClick={reset}
              className="inline-block font-sans font-extralight text-[10px]
                tracking-[0.22em] text-[rgba(200,169,110,0.5)]
                border border-[rgba(200,169,110,0.2)] px-[28px] py-[13px]
                cursor-pointer bg-transparent
                transition-all duration-300
                hover:text-[#c8a96e] hover:border-[rgba(200,169,110,0.45)]"
            >
              再試行
            </button>
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
        </div>
      </main>

      <Footer />
    </>
  );
}
