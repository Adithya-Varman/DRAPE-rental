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
  makes double-booking impossible, even when two people pay at the same moment. There are no accounts, so
  **My Rentals** shows the bookings made in this browser, using a secret token saved when booking.
  **Payments are mocked for the demo** (`api/_lib/payments.ts`): no money moves. Replacing that one function with a
  real provider (e.g. a Razorpay order plus signature check) is the only change needed to go live.

### API

| Route | Purpose |
|---|---|
| `GET /api/areas` | The 15 seeded Chennai areas |
| `GET /api/listings?occasion=&limit=` | Listings for the nearby row and Explore's occasion chips |
| `GET /api/listings/:id` · `/:id/contact` | One listing · its owner contact |
| `POST /api/listings/analyze` | Multipart photo → `{ image_url, draft }`, or `422 not_clothing` |
| `POST /api/listings` | Publish an edited draft (server computes embedding + location) |
| `POST /api/search` | `{ query, area, size?, max_price?, reasons? }` → `{ parsed, relaxed, results }` |
| `POST /api/search/reasons` | Batched "why it fits" for up to 6 results |
| `GET /api/listings/:id/availability` | Upcoming booked date ranges (no borrower details) |
| `POST /api/bookings` | Book dates and pay the advance → `{ booking, token }`, or `409` if the dates were just taken |
| `POST /api/bookings/lookup` | This browser's bookings, by `{ id, token }` pairs (powers My Rentals) |
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

All keys are server-side only. Never prefix them with `VITE_`. Optional tuning: `GEMINI_VISION_MODEL`,
`GEMINI_TEXT_MODEL`, `OPENAI_TEXT_MODEL`, `MATCH_FLOOR` (default `0.68`).

**New database?** Apply `supabase/migrations/*.sql` in order (SQL editor or `supabase db push`).

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Unit tests (contracts, routing, upload + search pipelines, fallback ladder, UI helpers) |
| `npm run build` | Type-check and build |
| `node scripts/verify-prd.mjs <url>` | **Demo-readiness check**: runs all 9 PRD §11 success criteria against a deployment |
| `node scripts/seed-listings.mjs <manifest.json> [--base <url>]` | Seed listings through the real analyze → publish flow (waits out rate limits) |

Deploy: `vercel deploy --prod` (the project is pinned to the `bom1` region, next to the Mumbai database).

## Demo script (~3 min)

Run `node scripts/verify-prd.mjs https://drape-sable.vercel.app` first. It should print **9/9 pass**.

1. **Hook (20 s).** "How many of you own an outfit you wore exactly once?" Then show the problem stat slide.
2. **Upload (60 s).** Open **List Item**, then choose a phone photo of a real outfit. Tags appear in about 3 seconds.
   Tweak one chip (add an occasion), set size, ₹/day and pickup area, then **Publish**. It opens the live listing.
3. **Search (60 s).** On **AI Stylist**, type "need something for a friend's sangeet, M, under ₹800". Results
   appear in about 2 seconds with distance chips, then a "why it fits" line on each card. Open one, then tap
   **Book this piece**. Pick dates, see the quote (rent, 20% advance, due at pickup), then **Pay advance**. It shows
   Confirmed with the owner's contact. Open **My Rentals** to show the booking card. Refine with "something less heavy".
4. **Fallback (20 s).** Search "bridal lehenga under ₹200" with the area set to Tambaram. The notice explains what was
   relaxed, and real lehengas still show up.
5. **Business + V1 (20 s).** Rental commission and membership. Next: deposits, ratings, booking, search by photo.

**Backups:** record a screen capture of the flow beforehand, and keep a phone hotspot ready.

## Good to know

- **Free-tier Gemini is capped at 15 requests/minute per model.** Uploads share that budget. Search text calls go to
  OpenAI when its key is set. When busy, uploads return `429` with a retry time, and the UI shows "try again in N seconds".
- **Negation isn't understood.** "No sarees" can't exclude sarees, because semantic search has no "not". The
  "why it fits" lines do call out the mismatch.
- **Seed data** is 48 demo listings: 19 occasion-wear pieces plus 29 from the team's product sheet. Owners are demo
  names with `@drape.demo` contacts.
- **Unpublished uploads keep their photo in Storage** (a few MB so far). To see them, run this in the Supabase SQL
  editor:
  `select o.name from storage.objects o left join listings l on l.image_url like '%/' || o.name where o.bucket_id = 'listings' and l.id is null;`
- **Out of scope for v0 (PRD §3):** accounts, payments, booking calendar, deposits, ratings, in-app chat, returns,
  real geolocation, and search by photo. My Rentals, Profile and Wardrobe are design mock-ups for V1.
