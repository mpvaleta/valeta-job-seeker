create extension if not exists unaccent;

create or replace function immutable_unaccent(text)
returns text language sql immutable parallel safe as $$ select unaccent('unaccent', $1) $$;

alter table professionals add column if not exists search_vec tsvector generated always as (
  setweight(to_tsvector('simple', immutable_unaccent(coalesce(full_name, ''))), 'A') ||
  setweight(to_tsvector('simple', immutable_unaccent(coalesce(headline, ''))), 'B') ||
  setweight(to_tsvector('simple', immutable_unaccent(coalesce(bio, '') || ' ' || coalesce(city, ''))), 'C')
) stored;
create index if not exists idx_pros_search_vec on professionals using gin (search_vec);

create or replace function search_professionals(
  p_query text default '', p_category text default null, p_country text default null, p_city text default null,
  p_language text default null, p_online boolean default null, p_limit int default 20, p_offset int default 0
)
returns setof professionals
language sql stable security invoker as $$
  select p.* from professionals p left join categories c on c.id = p.category_id
  where p.status = 'approved'
    and (p_category is null or c.slug = p_category)
    and (p_country is null or p.country = upper(p_country))
    and (p_city is null or p.city ilike '%' || p_city || '%')
    and (p_online is null or p.online_service = p_online)
    and (p_query = '' or p_query is null or p.search_vec @@ plainto_tsquery('simple', immutable_unaccent(p_query)))
    and (p_language is null or exists (select 1 from professional_languages pl where pl.professional_id = p.id and pl.language_code = p_language))
  order by p.plan desc,
    case when p_query = '' or p_query is null then 0 else ts_rank(p.search_vec, plainto_tsquery('simple', immutable_unaccent(p_query))) end desc,
    p.avg_rating desc, p.review_count desc
  limit greatest(1, least(p_limit, 50)) offset greatest(0, p_offset);
$$;
