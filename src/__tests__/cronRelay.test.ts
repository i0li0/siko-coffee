// cron 中継 Lambda の回帰テスト（Pour Over 8）。
//
// この関数が壊れると **cron 4本が丸ごと止まる**が、止まったことは
// CloudWatch を見に行かないと分からない（Vercel のダッシュボードのような
// 「実行一覧」は無い）。だから「静かに成功したことにする」経路が無いことを
// テストで固定しておく。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// CloudFront の SDK は**呼び出しの中身だけ**見たいのでモックする。
// 実クライアントを通すと資格情報の解決で環境に依存し、テストが機械ごとに揺れる。
const sendMock = vi.fn();
vi.mock('@aws-sdk/client-cloudfront', () => ({
  // 🔴 `vi.fn(() => ({...}))` は `new` で使えない（"is not a constructor"）。
  //    SDK は `new` するので、モックもコンストラクタとして成立する形にする。
  CloudFrontClient: class {
    send = sendMock;
  },
  CreateInvalidationCommand: class {
    constructor(public input: unknown) {}
  },
}));

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
  sendMock.mockReset();
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('空のイベントは「何もせず成功」にせず例外にする', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    // 🔴 path も invalidatePaths も無いイベントは**スケジュール定義のミス**。
    //    黙って成功させると「毎回起動しているのに何もしていない」が静かに続く。
    await expect(handler({})).rejects.toThrow('neither path nor invalidatePaths');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
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

  // ── C-6: CloudFront の無効化 ───────────────────────────────────
  //
  // これが止まると**エッジの HTML が最大30日腐り、`/_next/image` が 500 を返す**。
  // 症状はアラーム経由でしか見えないので、経路の性質をここで固定しておく。

  it('invalidatePaths を渡すと CloudFront の無効化を作る（fetch はしない）', async () => {
    process.env.CLOUDFRONT_DISTRIBUTION_ID = 'E3FC7N27IY6A73';
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    sendMock.mockResolvedValue({ Invalidation: { Id: 'I2ABC', Status: 'InProgress' } });

    const result = await handler({ invalidatePaths: ['/'] });

    expect(result).toEqual({ invalidationId: 'I2ABC' });
    // path が無いので中継はしない＝ server Lambda を起こさない。
    expect(fetchMock).not.toHaveBeenCalled();

    const { input } = sendMock.mock.calls[0][0];
    expect(input.DistributionId).toBe('E3FC7N27IY6A73');
    expect(input.InvalidationBatch.Paths).toEqual({ Quantity: 1, Items: ['/'] });
    expect(input.InvalidationBatch.CallerReference).toMatch(/^cron-invalidate-\d+$/);
  });

  it('許可していないパスの無効化は拒否する（`/*` で無料枠を焼かない）', async () => {
    process.env.CLOUDFRONT_DISTRIBUTION_ID = 'E3FC7N27IY6A73';

    await expect(handler({ invalidatePaths: ['/*'] })).rejects.toThrow(
      'unknown invalidation path',
    );
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('DISTRIBUTION_ID が無ければ名指しで落ちる', async () => {
    delete process.env.CLOUDFRONT_DISTRIBUTION_ID;

    await expect(handler({ invalidatePaths: ['/'] })).rejects.toThrow(
      'CLOUDFRONT_DISTRIBUTION_ID',
    );
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('無効化 ID が返らなければ成功にしない', async () => {
    process.env.CLOUDFRONT_DISTRIBUTION_ID = 'E3FC7N27IY6A73';
    // 🔴 「200 が返った」と「意図した状態になった」は別の命題。
    sendMock.mockResolvedValue({});

    await expect(handler({ invalidatePaths: ['/'] })).rejects.toThrow(
      'no invalidation id',
    );
  });
});
