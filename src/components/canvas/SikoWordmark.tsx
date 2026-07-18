'use client';

import type { CSSProperties } from 'react';

/**
 * ブランド署名マーク「sikō」をインライン SVG として展開する。
 *
 * 重要: このマークの手書きアニメ版（logo-siko-write.svg）は <mask> 内の SMIL で
 * 描画されるため、<img> で貼ると **マスクが閉じたままでロゴが不可視** になる。
 * 必ずインライン（dangerouslySetInnerHTML）で DOM に展開すること（[[logo-animation]] 参照）。
 *
 * 塗り色は SVG 内の `fill="var(--siko-logo-ink, #ffffff)"` を、ここで立てる
 * CSS 変数 `--siko-logo-ink` で上書きする（既定はブランドのクリーム）。
 * 内部 SVG は親 span のサイズに追従する（globals.css の `.siko-wordmark svg`）。
 */
interface SikoWordmarkProps {
  /** SVG マークアップ文字列（RSC でファイルから読み込んで渡す） */
  markup: string;
  className?: string;
  style?: CSSProperties;
  /** --siko-logo-ink に流す色。既定はクリーム。 */
  ink?: string;
}

export default function SikoWordmark({
  markup,
  className = '',
  style,
  ink = 'var(--cream)',
}: SikoWordmarkProps) {
  const varStyle = { '--siko-logo-ink': ink } as CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={`siko-wordmark ${className}`}
      style={{ ...varStyle, ...style }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
