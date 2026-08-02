import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { professionalSchema } from '@/lib/validation';
import { validateAttributes } from '@/lib/attributes-validation';
import { rateLimitShared, clientKey } from '@/lib/ratelimit';

function slugify(name: string, city: string): string {
  const base = `${name} ${city}`.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function POST(req: Request) {
  const supabase = createClient();
  if (!(await rateLimitShared(supabase, `registerpro:${clientKey(req)}`, 3, 3600))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const parsed = professionalSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid data' }, { status: 400 });
  }
  const { languages, ...fields } = parsed.data;

  const { data: cat } = await supabase.from('categories').select('slug').eq('id', fields.category_id).single();
  const rawAttrs = (await req.clone().json().catch(() => ({})))?.attributes;
  const attrCheck = validateAttributes(cat?.slug ?? '', rawAttrs);
  if (!attrCheck.ok) return NextResponse.json({ error: attrCheck.error }, { status: 400 });

  const { data: pro, error } = await supabase.from('professionals').insert({
    ...fields, slug: slugify(fields.full_name, fields.city), owner_id: user.id,
    status: 'pending', attributes: attrCheck.value
  }).select('id').single();

  if (error || !pro) return NextResponse.json({ error: 'Could not create listing' }, { status: 500 });

  await supabase.from('professional_languages')
    .insert(languages.map((code) => ({ professional_id: pro.id, language_code: code })));

  return NextResponse.json({ ok: true, message: 'Listing submitted. It will appear publicly after our team approves it.' });
}
