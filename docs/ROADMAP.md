# DRAPE — Implementation Roadmap (PRD "Wear Once" v0)

Goal: turn the existing DRAPE frontend into the working v0 from the PRD — **AI upload → searchable listing** and
**plain-language search → ranked nearby matches** — without changing the visual design.

## Ground rules

- **Design is frozen.** No edits to existing CSS rules, colours, fonts, or layout. New states reuse existing classes
  (`product-card`, `ai-response`, `suggestion`, `why-match`, `form-step`, `primary-button`, `toast`, …). Any
  genuinely new element (e.g. area dropdown list) gets a minimal *additive* rule built from the existing tokens.
- **Stack decision:** keep Vite + React; add Vercel serverless functions under `/api` (Web `Request → Response`
  handlers). This replaces the PRD's Next.js assumption without changing any contract.
- **Core principle (PRD §5):** size / budget / distance / gender are SQL filters. Occasion / vibe / style is vector
  ranking. The LLM never decides whether an item fits a budget.
- **Secrets stay server-side.** `GEMINI_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are only read in `/api`.
- **AI providers (decided in Phases 2–3):** Gemini `gemini-3.5-flash-lite` tags photos and `gemini-embedding-001` makes the
  768-d embeddings; OpenAI `gpt-5.4-mini` handles the search-time parser and "why it fits" reasons, with Gemini as an
  automatic fallback. The split exists because the Gemini free tier allows only 15 requests/minute per model.

## Status

| Phase | State |
|---|---|
| 0 Foundation | ✅ merged (#1) |
| 1 Data layer | ✅ merged (#2) |
| 2 Upload pipeline | ✅ merged (#3) |
| 3 Search pipeline | ✅ merged (#4) |
| 4 Frontend integration | ✅ merged (#5) |
| 5 Seed data, QA & demo | ✅ merged (#6) — 9/9 PRD success criteria pass live (`scripts/verify-prd.mjs`) |
| 6 Bookings (post-PRD) | ✅ merged (#7) — book dates, mock 20% advance, contact on confirmation, My Rentals |
- **Every phase ends with QA → PR → merge to `main`.** QA = `npm run build`, `npm test`, plus a browser pass
  comparing the untouched screens against the baseline.

## Screen mapping (PRD §9 → existing design)

| PRD element | Where it lives in the current design |
|---|---|
| Area selector (header, persisted) | Existing `📍 Chennai ▾` button in the top bar → opens area list, saved to `localStorage` |
| Chat bar + size/budget chips | Existing prompt box + `suggestion` chips on the AI Stylist page |
| Occasion templates grid | Existing "Picked for you nearby" section, driven by `GET /api/listings?occasion=` |
| Results thread | Existing `ai-response` block (user query + relaxed notice) followed by `product-card` grid |
| "Why it fits" | Existing `why-match` block on the detail page + one-line reason on cards |
| Detail + "Show contact" | Existing detail page; primary button reveals owner contact |
| List-a-dress: upload → analyze → edit chips → publish | Existing List Item page (`upload-panel`, `form-step`s, publish button, toast) |
| Explore | Existing Explore grid, backed by real listings |
| Rentals / Profile / Wardrobe | Unchanged (V1 per PRD §3 "Out") |

## Phases

### Phase 0 — Foundation ✅ checkpoint: build + tests green, UI pixel-identical
- Fix the broken `npm run build` (missing `vite-env.d.ts`); pin `latest` deps to real versions.
- Add Vitest, `.env.example`, `vercel.json`.
- Shared contracts in `shared/`: controlled vocabulary (categories, occasions, sizes), zod schemas for the VLM draft,
  the parsed query, and every API request/response — one source of truth for UI and API.
- Local dev: a Vite plugin serves `/api/*` handlers so `npm run dev` runs the full stack without `vercel dev`.

### Phase 1 — Data layer ✅ checkpoint: `GET /api/areas` and `GET /api/listings` return real rows
- New Supabase project `drape`; migrations in `supabase/migrations/` (pgvector, PostGIS, `listings`, `areas`,
  indexes, `match_listings` RPC exactly as PRD §6, public `listings` image bucket, RLS locked down).
- Seed ~15 Chennai areas.
- `api/_lib/supabase.ts`, `GET /api/areas`, `GET /api/listings?occasion=&limit=` (owner contact never included).

### Phase 2 — Upload pipeline ✅ checkpoint: analyze a photo via curl in < 10 s; non-clothing rejected
- `api/_lib/gemini.ts`: one `embed()` helper (768-d, locked), structured-output vision call.
- `POST /api/listings/analyze`: store image → Gemini Flash vision → zod validate → one retry → `{ image_url, draft }`
  or `{ error: "not_clothing" }`.
- `POST /api/listings`: validate edited draft + terms, build embedding text (title + category + occasions + style_tags
  + colors + description), look up area lat/lng, insert. Searchable immediately.
- `GET /api/listings/:id/contact` for "Show contact".

### Phase 3 — Search pipeline ✅ checkpoint: ranked results via curl in < 4 s; filters never violated
- Parser (Gemini Flash, JSON mode) → `{ occasion, size, max_price, gender, style_query }`; UI chips override.
- Embed `style_query` → `match_listings` at 10 km.
- Fallback ladder on 0 results: 25 km → drop budget → drop radius, with a human `relaxed` message.
- One batched "why it fits" call for the top 6 (≤ 15 words each).
- Unit tests for override logic, ladder ordering, and the relaxed messages.

### Phase 4 — Frontend integration (no design change) ✅ checkpoint: upload in UI → appears in UI search
- Area selector, search + results thread, relaxed notice, card reasons, detail page with real tags + contact reveal.
- List Item: real file picker, analyzing state, editable chips, size / ₹ per day / area / name / contact, publish →
  toast → open listing. Friendly "That doesn't look like clothing."
- Home "Picked for you nearby" and Explore backed by the API; loading / error / empty states.

### Phase 5 — Seed data, QA & demo hardening ✅ checkpoint: every PRD §11 success criterion checked
- Seed ≥ 40 listings across ≥ 6 occasions and ≥ 5 areas **through the real upload pipeline** (seed script).
- Verify each success criterion; latency measurements; README with setup + demo script.

## PRD §11 success criteria → owning phase

| Criterion | Phase |
|---|---|
| Upload returns editable AI tags in < 10 s | 2, 4 |
| Non-clothing rejected, friendly message, no crash | 2, 4 |
| Published listing searchable immediately | 2, 4 |
| Search < 4 s end-to-end | 3, 5 |
| Size / budget / radius never violated unless relaxed + announced | 3 |
| Demo query top 3 plausible | 5 |
| Zero results → fallback ladder + relaxed notice | 3, 4 |
| Every occasion template shows ≥ 3 real listings | 5 |
| ≥ 40 listings, ≥ 6 occasions, ≥ 5 areas | 5 |

### Phase 6 — Bookings (added after v0, at the team's request)
- `bookings` table with a `btree_gist` exclusion constraint so confirmed bookings of one listing can never overlap.
- Book → dates, name and contact → quote (rent, 20% advance with a ₹50 minimum, due at pickup) → mock payment →
  confirmation with the owner's contact → **My Rentals** (the existing V1 screen, now real).
- Payments are mocked behind `chargeAdvance()`; swap in Razorpay to take real money. The free contact reveal stays.

## Out of scope (V1 pitch)
Auth, real payments, deposits, ratings, in-app chat, returns, real geolocation, search-by-photo.
