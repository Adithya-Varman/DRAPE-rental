-- Wear Once v0 schema (PRD §6). Extensions live in the `extensions` schema per Supabase convention.
create extension if not exists vector with schema extensions;
create extension if not exists postgis with schema extensions;

create table public.areas (
  name text primary key,
  lat  double precision not null,
  lng  double precision not null
);

create table public.listings (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  owner_name     text not null,
  owner_contact  text not null,
  image_url      text not null,
  title          text not null,
  category       text not null,
  gender         text not null check (gender in ('women','men','unisex')),
  occasions      text[] not null default '{}',
  style_tags     text[] not null default '{}',
  colors         text[] not null default '{}',
  formality      smallint not null check (formality between 1 and 5),
  size           text not null check (size in ('XS','S','M','L','XL','XXL','FREE')),
  price_per_day  int not null check (price_per_day > 0),
  area           text not null references public.areas(name),
  location       extensions.geography(point, 4326) not null,
  description    text not null,
  embedding      extensions.vector(768) not null
);

create index listings_embedding_idx on public.listings using hnsw (embedding extensions.vector_cosine_ops);
create index listings_location_idx  on public.listings using gist (location);
create index listings_occasions_idx on public.listings using gin (occasions);
create index listings_created_at_idx on public.listings (created_at desc);

-- All reads/writes go through /api with the service role. RLS on with no policies = anon/authenticated get nothing,
-- so owner_contact can never leak through the public REST endpoint.
alter table public.areas enable row level security;
alter table public.listings enable row level security;

-- Search RPC (PRD §6), unchanged semantics: hard filters in SQL, cosine ranking on the embedding.
create or replace function public.match_listings(
  q_emb        extensions.vector(768),
  q_size       text             default null,
  q_max_price  int              default null,
  q_gender     text             default null,
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
    and (q_lat       is null or st_dwithin(
           l.location, st_makepoint(q_lng, q_lat)::geography, q_radius_km * 1000))
  order by l.embedding <=> q_emb
  limit k;
$$;

revoke execute on function public.match_listings from public, anon, authenticated;
grant execute on function public.match_listings to service_role;

-- Public image bucket: anyone can view listing photos; only the service role (via /api) can upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listings', 'listings', true, 8388608, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;
