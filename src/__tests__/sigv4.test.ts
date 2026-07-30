// SigV4 署名の回帰テスト（Pour Over 8）。
//
// 🔑 **AWS 公式の SigV4 テストスイート `get-vanilla` のベクタで固定してある。**
// 自前実装（`src/functions/sigv4.ts`）を採ったのは依存を増やさないためだが、
// 署名は間違っても「403 が返る」以外の手がかりが出ないので、**期待値を外部の
// 権威ある値に固定**しておく。実装を触ってここが落ちたら、実装のほうが誤り。
//
// 📌 2本目（lambda / 一時資格情報 / カスタムヘッダ）の期待値は、実装時に
//    `@smithy/signature-v4` 5.5.1 で同じ入力を署名させて一致を確認した値。
//    ＝ AWS の公式ベクタが届かない「実運用に近い形」も参照実装で裏を取ってある。

import { describe, it, expect } from 'vitest';
import { signRequest } from '@/functions/sigv4';

describe('signRequest', () => {
  it('AWS 公式ベクタ get-vanilla と一致する', () => {
    const headers = signRequest({
      method: 'GET',
      url: 'https://example.amazonaws.com/',
      region: 'us-east-1',
      service: 'service',
      credentials: {
        accessKeyId: 'AKIDEXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      },
      now: new Date('2015-08-30T12:36:00Z'),
    });

    expect(headers.Authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
        'SignedHeaders=host;x-amz-date, ' +
        'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
    expect(headers['x-amz-date']).toBe('20150830T123600Z');
    expect(headers.host).toBe('example.amazonaws.com');
  });

  it('一時資格情報とカスタムヘッダを署名対象に含める（中継 Lambda の実形）', () => {
    const headers = signRequest({
      method: 'GET',
      url: 'https://abc123.lambda-url.ap-northeast-1.on.aws/api/cron/po-timeouts',
      headers: { 'x-cron-secret': 's3cr3t' },
      region: 'ap-northeast-1',
      service: 'lambda',
      credentials: {
        accessKeyId: 'AKIDTEST',
        secretAccessKey: 'SECRETTEST',
        sessionToken: 'TOKENTEST',
      },
      now: new Date('2026-07-31T04:05:06Z'),
    });

    // 🔴 `x-cron-secret` が SignedHeaders に入っていること。ここから外れると
    // 「経路上で秘密を差し替えても署名が通る」状態になる。
    expect(headers.Authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDTEST/20260731/ap-northeast-1/lambda/aws4_request, ' +
        'SignedHeaders=host;x-amz-date;x-amz-security-token;x-cron-secret, ' +
        'Signature=90a6496aed7f0addaadeb1c453c72afe951c8ff3011fe8d089b1f8138787337e',
    );
    expect(headers['x-amz-security-token']).toBe('TOKENTEST');
  });

  it('一時資格情報が無ければ x-amz-security-token を付けない', () => {
    const headers = signRequest({
      method: 'GET',
      url: 'https://example.amazonaws.com/',
      region: 'us-east-1',
      service: 'lambda',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SECRET' },
      now: new Date('2026-07-31T04:05:06Z'),
    });

    expect(headers['x-amz-security-token']).toBeUndefined();
    expect(headers.Authorization).toContain('SignedHeaders=host;x-amz-date,');
  });

  it('クエリ文字列を名前順に並べ替えて RFC 3986 でエンコードする', () => {
    const base = {
      method: 'GET' as const,
      region: 'us-east-1',
      service: 'lambda',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SECRET' },
      now: new Date('2026-07-31T04:05:06Z'),
    };

    // 順序だけが違う2つの URL は同じ署名にならなければならない。
    const a = signRequest({ ...base, url: 'https://h.example.com/p?b=2&a=1' });
    const b = signRequest({ ...base, url: 'https://h.example.com/p?a=1&b=2' });
    expect(a.Authorization).toBe(b.Authorization);

    // encodeURIComponent が素通しする文字まで潰しているか（潰さないと署名が食い違う）。
    const encoded = signRequest({ ...base, url: "https://h.example.com/p?k=a'b" });
    const plain = signRequest({ ...base, url: 'https://h.example.com/p?k=ab' });
    expect(encoded.Authorization).not.toBe(plain.Authorization);
  });
});
