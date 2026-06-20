import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { RekognitionClient, DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition';
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { auth } from '@/lib/auth';
import { getDocClient, TABLE } from '@/lib/db';
import { PRESET_AVATARS } from '@/lib/avatars';

export const dynamic = 'force-dynamic';
export const preferredRegion = ['hnd1'];

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CHANGE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

const rekognition = new RekognitionClient({ region: 'ap-northeast-1' });

async function checkModeration(imageBytes: Uint8Array): Promise<{ safe: boolean; reason?: string }> {
  try {
    const res = await rekognition.send(new DetectModerationLabelsCommand({
      Image: { Bytes: imageBytes },
      MinConfidence: 70,
    }));
    const labels = res.ModerationLabels ?? [];
    if (labels.length > 0) {
      return { safe: false, reason: labels.map(l => l.Name).join(', ') };
    }
    return { safe: true };
  } catch {
    return { safe: false, reason: 'moderation_unavailable' };
  }
}

async function checkRateLimit(userId: string): Promise<boolean> {
  const res = await getDocClient().send(new GetCommand({
    TableName: TABLE.AUTH,
    Key: { pk: userId, sk: userId },
    ProjectionExpression: 'avatarChangedAt',
  }));
  const lastChanged = res.Item?.avatarChangedAt as string | undefined;
  if (!lastChanged) return true;
  return Date.now() - new Date(lastChanged).getTime() >= CHANGE_INTERVAL_MS;
}

// GET: 現在のアバター情報を返す
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const res = await getDocClient().send(new GetCommand({
    TableName: TABLE.AUTH,
    Key: { pk: session.user.id, sk: session.user.id },
    ProjectionExpression: 'avatarPreset, avatarUrl, avatarChangedAt',
  }));

  return NextResponse.json({
    avatarPreset: res.Item?.avatarPreset ?? null,
    avatarUrl: res.Item?.avatarUrl ?? null,
    avatarChangedAt: res.Item?.avatarChangedAt ?? null,
  });
}

// PUT: プリセット選択 or 画像アップロード
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const canChange = await checkRateLimit(userId);
  if (!canChange) {
    return NextResponse.json(
      { error: 'アイコンの変更は1日1回までです' },
      { status: 429 },
    );
  }

  const contentType = req.headers.get('content-type') ?? '';

  // JSON body → preset selection
  if (contentType.includes('application/json')) {
    const body = await req.json() as { presetId?: string };
    const preset = PRESET_AVATARS.find(a => a.id === body.presetId);
    if (!preset) {
      return NextResponse.json({ error: 'Invalid preset' }, { status: 400 });
    }

    // 既存のアップロード画像があれば削除
    const existing = await getDocClient().send(new GetCommand({
      TableName: TABLE.AUTH,
      Key: { pk: userId, sk: userId },
      ProjectionExpression: 'avatarUrl',
    }));
    if (existing.Item?.avatarUrl) {
      try { await del(existing.Item.avatarUrl as string); } catch { /* best-effort */ }
    }

    await getDocClient().send(new UpdateCommand({
      TableName: TABLE.AUTH,
      Key: { pk: userId, sk: userId },
      UpdateExpression: 'SET avatarPreset = :p, avatarChangedAt = :now REMOVE avatarUrl',
      ExpressionAttributeValues: {
        ':p': preset.id,
        ':now': new Date().toISOString(),
      },
    }));

    return NextResponse.json({ avatarPreset: preset.id, avatarUrl: null });
  }

  // FormData → image upload
  const formData = await req.formData();
  const file = formData.get('avatar') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'JPEG・PNG・WebPのみ対応です' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'ファイルサイズは2MB以下にしてください' }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const buffer = Buffer.from(arrayBuffer);

  // Rekognition moderation
  const modResult = await checkModeration(bytes);
  if (!modResult.safe) {
    return NextResponse.json(
      { error: 'この画像はアップロードできません', reason: modResult.reason },
      { status: 422 },
    );
  }

  // 既存画像を削除
  const existing = await getDocClient().send(new GetCommand({
    TableName: TABLE.AUTH,
    Key: { pk: userId, sk: userId },
    ProjectionExpression: 'avatarUrl',
  }));
  if (existing.Item?.avatarUrl) {
    try { await del(existing.Item.avatarUrl as string); } catch { /* best-effort */ }
  }

  // Vercel Blob にアップロード
  const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
  const blob = await put(`avatars/${userId}.${ext}`, buffer, {
    access: 'public',
    contentType: file.type,
    addRandomSuffix: true,
  });

  await getDocClient().send(new UpdateCommand({
    TableName: TABLE.AUTH,
    Key: { pk: userId, sk: userId },
    UpdateExpression: 'SET avatarUrl = :url, avatarChangedAt = :now REMOVE avatarPreset',
    ExpressionAttributeValues: {
      ':url': blob.url,
      ':now': new Date().toISOString(),
    },
  }));

  return NextResponse.json({ avatarPreset: null, avatarUrl: blob.url });
}
