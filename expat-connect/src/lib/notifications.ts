import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

export type NotificationTemplate =
  | 'listing_approved' | 'listing_rejected' | 'review_received'
  | 'claim_approved' | 'profile_incomplete' | 'reengage_no_photo';

type EnqueueArgs = {
  recipient_id?: string; professional_id?: string;
  channel?: 'email' | 'whatsapp' | 'sms' | 'inapp';
  template: NotificationTemplate; payload?: Record<string, unknown>;
  to_address?: string; scheduled_for?: Date;
};

export async function enqueue(supabase: SupabaseClient, args: EnqueueArgs): Promise<void> {
  try {
    await supabase.from('notifications').insert({
      recipient_id: args.recipient_id ?? null,
      professional_id: args.professional_id ?? null,
      channel: args.channel ?? 'email',
      template: args.template,
      payload: args.payload ?? {},
      to_address: args.to_address ?? null,
      scheduled_for: (args.scheduled_for ?? new Date()).toISOString()
    });
  } catch { /* queueing must never break the caller */ }
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

function render(template: NotificationTemplate, payload: Record<string, unknown>) {
  const name = (payload.name as string) ?? '';
  const url = (payload.url as string) ?? SITE;
  switch (template) {
    case 'listing_approved':
      return { subject: 'Seu perfil foi aprovado 🎉', text: `Olá ${name}! Seu perfil já está no ar: ${url}` };
    case 'listing_rejected':
      return { subject: 'Sobre o seu cadastro', text: `Olá ${name}, precisamos de ajustes no seu perfil antes de publicá-lo.` };
    case 'review_received':
      return { subject: 'Você recebeu uma nova avaliação', text: `Olá ${name}! Uma nova avaliação chegou: ${url}` };
    case 'claim_approved':
      return { subject: 'Perfil liberado para você gerenciar', text: `Olá ${name}! Gerencie em ${SITE}/my-listing` };
    case 'profile_incomplete':
      return { subject: 'Complete seu perfil', text: `Olá ${name}! Perfis completos recebem mais contatos: ${SITE}/my-listing` };
    case 'reengage_no_photo':
      return { subject: 'Adicione uma foto ao seu perfil', text: `Olá ${name}! Adicione sua foto: ${SITE}/my-listing` };
  }
}

async function sendWhatsApp(to: string, text: string): Promise<boolean> {
  const url = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;
  if (!url || !token) { console.log(`[whatsapp:dev] to=${to} ${text.slice(0, 40)}…`); return false; }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, type: 'text', text: { body: text } })
    });
    return res.ok;
  } catch { return false; }
}

export async function dispatchDue(supabase: SupabaseClient, limit = 50): Promise<{ sent: number; failed: number }> {
  const { data: due } = await supabase.from('notifications').select('*')
    .eq('status', 'pending').lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for').limit(limit);

  let sent = 0, failed = 0;
  for (const n of due ?? []) {
    const msg = render(n.template, n.payload ?? {});
    let ok = false;
    if (n.channel === 'inapp') ok = true;
    else if (n.channel === 'whatsapp' && n.to_address) ok = await sendWhatsApp(n.to_address, msg.text);
    else if (n.channel === 'email' && n.to_address) { await sendEmail({ to: n.to_address, subject: msg.subject, html: `<p>${msg.text}</p>` }); ok = true; }

    await supabase.from('notifications').update({
      status: ok ? 'sent' : 'failed',
      sent_at: ok ? new Date().toISOString() : null,
      error: ok ? null : 'channel unavailable or missing address'
    }).eq('id', n.id);
    ok ? sent++ : failed++;
  }
  return { sent, failed };
}
