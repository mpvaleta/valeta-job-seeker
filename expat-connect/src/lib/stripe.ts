import Stripe from 'stripe';

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export type PlanId = 'featured' | 'premium';

export const RECURRING_PRICE_IDS: Record<PlanId, string | undefined> = {
  featured: process.env.STRIPE_PRICE_FEATURED,
  premium: process.env.STRIPE_PRICE_PREMIUM
};

export const ONETIME_PRICE_IDS: Record<PlanId, string | undefined> = {
  featured: process.env.STRIPE_PRICE_FEATURED_ANNUAL,
  premium: process.env.STRIPE_PRICE_PREMIUM_ANNUAL
};

export const BILLING_CURRENCY = (process.env.BILLING_CURRENCY ?? 'usd').toLowerCase();

export function oneTimePaymentMethods(): Stripe.Checkout.SessionCreateParams.PaymentMethodType[] {
  const base: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] = ['card'];
  if (BILLING_CURRENCY === 'brl') return [...base, 'pix', 'boleto'];
  if (BILLING_CURRENCY === 'eur') return [...base, 'sepa_debit'];
  return base;
}

export function priceIdToPlan(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  if (priceId === RECURRING_PRICE_IDS.featured || priceId === ONETIME_PRICE_IDS.featured) return 'featured';
  if (priceId === RECURRING_PRICE_IDS.premium || priceId === ONETIME_PRICE_IDS.premium) return 'premium';
  return null;
}
