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
        gap-[72px] py-[140px] px-[60px]
        max-[700px]:gap-[54px] max-[700px]:py-[90px] max-[700px]:px-[22px]">
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
              className="font-sans font-extralight text-[#c8a96e] leading-none"
              style={{ fontSize: w.size, opacity: w.opacity }}
            >
              {w.kanji}
            </span>
            <span className="font-sans text-[10px] font-extralight text-[#a07840] tracking-[0.14em]">
              {w.kana}
            </span>
            <span className="font-serif italic text-[11.5px] text-[rgba(240,235,224,0.16)] tracking-[0.14em]">
              {w.en}
            </span>
          </div>
        ))}
      </div>

      <div className="story-body max-w-[460px] text-center" data-reveal data-d="2">
        <p className="font-sans font-extralight text-[14px] leading-[2.4]
          text-[rgba(240,235,224,0.45)] mb-[14px]">
          たくさん考えること。とりあえず試すこと。<br />
          とにかく上を目指すこと。<br />
          何より楽しむことを大切に。<br />
          <em className="font-serif italic text-[rgba(200,169,110,0.48)] text-[12.5px]">
            Think, try, pursue, savor —<br />four shades of the same word.
          </em>
        </p>
      </div>
    </section>
  )
}
