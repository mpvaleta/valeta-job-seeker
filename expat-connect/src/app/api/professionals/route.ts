import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchParamsSchema } from '@/lib/validation';
import { rateLimit, clientKey } from '@/lib/ratelimit';

const PAGE_SIZE = 20;

export async function GET(req: Request) {
  if (!rateLimit(`search:${clientKey(req)}`, 60)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const url = new URL(req.url);
  const parsed = searchParamsSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  const { q, category, country, city, language, online, page } = parsed.data;
  const supabase = createClient();

  const { data, error } = await supabase.rpc('search_professionals', {
    p_query: q ?? '', p_category: category ?? null, p_country: country ?? null,
    p_city: city ?? null, p_language: language ?? null,
    p_online: online === 'true' ? true : null,
    p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE
  });
  if (!error && data) return NextResponse.json({ results: data, page, pageSize: PAGE_SIZE });

  let query = supabase
    .from('professionals')
    .select('id, slug, full_name, headline, city, country, online_service, verified, avg_rating, review_count, photo_url, plan, categories!inner(slug, name_pt)')
    .eq('status', 'approved');
  if (category) query = query.eq('categories.slug', category);
  if (country) query = query.eq('country', country);
  if (city) query = query.ilike('city', `%${city}%`);
  if (online === 'true') query = query.eq('online_service', true);
  if (q) query = query.or(`full_name.ilike.%${q}%,headline.ilike.%${q}%`);
  query = query.order('plan', { ascending: false }).order('avg_rating', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data: fb } = await query;
  return NextResponse.json({ results: fb ?? [], page, pageSize: PAGE_SIZE });
}
