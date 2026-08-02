-- ============================================================
-- Conecta — Expat Professional Directory
-- PostgreSQL schema for Supabase, with Row Level Security (RLS)
-- ============================================================
create type user_role as enum ('user', 'professional', 'admin');
create type listing_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type review_status as enum ('pending', 'approved', 'rejected');
create type plan_tier as enum ('free', 'featured', 'premium');
create type claim_status as enum ('pending', 'approved', 'rejected');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role user_role not null default 'user',
  preferred_language text not null default 'pt-BR',
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create table categories (
  id serial primary key, slug text unique not null, name_pt text not null, name_en text not null,
  icon text not null default 'briefcase', sort_order int not null default 100, active boolean not null default true
);

create table languages (code text primary key, name_pt text not null, name_en text not null);

create table professionals (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null, full_name text not null, category_id int not null references categories(id),
  headline text not null default '', bio text not null default '',
  origin_country text not null default 'BR', country text not null, city text not null,
  address text default '', phone text default '', whatsapp text default '', email text default '', website text default '',
  credentials text default '', accepts_insurance text default '', online_service boolean not null default false,
  photo_url text default '', status listing_status not null default 'pending', plan plan_tier not null default 'free',
  owner_id uuid references profiles(id), verified boolean not null default false,
  avg_rating numeric(2,1) not null default 0, review_count int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index idx_pros_search on professionals (status, category_id, country, city);
create index idx_pros_plan on professionals (plan) where status = 'approved';

create table professional_languages (
  professional_id uuid references professionals(id) on delete cascade,
  language_code text references languages(code),
  primary key (professional_id, language_code)
);

create table reviews (
  id uuid primary key default gen_random_uuid(), professional_id uuid not null references professionals(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade, rating int not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 2000), status review_status not null default 'pending',
  created_at timestamptz not null default now(), unique (professional_id, author_id)
);

create or replace function refresh_pro_rating()
returns trigger language plpgsql security definer as $$
declare pid uuid;
begin
  pid := coalesce(new.professional_id, old.professional_id);
  update professionals p set
    avg_rating = coalesce((select round(avg(rating)::numeric, 1) from reviews where professional_id = pid and status = 'approved'), 0),
    review_count = (select count(*) from reviews where professional_id = pid and status = 'approved')
  where p.id = pid;
  return null;
end $$;
create trigger on_review_change after insert or update or delete on reviews for each row execute function refresh_pro_rating();

create table favorites (
  user_id uuid references profiles(id) on delete cascade, professional_id uuid references professionals(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (user_id, professional_id)
);

create table claims (
  id uuid primary key default gen_random_uuid(), professional_id uuid not null references professionals(id) on delete cascade,
  claimant_id uuid not null references profiles(id) on delete cascade, evidence text not null default '',
  status claim_status not null default 'pending', created_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(), professional_id uuid references professionals(id) on delete cascade,
  review_id uuid references reviews(id) on delete cascade, reporter_id uuid references profiles(id),
  reason text not null, resolved boolean not null default false, created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(), professional_id uuid not null references professionals(id) on delete cascade,
  plan plan_tier not null, stripe_customer_id text default '', stripe_subscription_id text default '',
  current_period_end timestamptz, active boolean not null default false, created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table categories enable row level security;
alter table languages enable row level security;
alter table professionals enable row level security;
alter table professional_languages enable row level security;
alter table reviews enable row level security;
alter table favorites enable row level security;
alter table claims enable row level security;
alter table reports enable row level security;
alter table subscriptions enable row level security;

create or replace function is_admin()
returns boolean language sql stable security definer as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create policy "own profile read" on profiles for select using (auth.uid() = id or is_admin());
create policy "own profile update" on profiles for update using (auth.uid() = id);

create policy "public read categories" on categories for select using (true);
create policy "admin write categories" on categories for all using (is_admin());
create policy "public read languages" on languages for select using (true);
create policy "admin write languages" on languages for all using (is_admin());

create policy "public read approved pros" on professionals for select
  using (status = 'approved' or owner_id = auth.uid() or is_admin());
create policy "owner update own listing" on professionals for update using (owner_id = auth.uid() or is_admin());
create policy "admin insert pros" on professionals for insert with check (is_admin());
create policy "admin delete pros" on professionals for delete using (is_admin());

create policy "public read pro languages" on professional_languages for select using (true);
create policy "manage pro languages" on professional_languages for all
  using (is_admin() or exists (select 1 from professionals where id = professional_id and owner_id = auth.uid()));

create policy "read approved reviews" on reviews for select using (status = 'approved' or author_id = auth.uid() or is_admin());
create policy "create own review" on reviews for insert with check (auth.uid() = author_id);
create policy "moderate reviews" on reviews for update using (is_admin());
create policy "delete own review" on reviews for delete using (author_id = auth.uid() or is_admin());

create policy "own favorites" on favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own claims" on claims for select using (claimant_id = auth.uid() or is_admin());
create policy "create claim" on claims for insert with check (claimant_id = auth.uid());
create policy "admin resolve claims" on claims for update using (is_admin());

create policy "create report" on reports for insert with check (auth.uid() is not null);
create policy "admin read reports" on reports for select using (is_admin());
create policy "admin resolve reports" on reports for update using (is_admin());

create policy "own subscription" on subscriptions for select
  using (is_admin() or exists (select 1 from professionals where id = professional_id and owner_id = auth.uid()));
create policy "admin manage subscriptions" on subscriptions for all using (is_admin());
