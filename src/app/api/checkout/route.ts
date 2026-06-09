import { NextRequest, NextResponse } from 'next/server';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getDocClient, TABLE } from '@/lib/db';
import { stripe } from '@/lib/stripe';
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
  const formData = await req.formData();
  const productId = formData.get('productId');

  if (!productId || typeof productId !== 'string') {
    return NextResponse.json({ error: 'Invalid productId' }, { status: 400 });
  }

  const result = await getDocClient().send(
    new ScanCommand({
      TableName: TABLE.PRODUCTS,
      FilterExpression: 'id = :id',
      ExpressionAttributeValues: { ':id': productId },
    }),
  );

  const product = (result.Items?.[0] ?? null) as Product | null;

  if (!product || !product.isPublic || product.type === 'menu' || product.canCustomize) {
    return NextResponse.json({ error: 'Product not available' }, { status: 404 });
  }

  const origin = getOrigin(req);

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      locale: 'ja',
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
      success_url: `${origin}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/shop`,
    });
  } catch (err) {
    console.error('Stripe session create error:', err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }

  if (!session.url) {
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }

  return NextResponse.redirect(session.url, { status: 303 });
}
