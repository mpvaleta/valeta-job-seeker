import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { professionalSchema } from '@/lib/validation';
import { validateAttributes } from '@/lib/attributes-validation';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const { data } = await supabase.from('professionals')
    .select('*, professional_languages(language_code)').eq('owner_id', user.id).maybeSingle();

  let stats = null;
  if (data) {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: events } = await supabase.from('profile_events').select('event_type')
      .eq('professional_id', data.id).gte('created_at', since);
    const count = (t: string) => (events ?? []).filter((e) => e.event_type === t).length;
    stats = { views: count('view'), whatsapp_clicks: count('whatsapp_click'), website_clicks: count('website_click') };
  }
  return NextResponse.json({ listing: data, stats });
}

export async function PATCH(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const parsed = professionalSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid data' }, { status: 400 });
  const { languages, ...fields } = parsed.data;

  const { data: mine } = await supabase.from('professionals').select('id').eq('owner_id', user.id).maybeSingle();
  if (!mine) return NextResponse.json({ error: 'No listing found' }, { status: 404 });

  const { data: cat } = await supabase.from('categories').select('slug').eq('id', fields.category_id).single();
  const rawAttrs = (await req.clone().json().catch(() => ({})))?.attributes;
  const attrCheck = validateAttributes(cat?.slug ?? '', rawAttrs);
  if (!attrCheck.ok) return NextResponse.json({ error: attrCheck.error }, { status: 400 });

  const { error } = await supabase.from('professionals')
    .update({ ...fields, attributes: attrCheck.value, updated_at: new Date().toISOString() }).eq('id', mine.id);
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });

  await supabase.from('professional_languages').delete().eq('professional_id', mine.id);
  await supabase.from('professional_languages')
    .insert(languages.map((code) => ({ professional_id: mine.id, language_code: code })));

  return NextResponse.json({ ok: true, message: 'Perfil atualizado.' });
}
