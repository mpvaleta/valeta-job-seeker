// Bulk-import professionals from a CSV file (for seeding the directory).
// Usage: node scripts/import-professionals.mjs professionals.csv
// Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.'); process.exit(1); }
const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/import-professionals.mjs file.csv'); process.exit(1); }
const supabase = createClient(url, key);

function parseCSV(text) {
  const rows = []; let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') inQuotes = false; else field += c; }
    else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f !== '')) rows.push(row); }
  return rows;
}
const slugify = (name, city) => `${name} ${city}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).slice(2, 6);

const [header, ...lines] = parseCSV(readFileSync(file, 'utf8'));
const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
const { data: cats } = await supabase.from('categories').select('id, slug');
const catBySlug = Object.fromEntries((cats ?? []).map((c) => [c.slug, c.id]));

let ok = 0, failed = 0;
for (const line of lines) {
  const get = (name) => (line[col[name]] ?? '').trim();
  const categoryId = catBySlug[get('category_slug')];
  if (!categoryId) { console.error(`SKIP "${get('full_name')}": unknown category_slug "${get('category_slug')}"`); failed++; continue; }
  const { data: pro, error } = await supabase.from('professionals').insert({
    slug: slugify(get('full_name'), get('city')), full_name: get('full_name'), category_id: categoryId,
    headline: get('headline'), bio: get('bio'), country: get('country').toUpperCase(), city: get('city'),
    whatsapp: get('whatsapp'), email: get('email'), website: get('website'), credentials: get('credentials'),
    accepts_insurance: get('accepts_insurance'), online_service: get('online_service') === 'true',
    verified: get('verified') === 'true', status: 'approved'
  }).select('id').single();
  if (error) { console.error(`FAIL "${get('full_name')}": ${error.message}`); failed++; continue; }
  const langs = get('languages').split('|').map((l) => l.trim()).filter(Boolean);
  if (langs.length) await supabase.from('professional_languages').insert(langs.map((code) => ({ professional_id: pro.id, language_code: code })));
  ok++; console.log(`OK  ${get('full_name')} (${get('city')})`);
}
console.log(`\nImported: ${ok} · Failed: ${failed}`);
