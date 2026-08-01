create table if not exists audit_log (
  id bigint generated always as identity primary key, actor_id uuid references profiles(id),
  action text not null, entity text not null, entity_id uuid, detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_created on audit_log (created_at desc);
alter table audit_log enable row level security;
create policy "admin read audit" on audit_log for select using (is_admin());

create table if not exists processed_stripe_events (event_id text primary key, processed_at timestamptz not null default now());
alter table processed_stripe_events enable row level security;

create table if not exists rate_limit_hits (bucket text primary key, count int not null default 0, reset_at timestamptz not null);

create or replace function rate_limit_check(p_bucket text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer as $$
declare v_now timestamptz := now(); v_count int; v_reset timestamptz;
begin
  insert into rate_limit_hits (bucket, count, reset_at) values (p_bucket, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (bucket) do update
    set count = case when rate_limit_hits.reset_at < v_now then 1 else rate_limit_hits.count + 1 end,
        reset_at = case when rate_limit_hits.reset_at < v_now then v_now + make_interval(secs => p_window_seconds) else rate_limit_hits.reset_at end
  returning count, reset_at into v_count, v_reset;
  return v_count <= p_limit;
end $$;
