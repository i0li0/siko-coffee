import { test, expect } from '@playwright/test';

test.describe('API エンドポイント', () => {
  test('GET /api/health → 200', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
  });

  test('GET /api/menu → 200 かつ配列を返す', async ({ request }) => {
    const res = await request.get('/api/menu');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/instagram → 200', async ({ request }) => {
    const res = await request.get('/api/instagram');
    expect(res.status()).toBe(200);
  });

  // 決済停止中（PAYMENTS_ENABLED 未設定）はキルスイッチが手前で 503 を返し、
  // 決済有効時はバリデーションで 400 系になる。どちらの構成でも「不正ボディで
  // 想定外のサーバーエラーにならない」ことを検証する。src/lib/payments.ts 参照。
  test('POST /api/checkout に不正ボディ → 503（決済停止中）または 400 系', async ({ request }) => {
    const res = await request.post('/api/checkout', { data: {} });
    const status = res.status();
    if (status === 503) {
      expect((await res.json()).error).toContain('一時停止');
      return;
    }
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  test('POST /api/webhooks/stripe に署名なし → 400', async ({ request }) => {
    const res = await request.post('/api/webhooks/stripe', {
      data: '{}',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(400);
  });
});
