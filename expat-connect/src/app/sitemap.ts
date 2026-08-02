import { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient();
  const [{ data: pros }, { data: cats }] = await Promise.all([
    supabase.from('professionals').select('slug, updated_at, country, city').eq('status', 'approved'),
    supabase.from('categories').select('slug').eq('active', true)
  ]);
  const cityPages = new Map<string, string>();
  for (const p of pros ?? []) {
    const citySlug = p.city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
    cityPages.set(`${BASE}/local/${p.country.toLowerCase()}/${citySlug}`, p.updated_at);
  }
  return [
    { url: BASE, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE}/search`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/for-professionals`, changeFrequency: 'monthly', priority: 0.6 },
    ...(cats ?? []).map((c) => ({ url: `${BASE}/categories/${c.slug}`, changeFrequency: 'weekly' as const, priority: 0.8 })),
    ...Array.from(cityPages.entries()).map(([url, lastModified]) => ({ url, lastModified: new Date(lastModified), changeFrequency: 'weekly' as const, priority: 0.8 })),
    ...(pros ?? []).map((p) => ({ url: `${BASE}/pro/${p.slug}`, lastModified: new Date(p.updated_at), changeFrequency: 'weekly' as const, priority: 0.7 }))
  ];
}
