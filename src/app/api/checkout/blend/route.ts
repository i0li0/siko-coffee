import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import * as Sentry from '@sentry/nextjs';
import { stripe } from '@/lib/stripe';
import { getDocClient, TABLE } from '@/lib/db';
import { buildShippingOptions } from '@/lib/shipping';
import { auth } from '@/lib/auth';
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit';
import { blendCheckoutSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const preferredRegion = ['hnd1'];

const PRICE_PER_100G = 1000;
const ALLOWED_HOSTS = new Set(['sikocoffee.com', 'www.sikocoffee.com']);

function getOrigin(req: NextRequest): string {
  const host = req.headers.get('host') ?? '';
  if (host.includes('localhost')) return `http://${host}`;
  if (host.endsWith('.vercel.app') || ALLOWED_HOSTS.has(host)) return `https://${host}`;
  return 'https://www.sikocoffee.com';
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const rl = await checkGeneralRateLimit(ip, { prefix: 'checkout-blend', maxAttempts: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = blendCheckoutSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  }

  const { items } = parsed.data;

  const origin = getOrigin(req);
  const userSession = await auth();
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
        ...(userSession?.user?.id ? { userId: userSession.user.id } : {}),
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
      ...(userSession?.user?.email ? { customer_email: userSession.user.email } : {}),
      metadata: userSession?.user?.id ? { userId: userSession.user.id } : {},
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
