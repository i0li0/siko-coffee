import { NextResponse } from 'next/server';
import { fetchInstagramPosts } from '@/lib/instagram';

export const preferredRegion = ['hnd1'];
export const revalidate = 3600;

export async function GET() {
  const posts = await fetchInstagramPosts();
  return NextResponse.json(posts);
}
