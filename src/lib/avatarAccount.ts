// アバターに関する DynamoDB 側の読み書き（Pour Over 4）。
//
// S3/Rekognition 側は `src/lib/avatarStorage.ts`。分けているのは、
// アップロードが **presign → PUT → confirm の3段**になり、レート制限と
// 「今の値」の参照が複数のルートから要るようになったため。
//
// 🔴 レート制限は **presign と confirm の両方**で見る。presign だけだと、
// 一度受け取った URL を使い回して confirm を連打できてしまう。
// 実際に `avatarChangedAt` を進めるのは confirm（＝反映が成立した時点）だけ。

import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getDocClient, TABLE } from '@/lib/db';

export const CHANGE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

export type AvatarRecord = {
  avatarPreset: string | null;
  avatarUrl: string | null;
  avatarChangedAt: string | null;
};

export async function getAvatarRecord(userId: string): Promise<AvatarRecord> {
  const res = await getDocClient().send(
    new GetCommand({
      TableName: TABLE.AUTH,
      Key: { pk: userId, sk: userId },
      ProjectionExpression: 'avatarPreset, avatarUrl, avatarChangedAt',
    }),
  );
  return {
    avatarPreset: (res.Item?.avatarPreset as string | undefined) ?? null,
    avatarUrl: (res.Item?.avatarUrl as string | undefined) ?? null,
    avatarChangedAt: (res.Item?.avatarChangedAt as string | undefined) ?? null,
  };
}

export function canChangeAvatar(record: AvatarRecord, now = Date.now()): boolean {
  if (!record.avatarChangedAt) return true;
  return now - new Date(record.avatarChangedAt).getTime() >= CHANGE_INTERVAL_MS;
}

export async function setUploadedAvatar(userId: string, url: string): Promise<void> {
  await getDocClient().send(
    new UpdateCommand({
      TableName: TABLE.AUTH,
      Key: { pk: userId, sk: userId },
      UpdateExpression:
        'SET avatarUrl = :url, avatarChangedAt = :now REMOVE avatarPreset',
      ExpressionAttributeValues: { ':url': url, ':now': new Date().toISOString() },
    }),
  );
}

export async function setPresetAvatar(userId: string, presetId: string): Promise<void> {
  await getDocClient().send(
    new UpdateCommand({
      TableName: TABLE.AUTH,
      Key: { pk: userId, sk: userId },
      UpdateExpression:
        'SET avatarPreset = :p, avatarChangedAt = :now REMOVE avatarUrl',
      ExpressionAttributeValues: { ':p': presetId, ':now': new Date().toISOString() },
    }),
  );
}
