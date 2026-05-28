import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { stripe } from '@/lib/stripe';
import type { Product } from '@/types/product';

export const dynamic = 'force-dynamic';
export const preferredRegion = ['hnd1'];

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const productId = formData.get('productId');

  if (!productId || typeof productId !== 'string') {
    return NextResponse.json({ error: 'Invalid productId' }, { status: 400 });
  }

  const client = new DynamoDBClient({ region: 'ap-northeast-1' });
  const docClient = DynamoDBDocumentClient.from(client);

  const result = await docClient.send(
    new ScanCommand({
      TableName: 'siko-coffee-products',
      FilterExpression: 'id = :id',
      ExpressionAttributeValues: { ':id': productId },
    }),
  );

  const product = (result.Items?.[0] ?? null) as Product | null;

  if (!product || !product.isPublic || product.type === 'menu' || product.canCustomize) {
    return NextResponse.json({ error: 'Product not available' }, { status: 404 });
  }

  const host = req.headers.get('host') ?? 'www.sikocoffee.com';
  const origin = host.includes('localhost') ? `http://${host}` : `https://${host}`;

  const session = await stripe.checkout.sessions.create({
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

  return NextResponse.redirect(session.url!, { status: 303 });
}
