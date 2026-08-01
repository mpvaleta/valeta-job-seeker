import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const [profile, favorites, reviews, listing, claims] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('favorites').select('professional_id, created_at').eq('user_id', user.id),
    supabase.from('reviews').select('professional_id, rating, body, status, created_at').eq('author_id', user.id),
    supabase.from('professionals').select('*').eq('owner_id', user.id),
    supabase.from('claims').select('professional_id, evidence, status, created_at').eq('claimant_id', user.id)
  ]);
  const payload = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email, created_at: user.created_at },
    profile: profile.data, favorites: favorites.data ?? [], reviews: reviews.data ?? [],
    owned_listings: listing.data ?? [], claims: claims.data ?? []
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="meus-dados.json"' }
  });
}
