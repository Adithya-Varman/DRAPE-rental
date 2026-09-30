# DRAPE — Wear Once, Don't Buy

A hyperlocal, peer-to-peer clothing rental network for Chennai. Describe what you need in plain language
("something for my friend's sangeet, M, under ₹800") and DRAPE finds a matching outfit a few kilometres away.
Listing is just as easy: snap a photo, and AI drafts the tags for you to review.

**Live:** https://drape-sable.vercel.app · **Plan:** [docs/ROADMAP.md](docs/ROADMAP.md)

## How it works

```
Browser (Vite + React) ──▶ /api (Vercel Functions, bom1) ──▶ Supabase: Postgres + pgvector + PostGIS + Storage
                                   │
                                   ├─ Gemini gemini-3.5-flash-lite   photo → tags (upload only)
                                   ├─ Gemini gemini-embedding-001    768-d embeddings (upload + search)
                                   └─ OpenAI gpt-5.4-mini            query parser + "why it fits" (Gemini fallback)
```

- **Hard filters are SQL, fuzzy intent is vectors.** Size, budget, distance and gender are `WHERE` clauses in
  `match_listings`. Occasion, vibe and style are cosine ranking. The LLM never decides whether an item fits a budget.
- **Fallback ladder.** If a search has no good match, DRAPE searches 10 km → 25 km → without the budget → anywhere,
  and says exactly what it relaxed ("No good match under ₹800 near Adyar, so here are options up to ₹1,200 within 25 km").
- **Human in the loop.** Uploaded photos get AI-drafted tags that the lister edits before publishing.
- **Contact stays private.** Owner contact is only returned when someone taps the owner row, or in a booking
  confirmation. The database has RLS on with no public policies; all access goes through `/api`.
- **Bookings.** *Book this piece* lets you pick dates (up to 14 days, up to 90 days ahead) and pay a 20% advance
  (minimum ₹50). The rest is paid at pickup. The server recomputes every price, and a Postgres exclusion constraint
  makes double-booking impossible, even when two people pay at the same moment.
- **Accounts + notifications.** Our own accounts, not Supabase Auth: email + password stored in `users` (scrypt hashes;
  5 wrong tries lock that email address for 10 minutes, counted the same way for addresses with and without accounts), and sessions in an httpOnly, Secure, SameSite=Lax cookie whose SHA-256
  is kept in `sessions`. **Continue with Google** goes through Supabase Auth's Google provider (PKCE); the verified
  identity is copied into our `users` table and our own session starts. Publishing and booking need an account; browsing,
  search and the free contact reveal don't. When someone books, a database trigger creates a notification for the
  listing's owner **in the same transaction**, so it can't be lost. The owner sees it on the header bell (unread
  badge) with the borrower's name, dates, amount paid and contact. The API resolves the user from the session cookie on
  every request and never trusts a user id sent by the browser; state-changing requests from other sites are refused.
  **Payments are mocked for the demo** (`api/_lib/payments.ts`): no money moves. Replacing that one function with a
  real provider (e.g. a Razorpay order plus signature check) is the only change needed to go live.

### API

| Route | Purpose |
|---|---|
| `GET /api/areas` | The 15 seeded Chennai areas |
| `GET /api/listings?area=&occasion=&limit=&offset=` | `{ listings, total }` — nearest first when an area is given (nearby row, Explore paging); CDN-cached 30 s |
| `GET /api/listings/:id` · `/:id/contact` | One listing · its owner contact |
| `POST /api/listings/analyze` 🔒 | Multipart photo → `{ image_url, draft }`, or `422 not_clothing` (signed in, or the server key for scripts) |
| `POST /api/listings` | Publish an edited draft (server computes embedding + location) |
| `POST /api/search` | `{ query, area, size?, max_price?, reasons? }` → `{ parsed, relaxed, results }` |
| `POST /api/search/reasons` | Batched "why it fits" for up to 6 results |
| `GET /api/listings/:id/availability` | Upcoming booked date ranges (no borrower details) |
| `POST /api/bookings` 🔒 | Book dates and pay the advance → `{ booking }`, or `409` if the dates were just taken |
| `GET /api/bookings/mine` 🔒 | The signed-in user's bookings (My Rentals) |
| `GET /api/notifications` 🔒 · `POST /api/notifications/read` 🔒 | The bell: bookings of your pieces, with the borrower's contact |
| `GET /api/me` 🔒 | Profile + stats (items listed, rentals, earned) |
| `GET /api/listings/:id/complete` | "Complete the look": pieces that pair with this one (bottoms for a top, layers for a dress…) |
| `POST /api/admin/retag` 🔑 | Re-run tagging on one listing (server key in `x-admin-key`; used by `scripts/retag-listings.mjs`) |

| `POST /api/auth/signup` · `/login` · `/logout` | Email + password accounts (sets / clears the `drape_session` cookie) |
| `GET /api/auth/google` → `/api/auth/google/callback` | Continue with Google (Supabase provider, PKCE) |
| `GET /api/auth/providers` | Which sign-in options are available |

🔒 = needs the signed-in session cookie; `POST /api/listings` (publishing) is 🔒 too.
| `GET /api/health` | Which services are configured |

## Run it locally

Requires Node 20+.

```bash
npm install
cp .env.example .env.local   # then fill in the keys below
npm run dev                  # http://localhost:5173 — the dev server also serves /api
```

| Variable | Where to get it |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → **secret** key |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| `OPENAI_API_KEY` | Optional but recommended — search falls back to Gemini without it |

**Google sign-in (optional):** in Supabase → Authentication → Sign In / Providers → **Google**, turn it on with a Google
OAuth client (Google Cloud Console → Credentials → OAuth client ID, type *Web application*, authorized redirect URI
`https://<project>.supabase.co/auth/v1/callback`). Then in Authentication → URL Configuration → **Redirect URLs** add
`https://<your-site>/api/auth/google/callback` and `http://localhost:5173/api/auth/google/callback`. The button appears
automatically once Google is enabled. No keys are needed in this app.

All other keys are server-side only. Never prefix them with `VITE_`. Optional tuning: `GEMINI_VISION_MODEL`,
`GEMINI_TEXT_MODEL`, `OPENAI_TEXT_MODEL`, `MATCH_FLOOR` (default `0.68`).

**New database?** Apply `supabase/migrations/*.sql` in order (SQL editor or `supabase db push`).

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Unit tests (contracts, routing, upload + search pipelines, fallback ladder, UI helpers) |
| `npm run build` | Type-check and build |
| `node --env-file=.env.local scripts/verify-prd.mjs <url>` | **Demo-readiness check**: runs all 9 PRD §11 success criteria against a deployment (the server key covers the upload checks) |
| `node --env-file=.env.local scripts/seed-listings.mjs <manifest.json> [--base <url>]` | Seed listings through the real analyze → publish flow (waits out rate limits) |
| `node --env-file=.env.local scripts/create-demo-owner.mjs` | Create the demo owner (`owner@drape.demo`, generated password printed once) and give it every unowned listing |
| `node --env-file=.env.local scripts/retag-listings.mjs [--only cat1,cat2]` | Re-tag listings with the current prompt and vocabulary (run against the local dev server) |

Deploy: `vercel deploy --prod` (the project is pinned to the `bom1` region, next to the Mumbai database).

## Demo script (~3 min)

Run `node --env-file=.env.local scripts/verify-prd.mjs https://drape-sable.vercel.app` first. It should print **9/9 pass**.

1. **Hook (20 s).** "How many of you own an outfit you wore exactly once?" Then show the problem stat slide.
2. **Upload (60 s).** Open **List Item**, then choose a phone photo of a real outfit. Tags appear in about 3 seconds.
   Tweak one chip (add an occasion), set size, ₹/day and pickup area, then **Publish**. It opens the live listing.
   *(Before the demo, run `scripts/create-demo-owner.mjs` and sign in as the demo owner in a second browser window, so the
   bell is ready.)*
3. **Search (60 s).** On **AI Stylist**, type "need something for a friend's sangeet, M, under ₹800". Results
   appear in about 2 seconds with distance chips, then a "why it fits" line on each card. Open one, then tap
   **Book this piece**. Pick dates, see the quote (rent, 20% advance, due at pickup), then **Pay advance**. It shows
   Confirmed with the owner's contact. Open **My Rentals** to show the booking card. Switch to the owner's window:
   the **bell** shows the new booking with the borrower's contact. Refine with "something less heavy".
4. **Fallback (20 s).** Search "bridal lehenga under ₹200" with the area set to Tambaram. The notice explains what was
   relaxed, and real lehengas still show up.
5. **Business + V1 (20 s).** Rental commission and membership. Next: deposits, ratings, booking, search by photo.

**Backups:** record a screen capture of the flow beforehand, and keep a phone hotspot ready.

## Good to know

- **Free-tier Gemini is capped at 15 requests/minute per model.** Uploads share that budget. Search text calls go to
  OpenAI when its key is set. When busy, uploads return `429` with a retry time, and the UI shows "try again in N seconds".
- **Negation isn't understood.** "No sarees" can't exclude sarees, because semantic search has no "not". The
  "why it fits" lines do call out the mismatch.
- **Seed data** is 79 demo listings: occasion wear, 29 pieces from the team's product sheet, and 31 bottoms and
  club/gig pieces. Owners are demo
  names with `@drape.demo` contacts.
- **Performance.** The hero is a 34 KB WebP (was a 2.6 MB PNG). Public reads are cached at Vercel's edge for 30–60 s,
  and JS/CSS assets for a year. Security headers (CSP, frame denial, nosniff, referrer and permissions policy) are set
  in `vercel.json`.
- **Backend guide:** [docs/DRAPE-backend-guide.pdf](docs/DRAPE-backend-guide.pdf) explains the backend from A to Z.
- **All API routes run as one Vercel Function** (`api/router.ts`), because the Hobby plan allows only 12 per
  deployment. Add a new route in `api/_routes/` and register it in the router's table; a test fails if you forget.
- **Unpublished uploads keep their photo in Storage** (a few MB so far). To see them, run this in the Supabase SQL
  editor:
  `select o.name from storage.objects o left join listings l on l.image_url like '%/' || o.name where o.bucket_id = 'listings' and l.id is null;`
- **Out of scope for v0 (PRD §3):** real payments, booking calendar, deposits, ratings, in-app chat, returns,
  real geolocation, and search by photo. My Rentals, Profile and Wardrobe are design mock-ups for V1.
