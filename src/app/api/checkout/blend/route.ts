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
import { etaFromDays, resolvePlatformItem } from '@/lib/platformCheckout';
import { holdReservations, releaseReservationsForOrder, type Allocation } from '@/lib/reservations';
import { createPoRecords } from '@/lib/pos';
import type { LabelSnapshotEntry, ProcurementEntry } from '@/types/platform';

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
  const lineItems: {
    price_data: { currency: 'jpy'; product_data: { name: string; description: string }; unit_amount: number };
    quantity: number;
  }[] = [];

  // プラットフォーム構成（beanId 指定）ぶんの集計。従来の3種ブレンドは今までどおり動く。
  const allocations: Allocation[] = [];
  const procurement: ProcurementEntry[] = [];
  const labelSnapshot: LabelSnapshotEntry[] = [];
  let etaDays = 0;
  const platformBlendIds: string[] = [];

  for (const item of items) {
    const grind = typeof item.grind === 'string' ? item.grind : '豆のまま';
    const grams = item.grams ?? 200;
    const isPlatform = !!item.components?.length || !!item.blendId;

    let unitAmount: number;
    if (isPlatform) {
      // 価格・可否・生産国はサーバ側で beans/roasters を見て決める（§11.4・§13.3）
      const resolved = await resolvePlatformItem(
        { blendId: item.blendId, components: item.components, grams },
        userSession?.user?.id ?? null,
      );
      if (!resolved.ok) {
        await releaseReservationsForOrder(orderId); // 直前までの確保を戻す
        return NextResponse.json({ error: resolved.error }, { status: resolved.status });
      }
      unitAmount = resolved.item.amountYen;
      allocations.push(...resolved.item.allocations);
      procurement.push(...resolved.item.procurement);
      labelSnapshot.push(...resolved.item.labelSnapshot);
      etaDays = Math.max(etaDays, resolved.item.etaDays);
      if (item.blendId) platformBlendIds.push(item.blendId);
    } else {
      unitAmount = Math.round((grams / 100) * PRICE_PER_100G);
    }

    subtotal += unitAmount;
    const productName = item.single
      ? `シングルオリジン ${item.name}`
      : item.custom
        ? `${item.name}（オリジナルブレンド）`
        : item.name;

    lineItems.push({
      price_data: {
        currency: 'jpy' as const,
        product_data: {
          name: productName,
          description: `${grind} / ${grams}g`,
        },
        unit_amount: unitAmount,
      },
      quantity: 1,
    });
  }

  // 在庫確保（held）。注文全体で1トランザクション＝部分確保を作らない（§13.4）。
  // 確保できなかったぶんは resolvePlatformItem が発注（mode="po"）としてマーク済み。
  if (allocations.length > 0) {
    try {
      await holdReservations(orderId, allocations);
    } catch (err) {
      if ((err as { name?: string }).name === 'TransactionCanceledException') {
        return NextResponse.json(
          { error: '在庫が変動しました。もう一度お試しください' },
          { status: 409 },
        );
      }
      Sentry.captureException(err, { tags: { route: 'checkout/blend', step: 'reserve' } });
      return NextResponse.json({ error: 'Failed to reserve stock' }, { status: 500 });
    }
  }

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
        // --- プラットフォーム（§11.2⑥）---
        ...(procurement.length > 0 ? { procurement } : {}),
        ...(labelSnapshot.length > 0 ? { labelSnapshot } : {}),
        ...(etaDays > 0 ? { etaPromised: etaFromDays(etaDays), etaCurrent: etaFromDays(etaDays) } : {}),
        ...(platformBlendIds[0] ? { blendId: platformBlendIds[0] } : {}),
        ...(items.find((it) => it.blendVersion)?.blendVersion
          ? { blendVersion: items.find((it) => it.blendVersion)!.blendVersion }
          : {}),
      },
    }));
  } catch (err) {
    await releaseReservationsForOrder(orderId); // 注文が残らないので確保も戻す
    Sentry.captureException(err, { tags: { route: 'checkout/blend', step: 'pre-save' } });
    return NextResponse.json({ error: 'Failed to save order' }, { status: 500 });
  }

  // 発注（PO）を焙煎者向けの逆引きレコードとして作る（§11.2⑨）。
  // 失敗しても注文自体は成立させる（真実は orders.procurement[] 側にあり、後から補填できる）。
  const poSeeds = procurement
    .filter((p) => p.mode === 'po')
    .map((p) => ({
      roasterId: p.roasterId,
      beanId: p.beanId,
      beanName: labelSnapshot.find((l) => l.beanId === p.beanId)?.name ?? p.beanId,
      qtyG: p.qtyG,
      poStatus: p.poStatus ?? 'pending',
      timeoutAt: p.timeoutAt,
      leadTimeDays: p.leadTimeDays,
    }));
  if (poSeeds.length > 0) {
    try {
      await createPoRecords(orderId, poSeeds);
    } catch (err) {
      Sentry.captureException(err, { tags: { route: 'checkout/blend', step: 'create-pos' } });
    }
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
    await releaseReservationsForOrder(orderId); // 決済に進めないので在庫を戻す
    Sentry.captureException(err, { tags: { route: 'checkout/blend' } });
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }

  if (!session.url) {
    await releaseReservationsForOrder(orderId);
    return NextResponse.json({ error: 'No checkout URL returned' }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
