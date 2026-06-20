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
import { useScrollAnimations } from '@/lib/useScrollAnimations';
import type { InstagramPost } from '@/lib/instagram';
import type { Product } from '@/types/product';

const StarsCanvas    = dynamic(() => import('@/components/canvas/StarsCanvas'),     { ssr: false });
const SmokeField     = dynamic(() => import('@/components/SmokeField'),              { ssr: false });
const SmokeCanvas    = dynamic(() => import('@/components/canvas/SmokeCanvas'),     { ssr: false });
const TerminalLoader = dynamic(() => import('@/components/canvas/TerminalLoader'),  { ssr: false });

interface Props {
  instagramPosts: InstagramPost[];
  menuItems: Product[];
}

export default function HomeClient({ instagramPosts, menuItems }: Props) {
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
      <StarsCanvas />
      {/* SmokeCanvas/SmokeField はローダー完了後にレンダー — ローダー中の並走JS評価を抑制 */}
      {opened === true && <SmokeField />}
      {opened === true && <SmokeCanvas />}

      {opened === false && (
        <TerminalLoader key={replay ? 'replay' : 'init'} onFinish={handleFinish} replay={replay} />
      )}

      <Nav visible={opened === true} onReplay={handleReplay} />
      <DotNav visible={opened === true} />

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
