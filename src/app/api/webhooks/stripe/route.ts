import { NextRequest, NextResponse } from 'next/server';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import * as Sentry from '@sentry/nextjs';
import { getDocClient, TABLE } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';
export const preferredRegion = ['hnd1'];

const OWNER_EMAIL = 'siko.is.coffee@gmail.com';

interface OrderItem {
  name: string;
  ratios: number[];
  grind?: string;
  custom?: boolean;
  single?: boolean;
  publish?: boolean;
}

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

    const orderId = session.client_reference_id;
    const paymentFields = {
      stripeSessionId: session.id,
      customerEmail: session.customer_details?.email ?? null,
      customerName: session.customer_details?.name ?? null,
      amount: session.amount_total,
      currency: session.currency,
      shippingAddress: shipping?.address ?? null,
      shippingName: shipping?.name ?? null,
      paidAt: new Date(session.created * 1000).toISOString(),
      status: 'paid',
    };

    if (orderId) {
      // ブレンドAPIから事前保存した注文を paid に更新
      try {
        await getDocClient().send(new UpdateCommand({
          TableName: TABLE.ORDERS,
          Key: { id: orderId },
          UpdateExpression: [
            'SET #status = :status',
            'stripeSessionId = :sid',
            'customerEmail = :email',
            'customerName = :name',
            'amount = :amount',
            'currency = :currency',
            'shippingAddress = :addr',
            'shippingName = :sname',
            'paidAt = :paidAt',
          ].join(', '),
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': 'paid',
            ':sid': paymentFields.stripeSessionId,
            ':email': paymentFields.customerEmail,
            ':name': paymentFields.customerName,
            ':amount': paymentFields.amount,
            ':currency': paymentFields.currency,
            ':addr': paymentFields.shippingAddress,
            ':sname': paymentFields.shippingName,
            ':paidAt': paymentFields.paidAt,
          },
        }));
      } catch (err) {
        Sentry.captureException(err, { tags: { route: 'webhook/stripe', step: 'update-order' } });
      }

      // 公開ブレンドを BLENDS テーブルに保存
      try {
        // 事前保存した注文から items を取得
        const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
        const orderRes = await getDocClient().send(new GetCommand({
          TableName: TABLE.ORDERS,
          Key: { id: orderId },
          ProjectionExpression: 'items',
        }));
        const items = (orderRes.Item?.items ?? []) as OrderItem[];
        const publishedItems = items.filter((it) => it.custom && it.publish);

        for (const item of publishedItems) {
          await getDocClient().send(new PutCommand({
            TableName: TABLE.BLENDS,
            Item: {
              id: `${orderId}-${item.name}`,
              name: item.name,
              ratios: item.ratios,
              by: session.customer_details?.name ?? 'Anonymous',
              publish: true,
              createdAt: new Date().toISOString(),
              bought: 1,
            },
          }));
        }
      } catch (err) {
        // 公開ブレンド保存失敗は非クリティカル
        Sentry.captureException(err, { tags: { route: 'webhook/stripe', step: 'publish-blends' } });
      }
    } else {
      // client_reference_id がない場合（旧 /api/checkout 経由）は従来通り新規保存
      try {
        await getDocClient().send(new PutCommand({
          TableName: TABLE.ORDERS,
          Item: {
            id: session.id,
            createdAt: new Date(session.created * 1000).toISOString(),
            ...paymentFields,
          },
        }));
      } catch (err) {
        Sentry.captureException(err, { tags: { route: 'webhook/stripe', step: 'put-order' } });
      }
    }

    // メール通知（ブレンド内容を含む）
    try {
      const ses = new SESClient({ region: 'ap-northeast-1' });
      const addr = shipping?.address;
      const addrText = addr
        ? `${addr.postal_code ?? ''} ${addr.state ?? ''} ${addr.city ?? ''} ${addr.line1 ?? ''} ${addr.line2 ?? ''}`.trim()
        : '未入力';

      // 事前保存した items からブレンド内容を生成
      let itemsText = '';
      if (orderId) {
        try {
          const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
          const orderRes = await getDocClient().send(new GetCommand({
            TableName: TABLE.ORDERS,
            Key: { id: orderId },
            ProjectionExpression: 'items',
          }));
          const items = (orderRes.Item?.items ?? []) as OrderItem[];
          itemsText = items.map((it, i) =>
            `  ${i + 1}. ${it.name} [${it.ratios.join('/')}] ${it.grind ?? '豆のまま'} 200g${it.publish ? ' ★公開' : ''}`
          ).join('\n');
        } catch { /* メール内容省略 */ }
      }

      await ses.send(new SendEmailCommand({
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
                '',
                itemsText ? `注文内容:\n${itemsText}` : '（内容取得不可）',
                '',
                `注文ID: ${orderId ?? session.id}`,
                `Stripe ID: ${session.id}`,
                `日時: ${new Date(session.created * 1000).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`,
                '',
                'Stripe ダッシュボード: https://dashboard.stripe.com/payments',
              ].join('\n'),
            },
          },
        },
      }));
    } catch (emailErr) {
      Sentry.captureException(emailErr, { tags: { route: 'webhook/stripe', step: 'ses' } });
    }
  }

  return NextResponse.json({ received: true });
}
