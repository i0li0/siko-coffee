import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';
export const preferredRegion = ['hnd1'];

export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  revalidatePath('/');
  revalidatePath('/api/menu');
  revalidatePath('/api/instagram');

  return NextResponse.json({ revalidated: true, revalidatedAt: new Date().toISOString() });
}
