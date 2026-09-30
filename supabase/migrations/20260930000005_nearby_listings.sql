-- Phase 10: server-side "nearest first" browsing with paging (Explore previously stopped at 48 listings).
create or replace function public.nearby_listings(q_lat double precision, q_lng double precision, q_occasion text default null, lim int default 24, off int default 0)
returns table (
  id uuid, created_at timestamptz, owner_name text, image_url text, title text, category text, gender text,
  occasions text[], style_tags text[], colors text[], formality smallint, size text, price_per_day int, area text,
  description text, distance_km double precision, total bigint
)
language sql stable
set search_path = public, extensions
as $$
  select l.id, l.created_at, l.owner_name, l.image_url, l.title, l.category, l.gender,
         l.occasions, l.style_tags, l.colors, l.formality, l.size, l.price_per_day, l.area,
         l.description, st_distance(l.location, st_makepoint(q_lng, q_lat)::geography) / 1000,
         count(*) over ()
  from listings l
  where q_occasion is null or l.occasions @> array[q_occasion]
  order by l.location <-> st_makepoint(q_lng, q_lat)::geography, l.created_at desc
  limit lim offset off;
$$;
revoke execute on function public.nearby_listings from public, anon, authenticated;
grant execute on function public.nearby_listings to service_role;
