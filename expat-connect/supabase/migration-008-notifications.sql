create type notification_channel as enum ('email', 'whatsapp', 'sms', 'inapp');
create type notification_status as enum ('pending', 'sent', 'failed', 'canceled');

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(), recipient_id uuid references profiles(id) on delete cascade,
  professional_id uuid references professionals(id) on delete cascade, channel notification_channel not null default 'email',
  template text not null, payload jsonb not null default '{}', to_address text,
  status notification_status not null default 'pending', scheduled_for timestamptz not null default now(),
  sent_at timestamptz, error text, created_at timestamptz not null default now()
);
create index if not exists idx_notif_due on notifications (status, scheduled_for) where status = 'pending';
alter table notifications enable row level security;
create policy "read own notifications" on notifications for select using (recipient_id = auth.uid() or is_admin());
alter table notifications add column if not exists read_at timestamptz;
create policy "mark own read" on notifications for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
