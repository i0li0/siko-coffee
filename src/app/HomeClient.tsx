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
import TerminalLoader from '@/components/canvas/TerminalLoader';
import type { InstagramPost } from '@/lib/instagram';

const StarsCanvas = dynamic(() => import('@/components/canvas/StarsCanvas'), { ssr: false });
const SmokeField  = dynamic(() => import('@/components/SmokeField'),          { ssr: false });
const SmokeCanvas = dynamic(() => import('@/components/canvas/SmokeCanvas'),  { ssr: false });

interface Props {
  instagramPosts: InstagramPost[];
}

export default function HomeClient({ instagramPosts }: Props) {
  const [opened, setOpened] = useState<boolean | null>(null);

  useEffect(() => {
    const shown = !!sessionStorage.getItem('loader_shown');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpened(shown);
  }, []);

  useScrollAnimations(opened === true);

  return (
    <>
      <StarsCanvas />
      <SmokeField />
      <SmokeCanvas />

      {opened === false && (
        <TerminalLoader onFinish={() => { sessionStorage.setItem('loader_shown', '1'); setOpened(true); }} />
      )}

      <Nav visible={opened === true} />
      <DotNav visible={opened === true} />

      <main>
        <Hero />
        <Story />
        <Menu />
        <Location />
        <Instagram posts={instagramPosts} />
        <Contact />
      </main>

      <Footer />
    </>
  );
}
