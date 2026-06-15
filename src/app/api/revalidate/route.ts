import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifyBearer } from '@/lib/safeCompare';

export const dynamic = 'force-dynamic';
export const preferredRegion = ['hnd1'];

export async function POST(req: NextRequest) {
  if (!verifyBearer(req.headers.get('authorization'), process.env.REVALIDATE_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  revalidatePath('/');
  revalidatePath('/api/menu');
  revalidatePath('/api/instagram');

  return NextResponse.json({ revalidated: true, revalidatedAt: new Date().toISOString() });
}
