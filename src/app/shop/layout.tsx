import { Zen_Kurenaido } from 'next/font/google';
import './shop.css';

const zenKurenaido = Zen_Kurenaido({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-kure',
  display: 'swap',
  preload: false,
});

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <div className={zenKurenaido.variable}>{children}</div>;
}
