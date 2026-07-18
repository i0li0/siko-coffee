'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

/**
 * 文中の 2 文字を数秒おきに入れ替える表示（例: 思考→試行→至高→嗜好）。
 * CountUp.tsx と同じ流儀で、React state を持たず ref + GSAP タイムラインで
 * テキストを差し替える（毎 tick の再レンダーを避ける）。
 *
 * 日本語なのでスクランブル/decrypt は当てず、フェード（ディゾルブ）で切り替える
 * （[[reactbits]] の鉄則: 和文に decrypt を当てない）。
 */
interface CyclingWordProps {
  /** 巡回させる語（identity を安定させるためモジュール定数を渡すこと） */
  words: string[];
  /** 各語を見せておく時間 (ms) */
  interval?: number;
  className?: string;
}

export default function CyclingWord({ words, interval = 3500, className = '' }: CyclingWordProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || words.length === 0) return;

    el.textContent = words[0];

    // 単語が 1 つだけ、または reduced-motion のときは先頭語で静止
    if (words.length === 1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let index = 0;
    const hold = interval / 1000; // 表示保持（秒）
    const fade = 0.42;

    const tl = gsap.timeline({ repeat: -1 });
    words.forEach(() => {
      tl.to(el, {
        duration: fade,
        opacity: 0,
        filter: 'blur(5px)',
        y: -7,
        ease: 'power2.in',
        delay: hold,
        onComplete: () => {
          index = (index + 1) % words.length;
          el.textContent = words[index];
        },
      })
        .set(el, { y: 9 })
        .to(el, {
          duration: fade,
          opacity: 1,
          filter: 'blur(0px)',
          y: 0,
          ease: 'power2.out',
        });
    });

    const pause = () => tl.pause();
    const resume = () => tl.play();
    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', resume);
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', resume);

    return () => {
      tl.kill();
      el.removeEventListener('mouseenter', pause);
      el.removeEventListener('mouseleave', resume);
      el.removeEventListener('focusin', pause);
      el.removeEventListener('focusout', resume);
    };
  }, [words, interval]);

  return <span ref={ref} className={className} style={{ display: 'inline-block', willChange: 'transform, opacity, filter' }} />;
}
