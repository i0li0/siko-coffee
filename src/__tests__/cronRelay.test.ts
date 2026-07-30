// cron 中継 Lambda の回帰テスト（Pour Over 8）。
//
// この関数が壊れると **cron 4本が丸ごと止まる**が、止まったことは
// CloudWatch を見に行かないと分からない（Vercel のダッシュボードのような
// 「実行一覧」は無い）。だから「静かに成功したことにする」経路が無いことを
// テストで固定しておく。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handler } from '@/functions/cronRelay';

const ENV = {
  CRON_TARGET_URL: 'https://abc123.lambda-url.ap-northeast-1.on.aws/',
  CRON_SECRET: 's3cr3t',
  AWS_REGION: 'ap-northeast-1',
  AWS_ACCESS_KEY_ID: 'AKIDTEST',
  AWS_SECRET_ACCESS_KEY: 'SECRETTEST',
  AWS_SESSION_TOKEN: 'TOKENTEST',
};

const original = { ...process.env };

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  Object.assign(process.env, ENV);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...original };
  vi.restoreAllMocks();
});

describe('cronRelay handler', () => {
  it('許可パスを SigV4 署名つきで Function URL へ中継する', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { released: 0, reconciled: 3 }));

    const result = await handler({ path: '/api/cron/release-reservations' });

    expect(result).toEqual({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://abc123.lambda-url.ap-northeast-1.on.aws/api/cron/release-reservations',
    );

    const headers = (init as RequestInit).headers as Record<string, string>;
    // ① IAM 認証（SigV4）。lambda サービス・当該リージョンで署名されていること。
    expect(headers.Authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDTEST\/\d{8}\/ap-northeast-1\/lambda\/aws4_request, /,
    );
    // ② CRON_SECRET。**Authorization は SigV4 が占有する**ので別ヘッダで送る。
    expect(headers['x-cron-secret']).toBe('s3cr3t');
    // 秘密が署名対象に入っていること（差し替え検知）。
    expect(headers.Authorization).toContain('x-cron-secret');
  });

  it('未知のパスは fetch せず例外にする（イベントをそのまま URL にしない）', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(handler({ path: '/api/admin/dashboard' })).rejects.toThrow('unknown path');
    await expect(handler({})).rejects.toThrow('unknown path');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('2xx 以外は例外にする（Scheduler に成功と誤認させない）', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(401, { error: 'Unauthorized' }),
    );

    await expect(handler({ path: '/api/cron/po-timeouts' })).rejects.toThrow('returned 401');
  });

  it('環境変数が欠けていたら名指しで落ちる', async () => {
    delete process.env.CRON_SECRET;
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(handler({ path: '/api/cron/cleanup-pending' })).rejects.toThrow(
      'missing environment variables: CRON_SECRET',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ネットワーク例外はそのまま投げ直す（握り潰さない）', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('TimeoutError'));

    await expect(handler({ path: '/api/cron/instagram-refresh' })).rejects.toThrow(
      'TimeoutError',
    );
  });
});
