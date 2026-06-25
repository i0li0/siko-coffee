import DecryptedText from '@/components/reactbits/DecryptedText';

export default function Story() {
  const words = [
    { kanji: '思考', size: 'clamp(50px,8.5vw,82px)', opacity: 1,    kana: 'しこう', en: 'Thinking'  },
    { kanji: '試行', size: 'clamp(36px,5.5vw,56px)', opacity: 0.56, kana: 'しこう', en: 'Trying'    },
    { kanji: '至高', size: 'clamp(42px,7vw,70px)',   opacity: 0.78, kana: 'しこう', en: 'Pursuing'  },
    { kanji: '嗜好', size: 'clamp(34px,5vw,50px)',   opacity: 0.5,  kana: 'しこう', en: 'Savoring'  },
  ]

  return (
    <section id="story"
      className="relative min-h-screen flex flex-col items-center justify-center z-[2]
        gap-[54px] py-[90px]
        min-[700px]:gap-[72px] min-[700px]:py-[140px]"
      style={{ paddingInline: 'clamp(24px, 6.25vw, 80px)' }}>

      <h2 className="sr-only">私たちの思想 — 思考・試行・至高・嗜好</h2>

      {/* Terminal section label */}
      <div
        className="font-mono text-[11px] tracking-[0.16em] select-none"
        style={{ color: 'var(--amber2)' }}
        data-reveal
      >
        <span style={{ color: 'var(--amber)' }}>{'>'}</span>
        {' '}
        <DecryptedText
          text="cat philosophy.md"
          animateOn="view"
          sequential
          revealDirection="start"
          speed={32}
          useOriginalCharsOnly
          parentClassName="inline-block"
        />
      </div>

      <div className="story-words flex gap-[52px] flex-wrap justify-center items-end
        max-[700px]:gap-[26px]">
        {words.map((w, i) => (
          <div
            key={w.kanji}
            className="kanji-word flex flex-col items-center gap-[7px]
              cursor-default transition-transform duration-700 ease-[ease]
              hover:-translate-y-2"
            data-reveal
            data-d={i}
          >
            <span
              className="font-sans font-extralight leading-none"
              style={{ fontSize: w.size, opacity: w.opacity, color: 'var(--cream)' }}
            >
              {w.kanji}
            </span>
            <span
              className="font-sans text-[10px] font-extralight tracking-[0.14em]"
              style={{ color: 'var(--amber2)' }}
            >
              {w.kana}
            </span>
            <span
              className="font-serif italic text-[11.5px] tracking-[0.14em]"
              style={{ color: 'var(--faint)' }}
            >
              {w.en}
            </span>
          </div>
        ))}
      </div>

      <div className="story-body max-w-[460px] text-center" data-reveal data-d="2">
        <p
          className="font-sans font-extralight text-[14px] leading-[2.4] mb-[14px]"
          style={{ color: 'var(--dim)' }}
        >
          たくさん考えること。とりあえず試すこと。<br />
          とにかく上を目指すこと。<br />
          何より楽しむことを大切に。<br />
          <em
            className="font-serif italic text-[12.5px]"
            style={{ color: 'rgba(212,160,23,0.38)' }}
          >
            Think, try, pursue, savor —<br />four shades of the same word.
          </em>
        </p>
      </div>
    </section>
  )
}
