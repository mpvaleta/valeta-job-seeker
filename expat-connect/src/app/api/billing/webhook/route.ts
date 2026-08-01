import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { stripe, priceIdToPlan } from '@/lib/stripe';
import type Stripe from 'stripe';

export async function POST(req: Request) {
  if (!stripe) return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get('stripe-signature');
  if (!secret || !sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  const bodyText = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(bodyText, sig, secret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { error: dupErr } = await admin.from('processed_stripe_events').insert({ event_id: event.id });
  if (dupErr) return NextResponse.json({ received: true, duplicate: true });

  async function setPlan(professionalId: string, plan: 'free' | 'featured' | 'premium') {
    await admin.from('professionals').update({ plan }).eq('id', professionalId);
  }
  async function upsertSubscription(sub: Stripe.Subscription, professionalId: string, plan: string) {
    await admin.from('subscriptions').upsert({
      professional_id: professionalId, plan: plan as any,
      stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      stripe_subscription_id: sub.id,
      current_period_end: new Date(((sub as any).current_period_end ?? (sub.items.data[0] as any)?.current_period_end ?? 0) * 1000).toISOString(),
      active: sub.status === 'active' || sub.status === 'trialing'
    }, { onConflict: 'stripe_subscription_id' });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const professionalId = session.metadata?.professional_id;
      const plan = session.metadata?.plan;
      if (!professionalId || !plan) break;
      if (session.mode === 'subscription' && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        await upsertSubscription(sub, professionalId, plan);
        await setPlan(professionalId, plan as any);
      } else if (session.mode === 'payment') {
        const periodEnd = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
        await admin.from('subscriptions').upsert({
          professional_id: professionalId, plan: plan as any,
          stripe_customer_id: typeof session.customer === 'string' ? session.customer : '',
          stripe_subscription_id: `onetime_${session.id}`, current_period_end: periodEnd, active: true
        }, { onConflict: 'stripe_subscription_id' });
        await setPlan(professionalId, plan as any);
      }
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const professionalId = sub.metadata?.professional_id;
      const plan = priceIdToPlan(sub.items.data[0]?.price.id);
      if (professionalId && plan) {
        await upsertSubscription(sub, professionalId, plan);
        const active = sub.status === 'active' || sub.status === 'trialing';
        await setPlan(professionalId, active ? plan : 'free');
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const professionalId = sub.metadata?.professional_id;
      if (professionalId) {
        await admin.from('subscriptions').update({ active: false }).eq('stripe_subscription_id', sub.id);
        await setPlan(professionalId, 'free');
      }
      break;
    }
  }
  return NextResponse.json({ received: true });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
