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

  test('POST /api/checkout に不正ボディ → 400 系', async ({ request }) => {
    const res = await request.post('/api/checkout', { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('POST /api/webhooks/stripe に署名なし → 400', async ({ request }) => {
    const res = await request.post('/api/webhooks/stripe', {
      data: '{}',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(400);
  });
});
