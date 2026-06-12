import { fetchInstagramPosts } from '@/lib/instagram';
import { fetchMenuItems } from '@/lib/menu';
import HomeClient from './HomeClient';

export default async function Home() {
  const [instagramPosts, menuItems] = await Promise.all([
    fetchInstagramPosts(),
    fetchMenuItems(),
  ]);

  return <HomeClient instagramPosts={instagramPosts} menuItems={menuItems} />;
}
