import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getStage, getClientStage, isProductionStage, isVercelPlatform } from '@/lib/stage';

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

// Pour Over C-1（クライアント側 Sentry の environment）の回帰テスト。
//
// 🔑 **この関数の失敗は静かで、しかも一番気づきにくい形をとる**。
// クライアントで `getStage()` を呼んでも例外は出ず `undefined` が返るだけなので、
// 「ステージ不明」が事故ではなく既定値のように見える。実際 Pour Over 1 の後、
// server と edge だけが environment を持ち、クライアントは無言で未タグのままだった。
//
// ⚠️ ここで固定できるのは**読み出し側の意味論だけ**。値がバンドルに焼き込まれること
// （`next.config.ts` の `env`）は vitest では確かめられず、**実ビルドの成果物**を見る必要がある。
// 「テストが緑」は「クライアントにステージが届いている」の証明ではない（教訓27 と同型）。
describe('getClientStage', () => {
  const original = process.env.NEXT_PUBLIC_STAGE;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_STAGE;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_STAGE;
    else process.env.NEXT_PUBLIC_STAGE = original;
  });

  it('未設定なら undefined（呼び出し側が development へ落とす）', () => {
    expect(getClientStage()).toBeUndefined();
  });

  // `next.config.ts` の `env` は string しか受け付けないため、未設定は `''` で焼き込まれる。
  // これを素通ししてしまうと Sentry の environment が**空文字**になり、
  // 「未設定」ではなく「名前の無いステージ」として集計されてしまう。
  it('空文字は未設定として扱う（environment が空タグにならないように）', () => {
    process.env.NEXT_PUBLIC_STAGE = '';
    expect(getClientStage()).toBeUndefined();
  });

  it('ビルド時に焼き込まれた値をそのまま返す', () => {
    process.env.NEXT_PUBLIC_STAGE = 'production';
    expect(getClientStage()).toBe('production');
  });

  // サーバ専用の変数を拾わないこと。拾えてしまうならそれは
  // 「クライアントでも読めた」のではなく **テスト環境が node だから**で、
  // ブラウザでは再現しない偽の緑になる。
  it('STAGE / VERCEL_ENV にはフォールバックしない（ブラウザでは読めないため）', () => {
    process.env.STAGE = 'production';
    process.env.VERCEL_ENV = 'production';
    expect(getClientStage()).toBeUndefined();
    delete process.env.STAGE;
    delete process.env.VERCEL_ENV;
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
