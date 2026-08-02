import { MetadataRoute } from 'next';
const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.com';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/dashboard', '/my-listing', '/account', '/api/'] }],
    sitemap: `${BASE}/sitemap.xml`
  };
}
