// Transactional email helper. Uses Resend if RESEND_API_KEY is set; otherwise
// logs to the console (safe no-op in dev). Swap the provider in one place.
type Mail = { to: string; subject: string; html: string };

export async function sendEmail({ to, subject, html }: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'Conecta <no-reply@example.com>';
  if (!key) {
    console.log(`[email:dev] to=${to} subject="${subject}"`);
    return;
  }
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html })
    });
  } catch (e) {
    console.error('[email] send failed', e);
  }
}
