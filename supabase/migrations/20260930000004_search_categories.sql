-- Add category intent to semantic search so pants can be filtered as jeans and trousers.
create or replace function public.match_listings(
  q_emb        extensions.vector(768),
  q_size       text             default null,
  q_max_price  int              default null,
  q_gender     text             default null,
  q_categories text[]           default null,
  q_lat        double precision default null,
  q_lng        double precision default null,
  q_radius_km  double precision default 10,
  k            int              default 12
)
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
    case when q_lat is null then null
         else st_distance(l.location, st_makepoint(q_lng, q_lat)::geography) / 1000
    end,
    1 - (l.embedding <=> q_emb)
  from listings l
  where (q_size      is null or l.size = q_size or l.size = 'FREE')
    and (q_max_price is null or l.price_per_day <= q_max_price)
    and (q_gender    is null or l.gender in (q_gender, 'unisex'))
    and (q_categories is null or l.category = any(q_categories))
    and (q_lat       is null or st_dwithin(
           l.location, st_makepoint(q_lng, q_lat)::geography, q_radius_km * 1000))
  order by l.embedding <=> q_emb
  limit k;
$$;

revoke execute on function public.match_listings from public, anon, authenticated;
grant execute on function public.match_listings to service_role;
