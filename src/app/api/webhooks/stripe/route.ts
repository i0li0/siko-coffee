import { NextRequest, NextResponse } from 'next/server';
import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import * as Sentry from '@sentry/nextjs';
import { getDocClient, TABLE } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { sendEmail, OWNER_EMAIL } from '@/lib/email';
import { orderConfirmation, ownerNewOrder, type MailItem } from '@/lib/emailTemplates';
import { signOrderToken } from '@/lib/orderToken';
import { BEANS } from '@/components/shop/blend/data';
import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';
export const preferredRegion = ['hnd1'];

const SITE_URL = process.env.SITE_URL || 'https://www.sikocoffee.com';

interface OrderItem {
  name: string;
  ratios: number[];
  grind?: string;
  grams?: number;
  custom?: boolean;
  single?: boolean;
  publish?: boolean;
}

function addressText(addr: Stripe.Address | null | undefined): string {
  if (!addr) return '';
  return `${addr.postal_code ?? ''} ${addr.state ?? ''} ${addr.city ?? ''} ${addr.line1 ?? ''} ${addr.line2 ?? ''}`.trim();
}

// 注文照会リンクを生成する。
async function buildOrderUrl(orderId: string): Promise<string | undefined> {
  try {
    const token = await signOrderToken(orderId);
    return `${SITE_URL}/shop/order/${orderId}?t=${token}`;
  } catch {
    return undefined; // ORDER_TOKEN_SECRET 未設定でもメール本体は送る
  }
}

// 冪等性の「占有」更新。指定属性が未設定のときだけ true をセットし、成功すれば true を返す。
// webhook 再送時の二重処理（メール多重送信・在庫二重減算）を防ぐ。
async function claim(orderId: string, attr: string): Promise<boolean> {
  try {
    await getDocClient().send(new UpdateCommand({
      TableName: TABLE.ORDERS,
      Key: { id: orderId },
      ConditionExpression: `attribute_exists(id) AND attribute_not_exists(#a)`,
      UpdateExpression: 'SET #a = :v',
      ExpressionAttributeNames: { '#a': attr },
      ExpressionAttributeValues: { ':v': new Date().toISOString() },
    }));
    return true;
  } catch {
    return false; // ConditionalCheckFailed = 既に処理済み
  }
}

// 注文内容から在庫を減算する（best-effort）。豆名でマッチし、不一致や不足は記録のみ。
async function applyInventory(orderId: string, items: OrderItem[]): Promise<void> {
  // 豆ごとの必要グラム数を集計（BEANS の並びが ratios のインデックスに対応）。
  const needByName = new Map<string, number>();
  for (const it of items) {
    if (!Array.isArray(it.ratios) || it.ratios.length !== BEANS.length) continue;
    const grams = it.grams ?? 200;
    it.ratios.forEach((pct, idx) => {
      const bean = BEANS[idx];
      if (!bean) return;
      const g = (grams * pct) / 100;
      if (g > 0) needByName.set(bean.name, (needByName.get(bean.name) ?? 0) + g);
    });
  }
  if (needByName.size === 0) return;

  try {
    const inv = await getDocClient().send(new ScanCommand({ TableName: TABLE.INVENTORY }));
    const byName = new Map<string, string>(); // name -> beanId
    for (const row of (inv.Items ?? []) as { beanId: string; name: string }[]) {
      if (row.name) byName.set(row.name, row.beanId);
    }

    for (const [name, grams] of needByName) {
      const beanId = byName.get(name);
      if (!beanId) {
        Sentry.captureMessage(`在庫マッチなし: ${name}`, { level: 'warning', tags: { route: 'webhook/stripe', step: 'inventory', orderId } });
        continue;
      }
      try {
        await getDocClient().send(new UpdateCommand({
          TableName: TABLE.INVENTORY,
          Key: { beanId },
          UpdateExpression: 'SET currentStock = currentStock - :g, updatedAt = :now',
          ExpressionAttributeValues: { ':g': Math.round(grams), ':now': new Date().toISOString() },
        }));
      } catch (err) {
        Sentry.captureException(err, { tags: { route: 'webhook/stripe', step: 'inventory-update', orderId } });
      }
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'webhook/stripe', step: 'inventory-scan', orderId } });
  }
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
    // shipping_details は Stripe API バージョンにより session 直下 / collected_information 配下のどちらか。
    const loose = session as unknown as {
      shipping_details?: { name?: string; address?: Stripe.Address };
      collected_information?: { shipping_details?: { name?: string; address?: Stripe.Address } };
    };
    const shipping = loose.collected_information?.shipping_details ?? loose.shipping_details ?? null;

    const orderId = session.client_reference_id;
    const addrText = addressText(shipping?.address);
    const customerEmail = session.customer_details?.email ?? null;
    const customerName = session.customer_details?.name ?? shipping?.name ?? null;

    const paymentValues = {
      ':status': 'paid',
      ':sid': session.id,
      ':email': customerEmail,
      ':name': customerName,
      ':amount': session.amount_total,
      ':currency': session.currency,
      ':addr': shipping?.address ?? null,
      ':sname': shipping?.name ?? null,
      ':paidAt': new Date(session.created * 1000).toISOString(),
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
          ExpressionAttributeValues: paymentValues,
        }));
      } catch (err) {
        Sentry.captureException(err, { tags: { route: 'webhook/stripe', step: 'update-order' } });
      }
    } else {
      // client_reference_id がない場合（旧 /api/checkout 経由）は従来通り新規保存
      try {
        await getDocClient().send(new PutCommand({
          TableName: TABLE.ORDERS,
          Item: {
            id: session.id,
            createdAt: new Date(session.created * 1000).toISOString(),
            status: 'paid',
            stripeSessionId: session.id,
            customerEmail,
            customerName,
            amount: session.amount_total,
            currency: session.currency,
            shippingAddress: shipping?.address ?? null,
            shippingName: shipping?.name ?? null,
            paidAt: paymentValues[':paidAt'],
          },
        }));
      } catch (err) {
        Sentry.captureException(err, { tags: { route: 'webhook/stripe', step: 'put-order' } });
      }
    }

    const effectiveOrderId = orderId ?? session.id;

    // 事前保存した注文から items を取得（旧経路は空）
    let items: OrderItem[] = [];
    if (orderId) {
      try {
        const orderRes = await getDocClient().send(new GetCommand({
          TableName: TABLE.ORDERS,
          Key: { id: orderId },
          ProjectionExpression: 'items',
        }));
        items = (orderRes.Item?.items ?? []) as OrderItem[];
      } catch (err) {
        Sentry.captureException(err, { tags: { route: 'webhook/stripe', step: 'get-items' } });
      }
    }

    // 公開ブレンドを BLENDS テーブルに保存
    try {
      const publishedItems = items.filter((it) => it.custom && it.publish);
      for (const item of publishedItems) {
        await getDocClient().send(new PutCommand({
          TableName: TABLE.BLENDS,
          Item: {
            id: `${effectiveOrderId}-${item.name}`,
            name: item.name,
            ratios: item.ratios,
            by: customerName ?? 'Anonymous',
            publish: true,
            createdAt: new Date().toISOString(),
            bought: 1,
          },
        }));
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { route: 'webhook/stripe', step: 'publish-blends' } });
    }

    // 在庫減算（冪等・best-effort）
    if (items.length > 0 && await claim(effectiveOrderId, 'inventoryAppliedAt')) {
      await applyInventory(effectiveOrderId, items);
    }

    const mailItems: MailItem[] = items;
    const orderUrl = await buildOrderUrl(effectiveOrderId);

    // 注文確認メール（顧客宛・冪等）
    if (customerEmail && await claim(effectiveOrderId, 'confirmationSentAt')) {
      const mail = orderConfirmation({
        orderId: effectiveOrderId,
        customerName,
        items: mailItems,
        subtotal: session.amount_subtotal,
        shipping: session.total_details?.amount_shipping ?? 0,
        total: session.amount_total,
        addressText: addrText,
        orderUrl,
      });
      await sendEmail({ to: customerEmail, subject: mail.subject, text: mail.text, html: mail.html, replyTo: OWNER_EMAIL });
    }

    // 新規注文の通知メール（店主宛）
    const ownerMail = ownerNewOrder({
      orderId: effectiveOrderId,
      stripeSessionId: session.id,
      customerName,
      customerEmail,
      items: mailItems,
      total: session.amount_total,
      addressText: addrText,
      createdAt: new Date(session.created * 1000),
    });
    await sendEmail({ to: OWNER_EMAIL, subject: ownerMail.subject, text: ownerMail.text });
  }

  // 決済未完了で期限切れ → 事前保存した pending 注文を掃除
  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.client_reference_id;
    if (orderId) {
      try {
        await getDocClient().send(new DeleteCommand({
          TableName: TABLE.ORDERS,
          Key: { id: orderId },
          ConditionExpression: '#status = :pending',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':pending': 'pending' },
        }));
      } catch (err) {
        // 既に paid 済み等で条件不一致なら何もしない（非クリティカル）
        if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') {
          Sentry.captureException(err, { tags: { route: 'webhook/stripe', step: 'expire-cleanup' } });
        }
      }
    }
  }

  // 返金完了 → 注文を refunded に更新（管理画面 / Stripe ダッシュボード両方からの返金に対応）
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntent =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;

    if (paymentIntent) {
      try {
        const sessions = await stripe.checkout.sessions.list({
          payment_intent: paymentIntent,
          limit: 1,
        });
        const session = sessions.data[0];
        const orderId = session?.client_reference_id ?? session?.id;

        if (orderId) {
          await getDocClient().send(new UpdateCommand({
            TableName: TABLE.ORDERS,
            Key: { id: orderId },
            ConditionExpression: 'attribute_exists(id)',
            UpdateExpression: 'SET #status = :status, refundedAt = :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':status': 'refunded',
              ':now': new Date().toISOString(),
            },
          }));
        }
      } catch (err) {
        Sentry.captureException(err, { tags: { route: 'webhook/stripe', step: 'charge-refunded' } });
      }
    }
  }

  return NextResponse.json({ received: true });
}
