'use client';

import { useState, useEffect } from 'react';
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

const DEV = process.env.NODE_ENV === 'development';

export default function Home() {
  const [opened, setOpened] = useState(DEV); // 開発中は最初からtrue

  useScrollAnimations(opened);

  return (
    <>
      {/* 本番のみCanvas読み込み */}
      {!DEV && <CanvasLayers onFinish={() => setOpened(true)} />}

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

// Canvas系を別コンポーネントに切り出し（本番のみレンダリング）
function CanvasLayers({ onFinish }: { onFinish: () => void }) {
  const StarsCanvas = require('@/components/canvas/StarsCanvas').default;
  const SmokeField = require('@/components/SmokeField').default;
  const SmokeCanvas = require('@/components/canvas/SmokeCanvas').default;
  const OpeningCanvas = require('@/components/canvas/OpeningCanvas').default;

  return (
    <>
      <StarsCanvas />
      <SmokeField />
      <SmokeCanvas />
      <OpeningCanvas onFinish={onFinish} />
    </>
  );
}
