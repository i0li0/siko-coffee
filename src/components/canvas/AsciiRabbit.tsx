'use client';

/**
 * SIKŌ COFFEE 公式マスコット「シコうさ」— ASCII アート版
 * ── public/images/ascii/rabbit-medium.txt と同一のアートを、
 *    ターミナル風ヒーロー演出に合わせてアンバーの縦グラデーション＋
 *    淡いグロー＋ゆるい呼吸アニメで描画する。
 *    （クライアント描画なので fetch のチラつきを避けるため inline 保持）
 */

// rabbit-medium.txt の本体（先頭の余白行は除く）
const RAW = `
                                   ==         :
                                  =%=*      :*%:
                                 =%: =*    *+.-*
                                 *= . *:  =+...%:
                                :%  ..** =+....%:
                                == ...:* %.....%
                                *= ... %*+....+*
                                *: ... %%.....*=
                                *= ...:%%....+%
                           ::=*****===*%%-...%:
                        :*=*:           :==+*=
                       =*:                  =%=
                      *=                      +*:
                     ==                       .-%:
                     %:                        .+*  .::.
                     %:  .-.                   ..%+******=
                    =%   =%*     +%-          ...*#:    :+#
                    ==   :%%     *%=          ...*=   ....#+
                    %:   .%#.    +%=         ...+%- .....:%-
                    *=           .:.        ....+**+-::-=*=
                    =*:                   .....** .-=++=-
                     *%=*==   :        ......-*=
                    ==    %*=+++=..........-**:
                    *=    *+....*-...---***:
                    :*    *+....+***===::
                     ===:***...-%:
                       ::: ====*:
`;

// 前後の空行を落とし、共通インデントを除去して中央に寄せる
const ART = (() => {
  const rows = RAW.replace(/^\n+|\n+$/g, '').split('\n');
  const indent = Math.min(
    ...rows.filter((r) => r.trim()).map((r) => r.match(/^ */)![0].length),
  );
  return rows.map((r) => r.slice(indent)).join('\n');
})();

export default function AsciiRabbit({ className = '' }: { className?: string }) {
  return (
    <pre
      role="img"
      aria-label="SIKŌ COFFEE マスコット シコうさ"
      className={`rabbit-idle font-mono select-none m-0 ${className}`}
      style={{
        fontSize: 'clamp(4.5px, 0.95vw, 7px)',
        lineHeight: 1.0,
        letterSpacing: '0.06em',
        transformOrigin: '50% 90%',
        backgroundImage:
          'linear-gradient(180deg, #F6E0A0 0%, var(--amber) 50%, #C8920F 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        filter:
          'drop-shadow(0 0 1px rgba(212,160,23,0.6)) drop-shadow(0 0 9px rgba(212,160,23,0.45))',
      }}
    >
      {ART}
    </pre>
  );
}
