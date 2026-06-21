'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function ShopError({
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
      <h2 style={{ fontSize: 22, fontWeight: 400 }}>読み込みに失敗しました</h2>
      <p style={{ fontSize: 14, color: 'var(--ss-dim, #999)' }}>
        ショップの表示中にエラーが発生しました。
      </p>
      <button
        onClick={reset}
        style={{ padding: '10px 24px', borderRadius: 6, border: '1px solid rgba(200,169,110,0.5)', background: 'transparent', color: 'var(--ss-gold, #c8a96e)', cursor: 'pointer', fontSize: 14 }}
      >
        もう一度試す
      </button>
    </div>
  );
}
