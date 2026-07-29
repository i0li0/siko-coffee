import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getStage, isProductionStage, isVercelPlatform } from '@/lib/stage';

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

// Pour Over 3（Vercel 専用スクリプトの条件化）の回帰テスト。
//
// 誤りは**どちらに転んでも静か**なので固定しておく:
//  - 真になりすぎる（AWS で真）→ 404 が増えるだけで見た目は壊れない
//  - 偽になりすぎる（Vercel で偽）→ 計測が黙って止まり、soak 中の比較材料を失う
// 後者を避けるため `VERCEL` と `VERCEL_ENV` の**どちらか一方でも**あれば真とする。
describe('isVercelPlatform', () => {
  const original = { VERCEL: process.env.VERCEL, VERCEL_ENV: process.env.VERCEL_ENV };

  beforeEach(() => {
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    if (original.VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = original.VERCEL;
    if (original.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = original.VERCEL_ENV;
  });

  it('未設定（AWS / ローカル）では Vercel ではない', () => {
    expect(isVercelPlatform()).toBe(false);
  });

  it('Vercel 上（VERCEL=1）では Vercel', () => {
    process.env.VERCEL = '1';
    expect(isVercelPlatform()).toBe(true);
  });

  // システム環境変数の注入がトグル依存でも、Vercel 側で計測を落とさないための保険。
  it('VERCEL が無くても VERCEL_ENV があれば Vercel', () => {
    process.env.VERCEL_ENV = 'production';
    expect(isVercelPlatform()).toBe(true);
  });

  it('Vercel preview でも Vercel（ステージ判定ではない）', () => {
    process.env.VERCEL_ENV = 'preview';
    expect(isVercelPlatform()).toBe(true);
  });

  // AWS 側は STAGE しか持たないので、ステージ名で判定してはいけない。
  it('STAGE だけがある（AWS）と Vercel ではない', () => {
    process.env.STAGE = 'production';
    expect(isVercelPlatform()).toBe(false);
    delete process.env.STAGE;
  });
});
