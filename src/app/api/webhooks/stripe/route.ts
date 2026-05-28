import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';
export const preferredRegion = ['hnd1'];

const OWNER_EMAIL = 'siko.is.coffee@gmail.com';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return NextResponse.json({ error: `Webhook signature invalid: ${(err as Error).message}` }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shipping = (session as any).shipping_details as { name?: string; address?: { postal_code?: string; state?: string; city?: string; line1?: string; line2?: string } } | null;

    const docClient = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: 'ap-northeast-1' }),
    );

    await docClient.send(
      new PutCommand({
        TableName: 'siko-coffee-orders',
        Item: {
          id: session.id,
          customerEmail: session.customer_details?.email ?? null,
          customerName: session.customer_details?.name ?? null,
          amount: session.amount_total,
          currency: session.currency,
          shippingAddress: shipping?.address ?? null,
          shippingName: shipping?.name ?? null,
          createdAt: new Date(session.created * 1000).toISOString(),
          status: 'paid',
        },
      }),
    );

    // オーナーへのメール通知（ベストエフォート）
    try {
      const ses = new SESClient({ region: 'ap-northeast-1' });
      const addr = shipping?.address;
      const addrText = addr
        ? `${addr.postal_code ?? ''} ${addr.state ?? ''} ${addr.city ?? ''} ${addr.line1 ?? ''} ${addr.line2 ?? ''}`.trim()
        : '未入力';

      await ses.send(
        new SendEmailCommand({
          Source: OWNER_EMAIL,
          Destination: { ToAddresses: [OWNER_EMAIL] },
          Message: {
            Subject: { Data: '[Sikō Coffee] 新しいご注文が届きました', Charset: 'UTF-8' },
            Body: {
              Text: {
                Charset: 'UTF-8',
                Data: [
                  `金額: ¥${(session.amount_total ?? 0).toLocaleString()}`,
                  `お客様: ${session.customer_details?.name ?? '不明'} <${session.customer_details?.email ?? '不明'}>`,
                  `配送先: ${addrText}`,
                  `Stripe ID: ${session.id}`,
                  `日時: ${new Date(session.created * 1000).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`,
                  '',
                  'Stripe ダッシュボード: https://dashboard.stripe.com/payments',
                ].join('\n'),
              },
            },
          },
        }),
      );
    } catch (emailErr) {
      // メール失敗でも注文は保存済み
      console.error('SES email failed:', (emailErr as Error).message);
    }
  }

  return NextResponse.json({ received: true });
}
