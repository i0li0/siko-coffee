import { readFileSync } from 'fs';
import { join } from 'path';
import { fetchInstagramPosts } from '@/lib/instagram';
import { fetchMenuItems } from '@/lib/menu';
import HomeClient from './HomeClient';

// 手書きアニメ版ロゴ（SMIL/mask）はインライン展開必須のため、ここでファイルを読み込んで
// クライアントへ渡す（<img> だとマスクが閉じたまま不可視になる。[[logo-animation]]）。
function loadSikoWriteSvg() {
  try {
    return readFileSync(join(process.cwd(), 'public/images/logo/logo-siko-write.svg'), 'utf8');
  } catch {
    return '';
  }
}

export default async function Home() {
  const [instagramPosts, menuItems] = await Promise.all([
    fetchInstagramPosts(),
    fetchMenuItems(),
  ]);

  return (
    <HomeClient
      instagramPosts={instagramPosts}
      menuItems={menuItems}
      sikoMarkup={loadSikoWriteSvg()}
    />
  );
}
