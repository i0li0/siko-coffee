import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import * as Sentry from '@sentry/nextjs';
import { stripe } from '@/lib/stripe';
import { getDocClient, TABLE } from '@/lib/db';
import { buildShippingOptions } from '@/lib/shipping';

export const dynamic = 'force-dynamic';
export const preferredRegion = ['hnd1'];

const PRICE_PER_100G = 1000;
const GRAM_OPTIONS = new Set([100, 150, 200, 250, 300, 350, 400, 450, 500]);
const ALLOWED_HOSTS = new Set(['sikocoffee.com', 'www.sikocoffee.com']);

function getOrigin(req: NextRequest): string {
  const host = req.headers.get('host') ?? '';
  if (host.includes('localhost')) return `http://${host}`;
  if (host.endsWith('.vercel.app') || ALLOWED_HOSTS.has(host)) return `https://${host}`;
  return 'https://www.sikocoffee.com';
}

interface CartItem {
  name: string;
  ratios: number[];
  grind?: string;
  grams?: number;
  custom?: boolean;
  single?: boolean;
  publish?: boolean;
}

export async function POST(req: NextRequest) {
  let body: { items: CartItem[] };
  try {
    body = await req.json() as { items: CartItem[] };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { items } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
  }

  // Basic validation
  for (const item of items) {
    if (typeof item.name !== 'string' || item.name.length > 40) {
      return NextResponse.json({ error: 'Invalid item' }, { status: 400 });
    }
    if (!Array.isArray(item.ratios) || item.ratios.length !== 3) {
      return NextResponse.json({ error: 'Invalid ratios' }, { status: 400 });
    }
    const total = item.ratios.reduce((a, b) => a + b, 0);
    if (Math.abs(total - 100) > 1) {
      return NextResponse.json({ error: 'Ratios must sum to 100' }, { status: 400 });
    }
    const grams = item.grams ?? 200;
    if (!GRAM_OPTIONS.has(grams)) {
      return NextResponse.json({ error: 'Invalid grams' }, { status: 400 });
    }
  }

  if (items.length > 20) {
    return NextResponse.json({ error: 'Too many items' }, { status: 400 });
  }

  // Validate individual ratio values
  for (const item of items) {
    if (!item.ratios.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100)) {
      return NextResponse.json({ error: 'Invalid ratio values' }, { status: 400 });
    }
  }

  const origin = getOrigin(req);
  const orderId = randomUUID();

  let subtotal = 0;
  const lineItems = items.map((item) => {
    const grind = typeof item.grind === 'string' ? item.grind : '豆のまま';
    const grams = item.grams ?? 200;
    const unitAmount = Math.round((grams / 100) * PRICE_PER_100G);
    subtotal += unitAmount;
    const productName = item.single
      ? `シングルオリジン ${item.name}`
      : item.custom
        ? `${item.name}（オリジナルブレンド）`
        : item.name;

    return {
      price_data: {
        currency: 'jpy' as const,
        product_data: {
          name: productName,
          description: `${grind} / ${grams}g`,
        },
        unit_amount: unitAmount,
      },
      quantity: 1,
    };
  });

  // ペンディング注文を事前保存（webhookで paid に更新）
  try {
    await getDocClient().send(new PutCommand({
      TableName: TABLE.ORDERS,
      Item: {
        id: orderId,
        items,
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    }));
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'checkout/blend', step: 'pre-save' } });
    return NextResponse.json({ error: 'Failed to save order' }, { status: 500 });
  }

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      locale: 'ja',
      line_items: lineItems,
      shipping_address_collection: { allowed_countries: ['JP'] },
      shipping_options: buildShippingOptions(subtotal),
      client_reference_id: orderId,
      success_url: `${origin}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/shop`,
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'checkout/blend' } });
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }

  if (!session.url) {
    return NextResponse.json({ error: 'No checkout URL returned' }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
