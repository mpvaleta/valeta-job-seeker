import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { professionalSchema } from '@/lib/validation';
import { validateAttributes } from '@/lib/attributes-validation';
import { z } from 'zod';

function slugify(name: string, city: string): string {
  const base = `${name} ${city}`.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}
async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, ok: false };
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return { supabase, ok: me?.role === 'admin' };
}
const adminListingSchema = professionalSchema.extend({
  id: z.string().uuid().optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'suspended']).default('approved'),
  verified: z.boolean().default(false)
});

export async function POST(req: Request) {
  const { supabase, ok } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const parsed = adminListingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid data' }, { status: 400 });
  const { id, languages, ...fields } = parsed.data;

  const { data: cat } = await supabase.from('categories').select('slug').eq('id', fields.category_id).single();
  const rawAttrs = (await req.clone().json().catch(() => ({})))?.attributes;
  const attrCheck = validateAttributes(cat?.slug ?? '', rawAttrs);
  if (!attrCheck.ok) return NextResponse.json({ error: attrCheck.error }, { status: 400 });
  const attributes = attrCheck.value;

  let proId = id;
  if (id) {
    const { error } = await supabase.from('professionals')
      .update({ ...fields, attributes, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  } else {
    const { data: pro, error } = await supabase.from('professionals')
      .insert({ ...fields, attributes, slug: slugify(fields.full_name, fields.city) }).select('id').single();
    if (error || !pro) return NextResponse.json({ error: 'Create failed' }, { status: 500 });
    proId = pro.id;
  }
  await supabase.from('professional_languages').delete().eq('professional_id', proId!);
  await supabase.from('professional_languages')
    .insert(languages.map((code) => ({ professional_id: proId, language_code: code })));
  return NextResponse.json({ ok: true, id: proId });
}

export async function GET(req: Request) {
  const { supabase, ok } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const { data } = await supabase.from('professionals')
    .select('*, professional_languages(language_code)').eq('id', id).single();
  return NextResponse.json({ listing: data });
}
