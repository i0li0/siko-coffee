// オンデマンド再検証の認可。
//
// 🔴 CloudFront（本番）は OAC の SigV4 署名で `Authorization` を上書きするため、
// **`x-revalidate-secret` が通らなくなると本番の再検証が丸ごと死ぬ**。
// 逆に soak 期間は Vercel 経路が `Authorization` を使うので、そちらも落とせない。
// 両形式が通ることをここで固定する（`cronAuth.test.ts` と同じ趣旨）。

import { describe, it, expect, afterEach } from 'vitest';
import { isAuthorizedRevalidate } from '@/lib/revalidateAuth';

const SECRET = 'test-revalidate-secret';

function req(headers: Record<string, string>): Request {
  return new Request('https://example.com/api/revalidate', { method: 'POST', headers });
}

afterEach(() => {
  delete process.env.REVALIDATE_SECRET;
});

describe('isAuthorizedRevalidate', () => {
  it('CloudFront 経由でも届く x-revalidate-secret を通す', () => {
    process.env.REVALIDATE_SECRET = SECRET;
    expect(isAuthorizedRevalidate(req({ 'x-revalidate-secret': SECRET }))).toBe(true);
  });

  it('Vercel 経路の Authorization: Bearer を通す（soak 期間のため）', () => {
    process.env.REVALIDATE_SECRET = SECRET;
    expect(isAuthorizedRevalidate(req({ authorization: `Bearer ${SECRET}` }))).toBe(true);
  });

  it('値が違えばどちらの形式でも拒否する', () => {
    process.env.REVALIDATE_SECRET = SECRET;
    expect(isAuthorizedRevalidate(req({ 'x-revalidate-secret': 'wrong' }))).toBe(false);
    expect(isAuthorizedRevalidate(req({ authorization: 'Bearer wrong' }))).toBe(false);
    // x-revalidate-secret に Bearer 形式を入れても通らない（形式の取り違え検知）。
    expect(isAuthorizedRevalidate(req({ 'x-revalidate-secret': `Bearer ${SECRET}` }))).toBe(false);
  });

  it('CRON_SECRET 用のヘッダでは通らない（秘密の使い回し検知）', () => {
    process.env.REVALIDATE_SECRET = SECRET;
    expect(isAuthorizedRevalidate(req({ 'x-cron-secret': SECRET }))).toBe(false);
  });

  it('ヘッダが無ければ拒否する', () => {
    process.env.REVALIDATE_SECRET = SECRET;
    expect(isAuthorizedRevalidate(req({}))).toBe(false);
  });

  it('REVALIDATE_SECRET 未設定ならフェイルクローズで拒否する', () => {
    expect(isAuthorizedRevalidate(req({ 'x-revalidate-secret': SECRET }))).toBe(false);
    expect(isAuthorizedRevalidate(req({ authorization: `Bearer ${SECRET}` }))).toBe(false);
  });
});
