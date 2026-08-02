alter table professionals add column if not exists attributes jsonb not null default '{}';
create index if not exists idx_pros_attributes on professionals using gin (attributes);
