'use client';

import Image from 'next/image';

interface Props {
  visible: boolean;
  logoHref?: string;
}

export default function Nav({ visible, logoHref }: Props) {
  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    window._lenis?.scrollTo(el, { duration: 1.6 });
  }

  const isExternalHref = logoHref && !logoHref.startsWith('#');

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[100] flex justify-center items-center
      px-11 py-6 pointer-events-none
      max-[700px]:px-5 max-[700px]:py-4"
    >
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
          className="h-14 w-auto brightness-[0.88] transition-[filter] duration-300
            hover:brightness-110 hover:sepia hover:hue-rotate-[-10deg] hover:saturate-[1.6]"
        />
      </a>
    </nav>
  );
}
