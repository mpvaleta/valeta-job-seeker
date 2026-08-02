import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe, RECURRING_PRICE_IDS, ONETIME_PRICE_IDS, oneTimePaymentMethods } from '@/lib/stripe';
import { z } from 'zod';
import type Stripe from 'stripe';

const schema = z.object({
  professional_id: z.string().uuid(),
  plan: z.enum(['featured', 'premium']),
  billing: z.enum(['recurring', 'onetime']).default('recurring')
});
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export async function POST(req: Request) {
  if (!stripe) return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { professional_id, plan, billing } = parsed.data;
  const priceId = billing === 'recurring' ? RECURRING_PRICE_IDS[plan] : ONETIME_PRICE_IDS[plan];
  if (!priceId) return NextResponse.json({ error: 'Plan unavailable' }, { status: 400 });

  const { data: pro } = await supabase.from('professionals').select('owner_id').eq('id', professional_id).single();
  if (!pro || pro.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const common = {
    line_items: [{ price: priceId, quantity: 1 }], customer_email: user.email,
    metadata: { professional_id, plan, billing, user_id: user.id },
    success_url: `${SITE}/my-listing?upgraded=1`, cancel_url: `${SITE}/my-listing?canceled=1`
  };
  let session: Stripe.Checkout.Session;
  if (billing === 'recurring') {
    session = await stripe.checkout.sessions.create({
      ...common, mode: 'subscription', subscription_data: { metadata: { professional_id, plan } }
    });
  } else {
    session = await stripe.checkout.sessions.create({
      ...common, mode: 'payment', payment_method_types: oneTimePaymentMethods(),
      payment_intent_data: { metadata: { professional_id, plan, billing } }
    });
  }
  return NextResponse.json({ url: session.url });
}
