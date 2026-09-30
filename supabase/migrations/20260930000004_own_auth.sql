-- Phase 9: our own accounts (email + password, Google as a second option) instead of Supabase Auth.
create extension if not exists citext with schema extensions;

create table public.users (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  email         extensions.citext not null unique check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name          text not null check (length(name) between 1 and 80),
  password_hash text,                -- 'scrypt$…' (ours) or a legacy bcrypt '$2a$…'; null for Google-only accounts
  google_sub    text unique,         -- Google's stable account id, once linked
  failed_logins int  not null default 0,
  locked_until  timestamptz          -- brute-force lockout
);

-- Only a SHA-256 of each session token is stored; the raw token lives in the user's httpOnly cookie.
create table public.sessions (
  token_hash text primary key,
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_idx on public.sessions (user_id);
create index sessions_expiry_idx on public.sessions (expires_at);

alter table public.users enable row level security;
alter table public.sessions enable row level security;

-- Carry existing Supabase Auth accounts over with the same ids and their bcrypt hashes (upgraded to scrypt on next login).
insert into public.users (id, created_at, email, name, password_hash)
select u.id, u.created_at, u.email, coalesce(p.name, split_part(u.email, '@', 1)), u.encrypted_password
from auth.users u left join public.profiles p on p.id = u.id
where u.email is not null
on conflict do nothing;

-- Point ownership, bookings and notifications at our users table.
alter table public.listings drop constraint listings_owner_id_fkey,
  add constraint listings_owner_id_fkey foreign key (owner_id) references public.users(id) on delete set null;
alter table public.bookings drop constraint bookings_borrower_id_fkey,
  add constraint bookings_borrower_id_fkey foreign key (borrower_id) references public.users(id) on delete set null;
alter table public.notifications drop constraint notifications_user_id_fkey,
  add constraint notifications_user_id_fkey foreign key (user_id) references public.users(id) on delete cascade;

-- Supabase Auth profile plumbing is no longer used (names live on public.users).
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table public.profiles;
