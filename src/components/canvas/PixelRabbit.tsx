'use client';

/**
 * SIKŌ COFFEE 公式マスコット「シコうさ」
 * ── カップに手描きされたうさぎをモチーフにしたドット（ピクセル）キャラクター。
 * 16×15 のグリッドを SVG の rect で描画する。アンバー／クリームのパレットに準拠。
 */

// 各文字 = 1ピクセル。'.' は透明。
// B=body(cream)  o=inner-ear(amber)  e=eye  c=cheek(blush)  n=nose
const GRID = [
  '...BB......BB...',
  '...Bo......oB...',
  '...Bo......oB...',
  '...Bo......oB...',
  '...BBB....BBB...',
  '..BBBBBBBBBBBB..',
  '.BBBBBBBBBBBBBB.',
  '.BBBBBBBBBBBBBB.',
  '.BBBBBBBBBBBBBB.',
  '.BBBeBBBBBBeBBB.',
  '.BcBBBBBBBBBBcB.',
  '.BBBBBBnnBBBBBB.',
  '..BBBBBBBBBBBB..',
  '...BBBBBBBBBB...',
  '....BBBBBBBB....',
] as const;

const COLORS: Record<string, string> = {
  B: 'var(--cream)',
  o: 'rgba(212,160,23,0.55)',
  c: 'rgba(212,160,23,0.32)',
  n: 'var(--amber)',
  e: 'var(--bg)',
};

const COLS = GRID[0].length; // 15
const ROWS = GRID.length;     // 15

export default function PixelRabbit({ className = '' }: { className?: string }) {
  const cells: React.ReactNode[] = [];

  GRID.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const isEye = ch === 'e';
      cells.push(
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={1}
          height={1}
          rx={0.18}
          fill={COLORS[ch]}
          className={isEye ? 'rabbit-eye' : undefined}
        />,
      );
    }
  });

  return (
    <svg
      viewBox={`0 0 ${COLS} ${ROWS}`}
      role="img"
      aria-label="SIKŌ COFFEE マスコット"
      shapeRendering="geometricPrecision"
      className={`rabbit-idle ${className}`}
      style={{
        filter: 'drop-shadow(0 0 6px rgba(212,160,23,0.35))',
        overflow: 'visible',
      }}
    >
      {cells}
    </svg>
  );
}
