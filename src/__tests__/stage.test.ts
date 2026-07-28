import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getStage, isProductionStage } from '@/lib/stage';

// Pour Over 1（VERCEL_ENV → STAGE）の回帰テスト。
//
// ここが壊れると影響が両方向に出る:
//  - フェイルオープンに戻ると、環境変数の無い環境が**本番テーブルを向く**
//  - Vercel のフォールバックを消すと、soak 期間中の **Vercel 本番が preview テーブルを向く**
// どちらも本番データに直接触れるため、単体テストで固定する。

describe('stage', () => {
  const original = { STAGE: process.env.STAGE, VERCEL_ENV: process.env.VERCEL_ENV };

  beforeEach(() => {
    delete process.env.STAGE;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    if (original.STAGE === undefined) delete process.env.STAGE;
    else process.env.STAGE = original.STAGE;
    if (original.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = original.VERCEL_ENV;
  });

  it('どちらも未設定なら本番ではない（フェイルクローズ）', () => {
    expect(getStage()).toBeUndefined();
    expect(isProductionStage()).toBe(false);
  });

  it('AWS 本番ステージ（STAGE=production）は本番', () => {
    process.env.STAGE = 'production';
    expect(isProductionStage()).toBe(true);
  });

  it('AWS の非本番ステージ（STAGE=dev）は本番ではない', () => {
    process.env.STAGE = 'dev';
    expect(isProductionStage()).toBe(false);
  });

  // soak 期間（Pour Over 14）は Vercel も本番を担い続ける。
  // このフォールバックを消すと Vercel 本番が preview テーブルを向いて壊れる。
  it('Vercel 本番（VERCEL_ENV=production・STAGE なし）は本番', () => {
    process.env.VERCEL_ENV = 'production';
    expect(isProductionStage()).toBe(true);
  });

  it('Vercel preview は本番ではない', () => {
    process.env.VERCEL_ENV = 'preview';
    expect(isProductionStage()).toBe(false);
  });

  it('STAGE が VERCEL_ENV より優先される', () => {
    process.env.STAGE = 'dev';
    process.env.VERCEL_ENV = 'production';
    expect(getStage()).toBe('dev');
    expect(isProductionStage()).toBe(false);
  });
});
