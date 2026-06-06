'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';

interface Props {
  visible: boolean;
  logoHref?: string;
}

export default function Nav({ visible, logoHref }: Props) {
  const pathname = usePathname();
  const isShop = pathname?.startsWith('/shop');

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    window._lenis?.scrollTo(el, { duration: 1.6 });
  }

  const isExternalHref = logoHref && !logoHref.startsWith('#');

  const itemCls = `pointer-events-auto transition-opacity duration-[1200ms] ${visible ? 'opacity-100' : 'opacity-0'}`;

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[100] flex justify-center items-center
      px-5 py-4 pointer-events-none
      min-[700px]:px-11 min-[700px]:py-6"
    >
      {/* ── サイドバーアイコン（左） ── */}
      <button
        aria-label="Menu"
        className={`absolute left-5 top-1/2 -translate-y-1/2 flex flex-col gap-[5px] p-1
          group min-[700px]:left-11 ${itemCls}`}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block h-px bg-[rgba(255,252,245,0.75)] transition-all duration-300
              group-hover:bg-[var(--amber)]"
            style={{ width: i === 1 ? '18px' : '24px' }}
          />
        ))}
      </button>

      {/* ── ロゴ（中央） ── */}
      <a
        href={logoHref ?? '#hero'}
        onClick={isExternalHref ? undefined : (e) => {
          e.preventDefault();
          scrollTo((logoHref ?? '#hero').replace('#', ''));
        }}
        className={`flex items-center no-underline pointer-events-auto
          transition-opacity duration-[1200ms] ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        <Image
          src="/images/logo/logo_siko8.png"
          alt="Sikō Coffee"
          width={96}
          height={96}
          priority
          className="h-20 w-auto brightness-[0.88] transition-[filter] duration-300
            hover:brightness-110 hover:sepia hover:hue-rotate-[-10deg] hover:saturate-[1.6]"
        />
      </a>

      {/* ── shop / login テキスト（中央寄り） ── */}
      <div className={`absolute top-1/2 -translate-y-1/2
        right-[68px] min-[700px]:right-[10%]
        transition-opacity duration-[1200ms]
        ${visible ? 'opacity-100' : 'opacity-0'}`}>
        {isShop ? (
          <button aria-label="Login" className="group pointer-events-auto">
            <span className="relative flex flex-col items-center gap-0 w-[52px]">
              <span className="font-mono font-light text-[16px] tracking-[0.04em]
                text-[rgba(255,252,245,0.92)] transition-colors duration-300
                group-hover:text-[var(--amber)]">
                login
              </span>
              <span className="block h-px w-0 group-hover:w-full transition-[width] duration-500 ease-out"
                style={{ background: 'linear-gradient(90deg, transparent, var(--amber), transparent)' }} />
            </span>
          </button>
        ) : (
          <a href="/shop" className="group pointer-events-auto no-underline">
            <span className="relative flex flex-col items-center gap-0 w-[52px]">
              <span className="font-mono font-light text-[16px] tracking-[0.04em]
                text-[rgba(255,252,245,0.92)] transition-colors duration-300
                group-hover:text-[var(--amber)]"
                style={{ fontFeatureSettings: '"ss01"' }}>
                shop
              </span>
              <span className="block h-px w-0 group-hover:w-full transition-[width] duration-500 ease-out"
                style={{ background: 'linear-gradient(90deg, transparent, var(--amber), transparent)' }} />
            </span>
          </a>
        )}
      </div>

      {/* ── ユーザーアイコン（右端・常時表示） ── */}
      <button
        aria-label="User"
        className={`absolute right-11 top-1/2 -translate-y-1/2 group pointer-events-auto
          right-5 min-[700px]:right-11 transition-opacity duration-[1200ms]
          ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        <span className="flex items-center justify-center w-[26px] h-[26px] rounded-full
          border border-[rgba(255,252,245,0.3)]
          transition-all duration-300 group-hover:border-[var(--amber)]">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="4.5" r="2.5"
              className="group-hover:[stroke:var(--amber)]"
              stroke="rgba(255,252,245,0.75)" strokeWidth="1" />
            <path d="M1.5 12.5c0-3.038 2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5"
              className="group-hover:[stroke:var(--amber)]"
              stroke="rgba(255,252,245,0.75)" strokeWidth="1" strokeLinecap="round" />
          </svg>
        </span>
      </button>
    </nav>
  );
}
