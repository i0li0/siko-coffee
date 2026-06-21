import { NextRequest, NextResponse } from 'next/server';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import * as Sentry from '@sentry/nextjs';
import { getDocClient, TABLE } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { buildShippingOptions } from '@/lib/shipping';
import { auth } from '@/lib/auth';
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit';
import type { Product } from '@/types/product';

export const dynamic = 'force-dynamic';
export const preferredRegion = ['hnd1'];

const ALLOWED_HOSTS = new Set(['sikocoffee.com', 'www.sikocoffee.com']);

function getOrigin(req: NextRequest): string {
  const host = req.headers.get('host') ?? '';
  if (host.includes('localhost')) return `http://${host}`;
  if (host.endsWith('.vercel.app') || ALLOWED_HOSTS.has(host)) return `https://${host}`;
  return 'https://www.sikocoffee.com';
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const rl = await checkGeneralRateLimit(ip, { prefix: 'checkout', maxAttempts: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } });
  }
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    // フォーム以外のボディ（JSON 等）が来た場合は不正リクエスト扱い。
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const productId = formData.get('productId');

  if (!productId || typeof productId !== 'string') {
    return NextResponse.json({ error: 'Invalid productId' }, { status: 400 });
  }

  const result = await getDocClient().send(
    new GetCommand({
      TableName: TABLE.PRODUCTS,
      Key: { id: productId },
    }),
  );

  const product = (result.Item ?? null) as Product | null;

  if (!product || !product.isPublic || product.type === 'menu' || product.canCustomize) {
    return NextResponse.json({ error: 'Product not available' }, { status: 404 });
  }

  const origin = getOrigin(req);
  const userSession = await auth();

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      locale: 'ja',
      ...(userSession?.user?.email ? { customer_email: userSession.user.email } : {}),
      metadata: userSession?.user?.id ? { userId: userSession.user.id } : {},
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: {
              name: product.name,
              description: product.description || undefined,
            },
            unit_amount: product.price,
          },
          quantity: 1,
        },
      ],
      shipping_address_collection: { allowed_countries: ['JP'] },
      shipping_options: buildShippingOptions(product.price),
      success_url: `${origin}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/shop`,
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'checkout' } });
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }

  if (!session.url) {
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }

  return NextResponse.redirect(session.url, { status: 303 });
}
