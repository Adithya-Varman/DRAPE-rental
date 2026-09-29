-- Phase 7: accounts (Supabase Auth), ownership, and owner notifications.

-- Public profile per auth user. Filled from sign-up metadata by a trigger, so it always exists.
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  name       text not null check (length(name) between 1 and 80)
);
alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Listings belong to the account that published them (nullable only for rows created before accounts existed).
alter table public.listings add column owner_id uuid references auth.users(id) on delete set null;
create index listings_owner_idx on public.listings (owner_id);

-- Bookings belong to the borrower's account; the per-browser token from Phase 6 is no longer needed.
alter table public.bookings add column borrower_id uuid references auth.users(id) on delete set null;
alter table public.bookings alter column access_token_hash drop not null;
create index bookings_borrower_idx on public.bookings (borrower_id, start_date);

-- In-app notifications (the header bell).
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null check (type in ('booking_received')),
  booking_id uuid references public.bookings(id) on delete cascade,
  read_at    timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;

-- Notify the owner inside the same transaction as the booking: a booking can never exist without its notification.
create or replace function public.notify_owner_of_booking()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner uuid;
begin
  select owner_id into owner from public.listings where id = new.listing_id;
  if owner is not null and new.status = 'confirmed' and owner is distinct from new.borrower_id then
    insert into public.notifications (user_id, type, booking_id) values (owner, 'booking_received', new.id);
  end if;
  return new;
end $$;
create trigger on_booking_created after insert on public.bookings for each row execute function public.notify_owner_of_booking();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.notify_owner_of_booking() from public, anon, authenticated;
