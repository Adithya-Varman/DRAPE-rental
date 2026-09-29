-- Phase 8: "Complete the look" — pieces that pair with an anchor listing.
-- Candidates must be in a complementary category (chosen by the API from CATEGORY_SLOT), gender-compatible, and share
-- at least one occasion. Ranked by style similarity (embedding cosine) with a light nearness bonus: 30 km costs 0.1.
create or replace function public.complete_the_look(anchor uuid, pair_categories text[], k int default 8)
returns table (
  id uuid, title text, image_url text, category text,
  occasions text[], style_tags text[], size text,
  price_per_day int, area text, description text,
  distance_km double precision, similarity double precision
)
language sql stable
set search_path = public, extensions
as $$
  select
    l.id, l.title, l.image_url, l.category,
    l.occasions, l.style_tags, l.size,
    l.price_per_day, l.area, l.description,
    st_distance(l.location, a.location) / 1000,
    1 - (l.embedding <=> a.embedding)
  from listings a
  join listings l on l.id <> a.id
  where a.id = anchor
    and l.category = any(pair_categories)
    and (a.gender = 'unisex' or l.gender in (a.gender, 'unisex'))
    and l.occasions && a.occasions
  order by (l.embedding <=> a.embedding) + least(st_distance(l.location, a.location) / 1000, 30) / 300
  limit k;
$$;

revoke execute on function public.complete_the_look from public, anon, authenticated;
grant execute on function public.complete_the_look to service_role;
