import { redirect } from 'next/navigation';
import Nav from '@/components/layout/Nav';
import Footer from '@/components/layout/Footer';
import { stripe } from '@/lib/stripe';

export const metadata = {
  title: 'ご注文ありがとうございます — Sikō Coffee',
};

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  if (!session_id) {
    redirect('/shop');
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid') {
      redirect('/shop');
    }
  } catch {
    redirect('/shop');
  }

  return (
    <>
      <Nav visible logoHref="/" />

      <main className="relative min-h-screen z-[1] flex items-center justify-center">
        <div className="text-center px-[22px] py-[120px] max-w-[480px] mx-auto">

          <div
            className="font-serif font-light text-[clamp(40px,10vw,80px)]
              text-[rgba(184,190,200,0.18)] tracking-[0.1em] select-none mb-[40px]"
            aria-hidden="true"
          >
            ∞
          </div>

          <h1 className="font-serif font-light text-[clamp(22px,3.5vw,32px)]
            text-[#E8EAEE] tracking-[0.08em] mb-[14px]">
            ご注文ありがとうございます
          </h1>

          <p className="font-serif italic text-[12.5px] text-[rgba(184,190,200,0.5)]
            tracking-[0.1em] leading-[2.2] mb-[52px]">
            ご注文を受け付けました。<br />
            発送の準備が整い次第、ご連絡いたします。
          </p>

          <a
            href="/shop"
            className="inline-block font-sans font-extralight text-[10px]
              tracking-[0.22em] text-[rgba(184,190,200,0.5)]
              border border-[rgba(184,190,200,0.2)] px-[28px] py-[13px]
              transition-all duration-400
              hover:text-[#B8BEC8] hover:border-[rgba(184,190,200,0.45)]"
          >
            SHOP へ戻る
          </a>
        </div>
      </main>

      <Footer />
    </>
  );
}
