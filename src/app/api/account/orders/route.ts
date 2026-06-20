import { NextResponse } from 'next/server';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { auth } from '@/lib/auth';
import { getDocClient, TABLE } from '@/lib/db';
import type { OrderRecord } from '@/types/admin';

export const dynamic = 'force-dynamic';
export const preferredRegion = ['hnd1'];

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const email = session.user.email.toLowerCase();

  const result = await getDocClient().send(new ScanCommand({
    TableName: TABLE.ORDERS,
    FilterExpression: '(#s <> :pending) AND (userId = :uid OR customerEmail = :email)',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':pending': 'pending',
      ':uid': userId,
      ':email': email,
    },
  }));

  const orders = ((result.Items ?? []) as OrderRecord[])
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .map(o => ({
      id: o.id,
      status: o.status,
      amount: o.amount,
      createdAt: o.createdAt,
      paidAt: o.paidAt,
      items: (o.items ?? []).map(it => ({
        name: it.name,
        grams: it.grams,
        grind: it.grind,
        custom: it.custom,
        single: it.single,
      })),
      trackingNumber: o.trackingNumber,
      trackingUrl: o.trackingUrl,
      carrier: o.carrier,
    }));

  return NextResponse.json({ orders });
}
