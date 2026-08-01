import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimitShared, clientKey } from '@/lib/ratelimit';

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

export async function POST(req: Request) {
  const supabase = createClient();
  if (!(await rateLimitShared(supabase, `upload:${clientKey(req)}`, 10, 3600))) {
    return NextResponse.json({ error: 'Too many uploads' }, { status: 429 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const professionalId = form?.get('professional_id');
  const file = form?.get('file');
  if (typeof professionalId !== 'string' || !(file instanceof File)) {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Use JPG, PNG or WebP' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be under 3 MB' }, { status: 400 });

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const { data: pro } = await supabase.from('professionals').select('owner_id').eq('id', professionalId).single();
  if (!pro || (pro.owner_id !== user.id && me?.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${professionalId}/photo.${ext}`;
  const { error: upErr } = await supabase.storage.from('professional-photos')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) return NextResponse.json({ error: 'Upload failed' }, { status: 500 });

  const { data: pub } = supabase.storage.from('professional-photos').getPublicUrl(path);
  const photoUrl = `${pub.publicUrl}?v=${Date.now()}`;
  await supabase.from('professionals').update({ photo_url: photoUrl }).eq('id', professionalId);
  return NextResponse.json({ ok: true, photo_url: photoUrl });
}
