-- Bookings (post-PRD Phase 6): reserve dates with a small advance; confirmation reveals the owner's contact.
-- btree_gist lets one exclusion constraint combine "same listing" (=) with "overlapping dates" (&&).
create extension if not exists btree_gist with schema extensions;

create table public.bookings (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  listing_id       uuid not null references public.listings(id) on delete cascade,
  borrower_name    text not null check (length(borrower_name) between 1 and 80),
  borrower_contact text not null check (length(borrower_contact) between 3 and 120),
  start_date       date not null,
  end_date         date not null,
  days             int  not null check (days between 1 and 14),
  price_per_day    int  not null check (price_per_day > 0),
  total            int  not null check (total > 0),
  advance          int  not null check (advance > 0 and advance <= total),
  status           text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  payment_method   text not null check (payment_method in ('upi', 'card')),
  payment_ref      text not null,
  -- The borrower's browser holds the raw token; only its SHA-256 is stored. Needed to look a booking up later.
  access_token_hash text not null,
  check (end_date >= start_date),
  -- Race-proof double-booking guard: two confirmed bookings of one listing can never overlap, even if two
  -- people pay at the same instant.
  constraint bookings_no_overlap exclude using gist (
    listing_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status = 'confirmed')
);

create index bookings_listing_dates_idx on public.bookings (listing_id, end_date);

-- Same model as listings: RLS on, no policies, all access through /api with the service role.
alter table public.bookings enable row level security;
