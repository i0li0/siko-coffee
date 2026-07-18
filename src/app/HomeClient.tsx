'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Nav from '@/components/layout/Nav';
import DotNav from '@/components/layout/DotNav';
import Footer from '@/components/layout/Footer';
import Hero from '@/components/sections/Hero';
import Story from '@/components/sections/Story';
import Menu from '@/components/sections/Menu';
import Location from '@/components/sections/Location';
import Instagram from '@/components/sections/Instagram';
import Contact from '@/components/sections/Contact';
import SikoWordmark from '@/components/canvas/SikoWordmark';
import { useScrollAnimations } from '@/lib/useScrollAnimations';
import type { InstagramPost } from '@/lib/instagram';
import type { Product } from '@/types/product';

const TerminalLoader = dynamic(() => import('@/components/canvas/TerminalLoader'), { ssr: false });

interface Props {
  instagramPosts: InstagramPost[];
  menuItems: Product[];
  /** 手書きアニメ版ロゴの SVG マークアップ（RSC で読み込んだもの） */
  sikoMarkup: string;
}

export default function HomeClient({ instagramPosts, menuItems, sikoMarkup }: Props) {
  const [opened, setOpened] = useState<boolean | null>(null);
  const [replay, setReplay] = useState(false);

  useEffect(() => {
    const shown = !!sessionStorage.getItem('loader_shown');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpened(shown);
  }, []);

  useScrollAnimations(opened === true);

  const handleReplay = () => {
    setReplay(true);
    setOpened(false);
  };

  const handleFinish = () => {
    sessionStorage.setItem('loader_shown', '1');
    setReplay(false);
    setOpened(true);
  };

  return (
    <>
      {opened === false && (
        <TerminalLoader key={replay ? 'replay' : 'init'} onFinish={handleFinish} replay={replay} />
      )}

      <Nav visible={opened === true} onReplay={handleReplay} useMorphIcon />
      <DotNav visible={opened === true} />

      {/* Hero の署名マークがスクロールでヘッダー中央へ収束する単一 fixed 要素。
          手書きアニメ(SMIL)はインライン必須なので SikoWordmark で展開する。
          既定は非表示で、useScrollAnimations がモーフを初期化したとき data-siko-morph="on"
          が立って可視化される（reduced-motion / JS 無効時は静止フォールバックが残る）。 */}
      {sikoMarkup && (
        <div id="siko-morph" className="siko-morph-layer" aria-hidden="true">
          <SikoWordmark markup={sikoMarkup} style={{ width: '100%', height: '100%' }} />
        </div>
      )}

      <main>
        <Hero />
        <Story />
        <Menu items={menuItems} />
        <Location />
        <Instagram posts={instagramPosts} />
        <Contact />
      </main>

      {opened === true && <Footer />}
    </>
  );
}
