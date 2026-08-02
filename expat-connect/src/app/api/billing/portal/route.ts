import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export async function POST() {
  if (!stripe) return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const { data: sub } = await supabase.from('subscriptions')
    .select('stripe_customer_id, professionals!inner(owner_id)')
    .eq('professionals.owner_id', user.id).not('stripe_customer_id', 'eq', '').limit(1).maybeSingle();
  if (!sub?.stripe_customer_id) return NextResponse.json({ error: 'No active subscription' }, { status: 404 });

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id, return_url: `${SITE}/my-listing`
  });
  return NextResponse.json({ url: session.url });
}
