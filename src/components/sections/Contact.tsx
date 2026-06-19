'use client'

export default function Contact() {
  const email = 'siko.is.coffee@gmail.com'

  return (
    <section id="contact"
      className="relative min-h-screen flex flex-col items-center justify-center z-[2]
        gap-8 py-[90px] min-[700px]:py-[110px]"
      style={{ paddingInline: 'clamp(24px, 6.25vw, 80px)' }}>
      <div className="contact-inner text-center max-w-[460px]" data-reveal>
        <h2 className="font-serif font-light text-[clamp(20px,3.5vw,34px)]
          text-[var(--cream)] tracking-[0.1em] mb-6">
          Contact
        </h2>
        <p className="font-sans font-extralight text-[13px]
          text-[var(--dim)] leading-[2.3] mb-[42px]">
          ご質問、コラボレーション、<br />あるいはただの対話でも。
          <span className="block mt-[6px] font-serif italic text-[12px]
            text-[rgba(212,160,23,0.4)]">
            For inquiries, collaborations,<br />or a quiet conversation.
          </span>
        </p>
        <a
          href={`mailto:${email}`}
          className="font-serif italic text-[18px] text-[var(--amber)]
            no-underline tracking-[0.08em]
            border-b border-[rgba(212,160,23,0.3)] pb-[2px]
            transition-colors duration-300 hover:text-[var(--cream)]
            max-[700px]:text-[14px] max-[700px]:tracking-[0.03em] break-all"
        >
          {email}
        </a>
      </div>
    </section>
  )
}
