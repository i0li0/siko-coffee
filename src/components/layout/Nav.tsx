'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import UserMenu from '@/components/auth/UserMenu';

interface Props {
  visible: boolean;
  logoHref?: string;
  onReplay?: () => void;
}

const SECTIONS: { id: string; label: string }[] = [
  { id: 'hero', label: 'Top' },
  { id: 'story', label: 'Story' },
  { id: 'menu', label: 'Menu' },
  { id: 'location', label: 'Location' },
  { id: 'sns', label: 'Instagram' },
  { id: 'contact', label: 'Contact' },
];

export default function Nav({ visible, logoHref, onReplay }: Props) {
  const pathname = usePathname();
  const isShop = pathname?.startsWith('/shop');
  const isHome = pathname === '/';

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Escape to close + return focus, click outside to close
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onPointer(e: MouseEvent) {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [menuOpen]);

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    window._lenis?.scrollTo(el, { duration: 1.6 });
  }

  function onSectionClick(e: ReactMouseEvent, id: string) {
    // On the home page intercept and smooth-scroll; elsewhere let the
    // anchor (/#id) navigate to home and scroll natively.
    if (isHome) {
      e.preventDefault();
      scrollTo(id);
    }
    setMenuOpen(false);
  }

  const isExternalHref = logoHref && !logoHref.startsWith('#');

  const itemCls = `pointer-events-auto transition-opacity duration-[1200ms] ${visible ? 'opacity-100' : 'opacity-0'}`;

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[100] flex justify-center items-center
      px-5 py-4 pointer-events-none
      min-[700px]:px-11 min-[700px]:py-6"
    >
      {/* ── セクションメニュー（左） ── */}
      <div className={`absolute left-5 top-1/2 -translate-y-1/2 min-[700px]:left-11 ${itemCls}`}>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Section menu"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-controls="nav-section-menu"
          onClick={() => setMenuOpen((o) => !o)}
          className="group flex items-center justify-center min-w-[44px] min-h-[44px] -ml-2.5"
        >
          <span className="flex flex-col gap-[5px]">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`block h-px transition-all duration-300
                  ${menuOpen ? 'bg-[var(--amber)]' : 'bg-[rgba(255,252,245,0.75)] group-hover:bg-[var(--amber)]'}`}
                style={{ width: i === 1 ? '18px' : '24px' }}
              />
            ))}
          </span>
        </button>

        {menuOpen && (
          <div
            id="nav-section-menu"
            ref={menuRef}
            className="absolute left-0 top-[calc(100%+10px)] min-w-[168px] flex flex-col py-2
              rounded-md border bg-[var(--bg2)]
              shadow-[0_10px_34px_rgba(0,0,0,0.55)]"
            style={{ borderColor: 'var(--faint)' }}
          >
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`/#${s.id}`}
                onClick={(e) => onSectionClick(e, s.id)}
                className="px-5 py-2.5 font-mono text-[13px] tracking-[0.08em] no-underline
                  text-[var(--cream)] transition-colors duration-200
                  hover:text-[var(--amber)] hover:bg-[var(--surface)]"
              >
                {s.label}
              </a>
            ))}
            {onReplay && (
              <>
                <div className="my-1" style={{ borderTop: '1px solid var(--faint)' }} />
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onReplay(); }}
                  className="px-5 py-2.5 font-mono text-[13px] tracking-[0.08em] text-left
                    text-[var(--amber3)] transition-colors duration-200
                    hover:text-[var(--amber)] hover:bg-[var(--surface)]"
                >
                  ▸ Terminal
                </button>
              </>
            )}
          </div>
        )}
      </div>

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

      {/* ── shop / account（右端） ── */}
      <div className={`absolute top-1/2 -translate-y-1/2
        right-5 min-[700px]:right-11 flex items-center gap-5
        transition-opacity duration-[1200ms]
        ${visible ? 'opacity-100' : 'opacity-0'}`}>
        {!isShop && (
          <Link href="/shop" className="group pointer-events-auto no-underline">
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
          </Link>
        )}
        <UserMenu />
      </div>
    </nav>
  );
}
