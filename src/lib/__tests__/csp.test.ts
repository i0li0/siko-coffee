import { describe, it, expect } from 'vitest';
import { buildConnectSrc } from '../csp';

// 2026-08-08 に本番で踏んだ不具合の回帰テスト。
// アイコンのアップロード先 S3 が connect-src に無く、ブラウザが presigned PUT を
// 送信前にブロックしていた（UI には「アップロードに失敗しました」としか出ない）。
describe('buildConnectSrc', () => {
  const BUCKET = 'siko-coffee-production-avataruploadsbucket-baruzmbz';

  it('AVATAR_UPLOAD_BUCKET があれば、そのバケットのオリジンを1つだけ許可する', () => {
    const v = buildConnectSrc({ AVATAR_UPLOAD_BUCKET: BUCKET });
    expect(v).toContain(`https://${BUCKET}.s3.ap-northeast-1.amazonaws.com`);
  });

  // 🔴 これがこの回帰テストの本体。
  // ワイルドカードにすると**任意の S3 バケットへ送信できる**＝持ち出し経路になる。
  it('S3 をワイルドカードで許可しない', () => {
    const v = buildConnectSrc({ AVATAR_UPLOAD_BUCKET: BUCKET });
    expect(v).not.toContain('*.s3.');
    expect(v).not.toContain('*.amazonaws.com');
  });

  // 負の対照。未設定なら足さない（ローカル/Vercel は 503 でアップロード導線が無い）。
  it('AVATAR_UPLOAD_BUCKET が無ければ S3 のオリジンを足さない', () => {
    const v = buildConnectSrc({});
    expect(v).not.toContain('amazonaws.com');
  });

  it('既存の許可先を落とさない（Sentry / GA）', () => {
    const v = buildConnectSrc({ AVATAR_UPLOAD_BUCKET: BUCKET });
    expect(v).toContain("'self'");
    expect(v).toContain('https://o4511541920858112.ingest.us.sentry.io');
    expect(v).toContain('https://www.google-analytics.com');
    expect(v).toContain('https://region1.google-analytics.com');
  });

  it('connect-src ディレクティブとして組み立てられている', () => {
    expect(buildConnectSrc({}).startsWith('connect-src ')).toBe(true);
  });
});
