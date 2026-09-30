-- Phase 10: count failed logins per email address whether or not an account exists, so the lockout response can't be
-- used to discover which emails are registered. Replaces the per-user counters.
create table public.login_attempts (
  email        extensions.citext primary key,
  failed       int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);
alter table public.login_attempts enable row level security;
alter table public.users drop column failed_logins, drop column locked_until;
