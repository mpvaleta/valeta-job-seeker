create table profile_events (
  id bigint generated always as identity primary key,
  professional_id uuid not null references professionals(id) on delete cascade,
  event_type text not null check (event_type in ('view', 'whatsapp_click', 'website_click')),
  created_at timestamptz not null default now()
);
create index idx_events_pro on profile_events (professional_id, event_type, created_at);
alter table profile_events enable row level security;
create policy "insert events" on profile_events for insert with check (true);
create policy "read own events" on profile_events for select
  using (is_admin() or exists (select 1 from professionals where id = professional_id and owner_id = auth.uid()));
