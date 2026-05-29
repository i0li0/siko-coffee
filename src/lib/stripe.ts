import Stripe from 'stripe';

// Lazily instantiated so the build doesn't fail when STRIPE_SECRET_KEY is absent locally.
let _stripe: Stripe | undefined;

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_, prop: string | symbol) {
    if (!_stripe) {
      _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    }
    const val = (_stripe as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === 'function' ? val.bind(_stripe) : val;
  },
});
