'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 40 }}>
      <h2 style={{ fontSize: 22, fontWeight: 400 }}>エラーが発生しました</h2>
      <p style={{ fontSize: 14, color: '#999' }}>
        管理画面の読み込み中に問題が発生しました。
      </p>
      <button
        onClick={reset}
        style={{ padding: '10px 24px', borderRadius: 6, border: '1px solid #555', background: 'transparent', color: '#ccc', cursor: 'pointer', fontSize: 14 }}
      >
        もう一度試す
      </button>
    </div>
  );
}
