-- Phase 11: cancellations, listing management support, rate limiting, and negative search filters.

-- Who cancelled, when, and why (borrower cancels; owner declines).
alter table public.bookings
  add column cancelled_at timestamptz,
  add column cancelled_by text check (cancelled_by in ('borrower', 'owner'));

-- Notifications can now also tell the other party about a cancellation.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('booking_received', 'booking_cancelled', 'booking_declined'));

-- Fixed-window rate limiting shared by every serverless instance: one atomic upsert per request.
create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  count        int not null
);
alter table public.rate_limits enable row level security;

create or replace function public.hit_rate_limit(p_key text, p_window_seconds int, p_max int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_count int;
begin
  insert into public.rate_limits as r (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into current_count;
  return current_count <= p_max;
end $$;
revoke execute on function public.hit_rate_limit from public, anon, authenticated;
grant execute on function public.hit_rate_limit to service_role;

-- Search gains hard exclusions ("no sarees", "nothing black"). Same semantics as before otherwise.
drop function public.match_listings(extensions.vector, text, int, text, double precision, double precision, double precision, int);
create function public.match_listings(
  q_emb                extensions.vector(768),
  q_size               text             default null,
  q_max_price          int              default null,
  q_gender             text             default null,
  q_lat                double precision default null,
  q_lng                double precision default null,
  q_radius_km          double precision default 10,
  k                    int              default 12,
  q_exclude_categories text[]           default null,
  q_exclude_colors     text[]           default null
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
    and (q_exclude_categories is null or not (l.category = any(q_exclude_categories)))
    and (q_exclude_colors     is null or not (l.colors && q_exclude_colors))
  order by l.embedding <=> q_emb
  limit k;
$$;
revoke execute on function public.match_listings from public, anon, authenticated;
grant execute on function public.match_listings to service_role;
