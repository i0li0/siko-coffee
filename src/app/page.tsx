import { fetchInstagramPosts } from '@/lib/instagram';
import HomeClient from './HomeClient';

export default async function Home() {
  const instagramPosts = await fetchInstagramPosts();

  return <HomeClient instagramPosts={instagramPosts} />;
}
