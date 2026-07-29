import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { canChangeAvatar, getAvatarRecord } from '@/lib/avatarAccount';
import {
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
  buildUploadKey,
  createUploadUrl,
  extensionFor,
  isAvatarStorageConfigured,
} from '@/lib/avatarStorage';

export const dynamic = 'force-dynamic';
export const preferredRegion = ['hnd1'];

// POST: ブラウザが S3 へ直接 PUT するための署名付き URL を発行する（Pour Over 4 の1段目）。
//
// 🔴 ここで発行するのは **非公開のアップロード用バケット** への URL。検閲は confirm 側で行う。
// この時点ではまだ誰にも見えないので、未検閲のまま放置されても公開はされない
// （ライフサイクルが1日で消す）。
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAvatarStorageConfigured()) {
    return NextResponse.json(
      { error: '画像アップロードは現在利用できません' },
      { status: 503 },
    );
  }

  const userId = session.user.id;
  const record = await getAvatarRecord(userId);
  if (!canChangeAvatar(record)) {
    return NextResponse.json(
      { error: 'アイコンの変更は1日1回までです' },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | { contentType?: string; size?: number }
    | null;
  const contentType = body?.contentType ?? '';
  const size = body?.size ?? 0;

  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json({ error: 'JPEG・PNG・WebPのみ対応です' }, { status: 400 });
  }
  // ⚠️ ここで見ているのは**自己申告のサイズ**。presigned PUT は署名でサイズを
  // 縛れないので、これは早く弾くためだけのもの。実サイズの検査は confirm 側。
  if (size <= 0 || size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'ファイルサイズは2MB以下にしてください' },
      { status: 400 },
    );
  }

  const ext = extensionFor(contentType)!;
  const key = buildUploadKey(userId, ext);
  const uploadUrl = await createUploadUrl(key, contentType);

  return NextResponse.json({ uploadUrl, key });
}
