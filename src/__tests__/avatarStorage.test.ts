import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildUploadKey,
  extensionFor,
  isAvatarStorageConfigured,
  isOwnUploadKey,
  keyFromPublicUrl,
  publicKeyFor,
  publicUrlFor,
} from '@/lib/avatarStorage';
import { canChangeAvatar, CHANGE_INTERVAL_MS } from '@/lib/avatarAccount';

// Pour Over 4（Vercel Blob → presigned S3 PUT）の回帰テスト。
//
// 🔴 ここで固定したいのは「**未検閲の画像が公開されない**」を支える判定。
// presigned にしたことでアップロードが検閲より先に起きるので、
// 持ち主の検証とキーの形が最後の砦になっている。

describe('avatarStorage の設定判定', () => {
  const original = {
    up: process.env.AVATAR_UPLOAD_BUCKET,
    pub: process.env.AVATAR_BUCKET,
    base: process.env.AVATAR_BASE_URL,
  };

  beforeEach(() => {
    delete process.env.AVATAR_UPLOAD_BUCKET;
    delete process.env.AVATAR_BUCKET;
    delete process.env.AVATAR_BASE_URL;
  });

  afterEach(() => {
    for (const [key, value] of [
      ['AVATAR_UPLOAD_BUCKET', original.up],
      ['AVATAR_BUCKET', original.pub],
      ['AVATAR_BASE_URL', original.base],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  // 未設定のまま動かすと undefined をバケット名として投げることになる。
  it('バケット名が無ければ未設定（フェイルクローズ）', () => {
    expect(isAvatarStorageConfigured()).toBe(false);
  });

  it('片方だけでは未設定', () => {
    process.env.AVATAR_UPLOAD_BUCKET = 'up';
    expect(isAvatarStorageConfigured()).toBe(false);
  });

  it('両方そろえば設定済み', () => {
    process.env.AVATAR_UPLOAD_BUCKET = 'up';
    process.env.AVATAR_BUCKET = 'pub';
    expect(isAvatarStorageConfigured()).toBe(true);
  });
});

describe('アップロードキー', () => {
  it('MIME から拡張子を導く（ファイル名は使わない）', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('image/png')).toBe('png');
    expect(extensionFor('image/webp')).toBe('webp');
    expect(extensionFor('image/svg+xml')).toBeUndefined();
    expect(extensionFor('application/octet-stream')).toBeUndefined();
  });

  it('pending/<userId>/<uuid>.<ext> の形になる', () => {
    const key = buildUploadKey('user-1', 'png');
    expect(key).toMatch(/^pending\/user-1\/[0-9a-f-]{36}\.png$/);
  });

  it('自分のキーだけを受け付ける', () => {
    const key = buildUploadKey('user-1', 'png');
    expect(isOwnUploadKey(key, 'user-1')).toBe(true);
    expect(isOwnUploadKey(key, 'user-2')).toBe(false);
  });

  // 🔴 他人のキーを confirm に渡して公開させる経路を塞ぐ。
  it('他人のプレフィクスを詐称したキーを弾く', () => {
    const key = buildUploadKey('victim', 'png');
    expect(isOwnUploadKey(key, 'attacker')).toBe(false);
  });

  it('プレフィクスの前方一致だけでは通さない', () => {
    const key = buildUploadKey('user-10', 'png');
    expect(isOwnUploadKey(key, 'user-1')).toBe(false);
  });

  it('パス脱出や想定外の形を弾く', () => {
    expect(isOwnUploadKey('pending/user-1/../../etc/passwd', 'user-1')).toBe(false);
    expect(isOwnUploadKey('avatars/user-1/x.png', 'user-1')).toBe(false);
    expect(isOwnUploadKey('pending/user-1/x.svg', 'user-1')).toBe(false);
    expect(isOwnUploadKey('', 'user-1')).toBe(false);
  });

  it('公開先は同じ UUID を引き継ぐ（pending → avatars）', () => {
    const key = buildUploadKey('user-1', 'webp');
    expect(publicKeyFor(key)).toBe(key.replace('pending/', 'avatars/'));
  });
});

describe('公開 URL とキーの相互変換', () => {
  const original = process.env.AVATAR_BASE_URL;

  beforeEach(() => {
    process.env.AVATAR_BASE_URL = 'https://d123.cloudfront.net';
  });

  afterEach(() => {
    if (original === undefined) delete process.env.AVATAR_BASE_URL;
    else process.env.AVATAR_BASE_URL = original;
  });

  it('公開 URL から S3 キーへ戻せる（旧アバターの削除に使う）', () => {
    const key = publicKeyFor(buildUploadKey('user-1', 'jpg'));
    expect(keyFromPublicUrl(publicUrlFor(key))).toBe(key);
  });

  it('末尾スラッシュの有無で結果が変わらない', () => {
    process.env.AVATAR_BASE_URL = 'https://d123.cloudfront.net/';
    const key = publicKeyFor(buildUploadKey('user-1', 'jpg'));
    expect(publicUrlFor(key)).toBe(`https://d123.cloudfront.net/${key}`);
  });

  // 🔴 保存済み URL を信じて DeleteObject を投げる経路なので、
  // 他ホストや想定外のキーは必ず undefined に落とす。
  it('別ホストの URL は変換しない', () => {
    expect(keyFromPublicUrl('https://evil.example.com/avatars/u/x.jpg')).toBeUndefined();
  });

  it('公開プレフィクス以外のキーは変換しない', () => {
    expect(
      keyFromPublicUrl('https://d123.cloudfront.net/pending/u/x.jpg'),
    ).toBeUndefined();
  });

  it('Vercel Blob 時代の URL は変換しない（移行前の残骸を誤削除しない）', () => {
    expect(
      keyFromPublicUrl('https://xxx.public.blob.vercel-storage.com/avatars/u.png'),
    ).toBeUndefined();
  });
});

describe('変更レート制限', () => {
  it('一度も変更していなければ変更できる', () => {
    expect(canChangeAvatar({ avatarPreset: null, avatarUrl: null, avatarChangedAt: null })).toBe(true);
  });

  it('24時間未満なら変更できない', () => {
    const now = Date.now();
    const record = {
      avatarPreset: null,
      avatarUrl: null,
      avatarChangedAt: new Date(now - CHANGE_INTERVAL_MS + 1000).toISOString(),
    };
    expect(canChangeAvatar(record, now)).toBe(false);
  });

  it('24時間経てば変更できる', () => {
    const now = Date.now();
    const record = {
      avatarPreset: null,
      avatarUrl: null,
      avatarChangedAt: new Date(now - CHANGE_INTERVAL_MS).toISOString(),
    };
    expect(canChangeAvatar(record, now)).toBe(true);
  });
});
