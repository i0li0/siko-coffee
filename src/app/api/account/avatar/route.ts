import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { PRESET_AVATARS } from '@/lib/avatars';
import {
  canChangeAvatar,
  getAvatarRecord,
  setPresetAvatar,
} from '@/lib/avatarAccount';
import { deletePublished } from '@/lib/avatarStorage';

export const dynamic = 'force-dynamic';
export const preferredRegion = ['hnd1'];

// GET: 現在のアバター情報を返す
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const record = await getAvatarRecord(session.user.id);
  return NextResponse.json(record);
}

// PUT: プリセットの選択。
//
// 📌 画像アップロードはここではなく **upload-url → S3 へ直接 PUT → confirm** の3段
// （Pour Over 4）。理由は src/lib/avatarStorage.ts の冒頭を参照。
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const record = await getAvatarRecord(userId);
  if (!canChangeAvatar(record)) {
    return NextResponse.json(
      { error: 'アイコンの変更は1日1回までです' },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as { presetId?: string } | null;
  const preset = PRESET_AVATARS.find((a) => a.id === body?.presetId);
  if (!preset) {
    return NextResponse.json({ error: 'Invalid preset' }, { status: 400 });
  }

  // 既存のアップロード画像があれば消す。best-effort（消えなくてもプリセットは有効）。
  if (record.avatarUrl) {
    await deletePublished(record.avatarUrl);
  }

  await setPresetAvatar(userId, preset.id);

  return NextResponse.json({ avatarPreset: preset.id, avatarUrl: null });
}
