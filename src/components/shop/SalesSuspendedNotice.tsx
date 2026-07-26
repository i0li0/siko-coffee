import type { CSSProperties } from 'react';
import { PAYMENTS_DISABLED_HEADING, PAYMENTS_DISABLED_MESSAGE } from '@/lib/payments';

// オンライン販売の停止を購入導線の手前で告知する（docs/aws-migration-feasibility.md Phase 0）。
// API 側のキルスイッチだけだと「購入ボタンを押して初めて 503 で分かる」ため、表示と実態を揃える。
//
// 配色: ブレンドアプリ（.ss-root 配下）と公開サイト側（カタログ・商品詳細）でパレットの
// トークン名が異なるため、`--ss-*` → `--*` → リテラルのフォールバック連鎖で両方に載せる。
export default function SalesSuspendedNotice({ style }: { style?: CSSProperties }) {
  return (
    <div
      style={{
        border: '1px solid var(--ss-faint, var(--faint, rgba(232,224,208,0.14)))',
        borderLeft: '2px solid var(--ss-gold, var(--amber, #c8a96e))',
        borderRadius: 8,
        padding: '14px 18px',
        background: 'var(--ss-card, rgba(232,224,208,0.04))',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        ...style,
      }}
    >
      <span
        style={{
          fontSize: 11.5,
          letterSpacing: '0.12em',
          color: 'var(--ss-gold, var(--amber, #c8a96e))',
        }}
      >
        {PAYMENTS_DISABLED_HEADING}
      </span>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          lineHeight: 1.9,
          color: 'var(--ss-dim, var(--dim, rgba(232,224,208,0.45)))',
        }}
      >
        {PAYMENTS_DISABLED_MESSAGE}
        <br />
        豆えらび・ブレンドづくりはこれまでどおりお試しいただけます。
      </p>
    </div>
  );
}
