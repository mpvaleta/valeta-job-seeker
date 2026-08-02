import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { enqueue } from '@/lib/notifications';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const actionSchema = z.object({
  entity: z.enum(['professional', 'review', 'claim', 'report']),
  id: z.string().uuid(),
  action: z.enum(['approve', 'reject', 'resolve'])
});

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { entity, id, action } = parsed.data;

  let error = null;
  if (entity === 'professional') {
    ({ error } = await supabase.from('professionals')
      .update({ status: action === 'approve' ? 'approved' : 'rejected' }).eq('id', id));
    if (!error) {
      const { data: pro } = await supabase.from('professionals')
        .select('full_name, slug, email, owner_id').eq('id', id).single();
      const template = action === 'approve' ? 'listing_approved' : 'listing_rejected';
      const payload = { name: pro?.full_name ?? '', url: `${SITE}/pro/${pro?.slug ?? ''}` };
      if (pro?.email) await enqueue(supabase, { channel: 'email', to_address: pro.email, professional_id: id, template, payload });
      if (pro?.owner_id) await enqueue(supabase, { channel: 'inapp', recipient_id: pro.owner_id, professional_id: id, template, payload });
    }
  } else if (entity === 'review') {
    ({ error } = await supabase.from('reviews')
      .update({ status: action === 'approve' ? 'approved' : 'rejected' }).eq('id', id));
  } else if (entity === 'claim') {
    if (action === 'approve') {
      const { data: claim } = await supabase.from('claims').select('professional_id, claimant_id').eq('id', id).single();
      if (claim) {
        await supabase.from('professionals').update({ owner_id: claim.claimant_id }).eq('id', claim.professional_id);
        await supabase.from('profiles').update({ role: 'professional' }).eq('id', claim.claimant_id);
      }
    }
    ({ error } = await supabase.from('claims').update({ status: action === 'approve' ? 'approved' : 'rejected' }).eq('id', id));
  } else {
    ({ error } = await supabase.from('reports').update({ resolved: true }).eq('id', id));
  }
  if (error) return NextResponse.json({ error: 'Action failed' }, { status: 500 });

  await audit(supabase, { actor_id: user.id, action: `${entity}.${action}`, entity, entity_id: id });
  return NextResponse.json({ ok: true });
}
