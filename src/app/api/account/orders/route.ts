import { NextResponse } from 'next/server';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
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

  const db = getDocClient();
  const [byUser, byEmail] = await Promise.all([
    userId
      ? db.send(new QueryCommand({
          TableName: TABLE.ORDERS,
          IndexName: 'userId-index',
          KeyConditionExpression: 'userId = :uid',
          FilterExpression: '#s <> :pending',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':uid': userId, ':pending': 'pending' },
        }))
      : Promise.resolve({ Items: [] }),
    db.send(new QueryCommand({
      TableName: TABLE.ORDERS,
      IndexName: 'customerEmail-index',
      KeyConditionExpression: 'customerEmail = :email',
      FilterExpression: '#s <> :pending',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':email': email, ':pending': 'pending' },
    })),
  ]);

  const seen = new Set<string>();
  const merged: OrderRecord[] = [];
  for (const item of [...(byUser.Items ?? []), ...(byEmail.Items ?? [])] as OrderRecord[]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }

  const orders = (merged as OrderRecord[])
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
