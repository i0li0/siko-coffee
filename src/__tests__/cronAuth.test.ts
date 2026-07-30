// cron ルートの認可（Pour Over 8）。
//
// 🔴 soak 期間は **Vercel（Authorization: Bearer）と AWS（x-cron-secret）の両方**が
// 本番の cron を担う。どちらか一方だけしか通らなくなると、片側の cron が
// 401 で静かに止まる。両形式が通ることをここで固定する。

import { describe, it, expect, afterEach } from 'vitest';
import { isAuthorizedCron } from '@/lib/cronAuth';

const SECRET = 'test-cron-secret';

function req(headers: Record<string, string>): Request {
  return new Request('https://example.com/api/cron/po-timeouts', { headers });
}

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('isAuthorizedCron', () => {
  it('Vercel Cron の Authorization: Bearer を通す', () => {
    process.env.CRON_SECRET = SECRET;
    expect(isAuthorizedCron(req({ authorization: `Bearer ${SECRET}` }))).toBe(true);
  });

  it('AWS の中継 Lambda の x-cron-secret を通す', () => {
    process.env.CRON_SECRET = SECRET;
    expect(isAuthorizedCron(req({ 'x-cron-secret': SECRET }))).toBe(true);
  });

  it('値が違えばどちらの形式でも拒否する', () => {
    process.env.CRON_SECRET = SECRET;
    expect(isAuthorizedCron(req({ 'x-cron-secret': 'wrong' }))).toBe(false);
    expect(isAuthorizedCron(req({ authorization: 'Bearer wrong' }))).toBe(false);
    // x-cron-secret に Bearer 形式を入れても通らない（形式の取り違え検知）。
    expect(isAuthorizedCron(req({ 'x-cron-secret': `Bearer ${SECRET}` }))).toBe(false);
  });

  it('ヘッダが無ければ拒否する', () => {
    process.env.CRON_SECRET = SECRET;
    expect(isAuthorizedCron(req({}))).toBe(false);
  });

  it('CRON_SECRET 未設定ならフェイルクローズで拒否する', () => {
    expect(isAuthorizedCron(req({ 'x-cron-secret': SECRET }))).toBe(false);
    expect(isAuthorizedCron(req({ authorization: `Bearer ${SECRET}` }))).toBe(false);
  });
});
