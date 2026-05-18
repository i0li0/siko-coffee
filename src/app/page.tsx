'use client';

import { useState } from 'react';
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

const StarsCanvas = dynamic(() => import('@/components/canvas/StarsCanvas'), {
  ssr: false,
});
const SmokeField = dynamic(() => import('@/components/SmokeField'), {
  ssr: false,
});
const SmokeCanvas = dynamic(() => import('@/components/canvas/SmokeCanvas'), {
  ssr: false,
});
const OpeningCanvas = dynamic(
  () => import('@/components/canvas/OpeningCanvas'),
  { ssr: false },
);

const DEV = process.env.NODE_ENV === 'development';

export default function Home() {
  const [opened, setOpened] = useState(DEV);

  useScrollAnimations(opened);

  return (
    <>
      {!DEV && (
        <>
          <StarsCanvas />
          <SmokeField />
          <SmokeCanvas />
          <OpeningCanvas onFinish={() => setOpened(true)} />
        </>
      )}

      <Nav visible={opened} />
      <DotNav visible={opened} />

      <main>
        <Hero />
        <Story />
        <Menu />
        <Location />
        <Instagram />
        <Contact />
      </main>

      <Footer />
    </>
  );
}
