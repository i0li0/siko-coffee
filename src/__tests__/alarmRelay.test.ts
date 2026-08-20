// アラート中継 Lambda の回帰テスト（Pour Over 10）。
//
// 🔴 この関数の失敗モードは「落ちること」ではなく **「落ちずに黙って捨てること」**。
// アラームは鳴っているのに Slack に来ない状態は、次にアラームが鳴るまで
// （＝次の障害まで）誰にも気づかれない。だから
//   ① webhook 未設定 ② Slack が 4xx を返した ③ そもそも本文が無い
// のいずれでも**必ず例外にする**ことをここで固定する。例外にすれば Lambda の
// Errors メトリクスに出て、AlarmRelayErrors アラームが拾える。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handler } from '@/functions/alarmRelay';

const WEBHOOK = 'https://hooks.slack.com/services/T000/B000/xxxx';

const original = { ...process.env };

/** CloudWatch Alarm が SNS へ流す本文の実物に合わせた最小形。 */
function alarmEvent(overrides: Record<string, unknown> = {}) {
  return {
    Records: [
      {
        Sns: {
          Subject: 'ALARM: "siko-dev-cron-relay-errors"',
          Message: JSON.stringify({
            AlarmName: 'siko-dev-cron-relay-errors',
            AlarmDescription: 'cron の中継 Lambda が失敗した',
            NewStateValue: 'ALARM',
            OldStateValue: 'OK',
            NewStateReason: 'Threshold Crossed: 1 datapoint [2.0] was not less than the threshold (1.0).',
            StateChangeTime: '2026-08-01T12:34:56.789+0000',
            Region: 'Asia Pacific (Tokyo)',
            Trigger: { Namespace: 'AWS/Lambda', MetricName: 'Errors' },
            ...overrides,
          }),
        },
      },
    ],
  };
}

/**
 * SES の設定セットが SNS へ流すイベントの実物に合わせた最小形（R-5）。
 * 🔴 **同じトピックに CloudWatch アラームと SES イベントの2系統が流れる**ので、
 * 判別を間違えると片方が生 JSON のまま Slack に落ちる（読めるが使えない）。
 */
function sesEvent(message: Record<string, unknown>) {
  return {
    Records: [{ Sns: { Subject: null, Message: JSON.stringify(message) } }],
  };
}

function slackBody(fetchMock: ReturnType<typeof vi.spyOn>) {
  const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
  return JSON.parse(init.body as string) as { text: string };
}

beforeEach(() => {
  process.env.SLACK_WEBHOOK_URL = WEBHOOK;
  process.env.STAGE = 'dev';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...original };
  vi.restoreAllMocks();
});

describe('alarmRelay handler', () => {
  it('CloudWatch アラームを Slack へ転送する', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }));

    await handler(alarmEvent());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe(WEBHOOK);

    const { text } = slackBody(fetchMock);
    expect(text).toContain('🔴 ALARM');
    expect(text).toContain('siko-dev-cron-relay-errors');
    // ステージが入らないと soak 期間に dev と production を見分けられない。
    expect(text).toContain('[dev]');
    // 原因（しきい値と実測値）はここにしか出ないので落とさない。
    expect(text).toContain('Threshold Crossed');
    expect(text).toContain('AWS/Lambda/Errors');
  });

  it('SES のバウンスを「どの宛先が・なぜ」まで含めて転送する（R-5）', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }));

    await handler(
      sesEvent({
        eventType: 'Bounce',
        mail: {
          timestamp: '2026-08-10T05:00:00.000Z',
          source: 'Sikō Coffee <noreply@sikocoffee.com>',
          messageId: '0100019-abc',
          destination: ['nobody@example.com'],
        },
        bounce: {
          bounceType: 'Permanent',
          bounceSubType: 'General',
          bouncedRecipients: [
            { emailAddress: 'nobody@example.com', diagnosticCode: 'smtp; 550 5.1.1 user unknown' },
          ],
        },
      }),
    );

    const { text } = slackBody(fetchMock);
    expect(text).toContain('📮 BOUNCE');
    // 🔑 **率のアラームには出ない情報**。これが落ちると R-5 を入れた意味が消える。
    expect(text).toContain('nobody@example.com');
    // Permanent は「二度と送ってはいけない」の判断材料。
    expect(text).toContain('Permanent/General');
    expect(text).toContain('550 5.1.1 user unknown');
    expect(text).toContain('[dev]');
    // 生 JSON にフォールバックしていないこと（＝判別が効いている負の対照）。
    expect(text).not.toContain('"eventType"');
  });

  it('SES の苦情も転送する（R-5）', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }));

    await handler(
      sesEvent({
        eventType: 'Complaint',
        mail: { source: 'noreply@sikocoffee.com', destination: ['angry@example.com'] },
        complaint: {
          complaintFeedbackType: 'abuse',
          complainedRecipients: [{ emailAddress: 'angry@example.com' }],
        },
      }),
    );

    const { text } = slackBody(fetchMock);
    expect(text).toContain('🚩 COMPLAINT');
    expect(text).toContain('angry@example.com');
    expect(text).toContain('abuse');
  });

  it('SES と CloudWatch を取り違えない（同じトピックに両方流れる）', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }));

    // `eventType` を持つが `mail` が無い＝ SES ではない。素通しに落ちること。
    await handler(sesEvent({ eventType: 'SomethingElse', detail: 'x' }));
    expect(slackBody(fetchMock).text).toContain('📣');

    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchMock2 = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }));
    await handler(alarmEvent());
    expect(slackBody(fetchMock2).text).toContain('🔴 ALARM');
  });

  it('復旧（OK）も通知する', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }));

    await handler(alarmEvent({ NewStateValue: 'OK', OldStateValue: 'ALARM' }));

    expect(slackBody(fetchMock).text).toContain('✅ OK');
  });

  it('🔴 Slack が 4xx を返したら例外にする（fetch が解決しただけでは成功と見なさない）', async () => {
    // 無効な webhook URL の典型。TCP は成功し本文で invalid_token が返る。
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('invalid_token', { status: 403 }));

    await expect(handler(alarmEvent())).rejects.toThrow(/403/);
    // 4xx は再試行しても同じなので1回で諦める。
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('Slack の 5xx は再試行し、成功すれば例外にしない', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('server error', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    await expect(handler(alarmEvent())).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('🔴 SLACK_WEBHOOK_URL 未設定なら例外にする（黙って捨てない）', async () => {
    delete process.env.SLACK_WEBHOOK_URL;
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const errorSpy = vi.spyOn(console, 'error');

    await expect(handler(alarmEvent())).rejects.toThrow(/SLACK_WEBHOOK_URL/);
    expect(fetchMock).not.toHaveBeenCalled();
    // 送れなくても中身は CloudWatch には残す。
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('siko-dev-cron-relay-errors'),
    );
  });

  it('🔴 SNS レコードが無いイベントは例外にする（スキーマ違いを成功にしない）', async () => {
    vi.spyOn(globalThis, 'fetch');
    await expect(handler({})).rejects.toThrow(/no SNS records/);
  });

  it('CloudWatch 以外の本文も素通しで届ける', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }));

    await handler({
      Records: [{ Sns: { Subject: 'manual test', Message: 'hello from sns' } }],
    });

    const { text } = slackBody(fetchMock);
    expect(text).toContain('manual test');
    expect(text).toContain('hello from sns');
    expect(text).toContain('[dev]');
  });

  it('複数レコードをすべて転送する', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }));

    const first = alarmEvent().Records[0];
    await handler({ Records: [first, first] });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // ── T5: 鳴ったときの「調べ方」を通知に同梱する（教訓58）─────────────
  //
  // R-4 のアクセスログは17日間一度も引かれず、その間に未知の障害2件が記録された
  // まま放置された。**入れっぱなしの診断は腐る**ので、引く手順を検知側に置く。

  it('cloudfront-5xx の ALARM には Logs Insights のクエリを載せる', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));

    await handler(
      alarmEvent({ AlarmName: 'siko-dev-cloudfront-5xx', NewStateValue: 'ALARM' }),
    );

    const { text } = slackBody(fetchMock);
    expect(text).toContain('siko-dev-cloudfront-access-logs');
    expect(text).toContain('`sc-status` >= 500');
    // 🔴 実際に踏んだ罠（存在しないフィールド名を使って空振りした）を文面に残す。
    expect(text).toContain('cs(User-Agent)');
  });

  it('Lambda 系の ALARM にはロググループの探し方を載せる（名前を組み立てさせない）', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));

    await handler(alarmEvent({ AlarmName: 'siko-dev-web-server-errors' }));

    const { text } = slackBody(fetchMock);
    expect(text).toContain('describe-log-groups --log-group-name-prefix');
    expect(text).toContain('ResourceNotFoundException');
  });

  it('復旧(OK)の通知には調べ方を付けない（定型文で埋めない）', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));

    await handler(
      alarmEvent({
        AlarmName: 'siko-dev-cloudfront-5xx',
        NewStateValue: 'OK',
        OldStateValue: 'ALARM',
      }),
    );

    const { text } = slackBody(fetchMock);
    expect(text).toContain('✅ OK');
    expect(text).not.toContain('Logs Insights');
  });
});
