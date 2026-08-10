import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAuthorizedRevalidate } from '@/lib/revalidateAuth';

export const dynamic = 'force-dynamic';
export const preferredRegion = ['hnd1'];

export async function POST(req: NextRequest) {
  // 🔴 CloudFront 経由では `Authorization` が OAC の SigV4 署名に上書きされるので
  // 届かない。`x-revalidate-secret` を使うこと。理由は `src/lib/revalidateAuth.ts`。
  if (!isAuthorizedRevalidate(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  revalidatePath('/');
  revalidatePath('/api/menu');
  revalidatePath('/api/instagram');

  return NextResponse.json({ revalidated: true, revalidatedAt: new Date().toISOString() });
}
