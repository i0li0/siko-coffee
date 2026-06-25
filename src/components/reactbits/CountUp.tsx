'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

/**
 * ReactBits CountUp の GSAP 移植版。
 * 純正は motion(useSpring) 依存だが、本プロジェクトは既に GSAP を使うため
 * 依存を増やさず同等挙動（in-view once でカウント）を再現する。
 */
interface CountUpProps {
  to: number;
  from?: number;
  duration?: number;
  separator?: string;
  className?: string;
}

export default function CountUp({ to, from = 0, duration = 1.4, separator = '', className = '' }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const format = (n: number) => {
      const s = Intl.NumberFormat('en-US', {
        useGrouping: !!separator,
        maximumFractionDigits: 0,
      }).format(n);
      return separator ? s.replace(/,/g, separator) : s;
    };

    el.textContent = format(from);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = format(to);
      return;
    }

    const obj = { v: from };
    let tween: gsap.core.Tween | null = null;

    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            io.disconnect();
            tween = gsap.to(obj, {
              v: to,
              duration,
              ease: 'power2.out',
              onUpdate: () => {
                el.textContent = format(obj.v);
              },
            });
          }
        });
      },
      { threshold: 0 }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      tween?.kill();
    };
  }, [to, from, duration, separator]);

  return <span ref={ref} className={className} />;
}
