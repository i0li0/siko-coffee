import { NextResponse } from 'next/server';

const FIELDS = 'id,media_type,media_url,thumbnail_url,permalink';
const LIMIT = 8;

export const preferredRegion = ['hnd1'];

// Token expires in 60 days. Refresh with:
// GET https://graph.instagram.com/refresh_access_token
//   ?grant_type=ig_refresh_token&access_token={token}
export const revalidate = 3600;

export async function GET() {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return NextResponse.json([]);

  try {
    const url =
      `https://graph.instagram.com/me/media` +
      `?fields=${FIELDS}&limit=${LIMIT}&access_token=${token}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });

    if (!res.ok) {
      console.error('Instagram API error:', res.status, await res.text());
      return NextResponse.json([]);
    }

    const json = await res.json();
    return NextResponse.json(json.data ?? []);
  } catch (err) {
    console.error('Instagram fetch error:', err);
    return NextResponse.json([]);
  }
}
