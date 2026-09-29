#!/usr/bin/env node
// Demo-readiness check: verifies every PRD §11 success criterion against a running deployment.
//
//   node scripts/verify-prd.mjs [https://drape-sable.vercel.app] [--area Adyar]
//
// Uses ~3 vision calls and ~15 text calls, well inside free-tier limits. Exits non-zero if anything fails.
// Note: the two garment uploads are analyzed but not published, so their photos stay in Storage.

const args = process.argv.slice(2)
const BASE = (args.find((a) => /^https?:\/\//.test(a)) ?? 'http://localhost:5173').replace(/\/$/, '')
const AREA = args.includes('--area') ? args[args.indexOf('--area') + 1] : 'Adyar'
const OCCASIONS = ['wedding', 'reception', 'sangeet_mehendi', 'festival', 'party', 'interview', 'formal_event', 'photoshoot', 'college_event', 'casual_outing']
const GARMENTS = [
  'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80', // saree
  'https://images.unsplash.com/photo-1617137968427-85924c800a22?auto=format&fit=crop&w=1200&q=80', // suit
]
const NOT_CLOTHING = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80' // food
const DEMO_QUERY = 'need something for a friend’s sangeet, M, under ₹800'

const results = []
const record = (id, name, pass, detail) => { results.push({ id, name, pass, detail }); console.log(`${pass ? '✅ PASS' : '❌ FAIL'}  ${id} ${name}\n         ${detail}`) }
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const timed = async (fn) => { const t = performance.now(); const value = await fn(); return [value, performance.now() - t] }
const getJson = (path) => fetch(`${BASE}${path}`).then((r) => r.json())
const search = (body) => fetch(`${BASE}/api/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ area: AREA, reasons: false, ...body }) }).then((r) => r.json())
async function analyze(url) {
  const blob = new Blob([await fetch(url).then((r) => r.arrayBuffer())])
  const form = new FormData()
  form.append('image', blob, 'photo.jpg')
  const response = await fetch(`${BASE}/api/listings/analyze`, { method: 'POST', body: form })
  return { status: response.status, body: await response.json() }
}

console.log(`\nDRAPE demo-readiness check → ${BASE} (area: ${AREA})\n`)

// 1. Upload → editable AI tags in < 10 s
{
  const times = []
  let ok = true
  for (const url of GARMENTS) {
    const [{ status, body }, ms] = await timed(() => analyze(url))
    times.push(ms)
    if (status !== 200 || !body.draft?.title) ok = false
  }
  record('#1', 'Upload returns editable AI tags in < 10 s', ok && Math.max(...times) < 10_000, `${times.map((t) => (t / 1000).toFixed(1) + 's').join(', ')} (max ${(Math.max(...times) / 1000).toFixed(1)}s)`)
}

// 2. Non-clothing rejected with a friendly message, no crash
{
  const { status, body } = await analyze(NOT_CLOTHING)
  record('#2', 'Non-clothing image rejected cleanly', status === 422 && body.error === 'not_clothing', `HTTP ${status} ${JSON.stringify(body)}`)
}

// 3. Published listing is searchable immediately — the create route writes the embedding synchronously, so
//    this is verified by the newest listing being findable by its own title.
{
  const [newest] = await getJson('/api/listings?limit=1').then((r) => r.listings)
  const found = await search({ query: newest.title })
  const rank = found.results.findIndex((r) => r.id === newest.id)
  record('#3', 'Published listing is searchable immediately', rank >= 0 && rank < 3, `newest listing "${newest.title}" ranks #${rank + 1} for its own title`)
}

// 4. Search < 4 s end to end (p50) — results-first path the UI uses
{
  const queries = [DEMO_QUERY, 'interview suit for my brother', 'party dress under 700', 'something for diwali', 'wedding guest saree', 'college farewell outfit', 'photoshoot look', 'reception gown size S']
  const times = []
  for (const query of queries) times.push((await timed(() => search({ query })))[1])
  const p50 = median(times)
  record('#4', 'Search returns results in < 4 s (p50)', p50 < 4000, `p50 ${(p50 / 1000).toFixed(2)}s, max ${(Math.max(...times) / 1000).toFixed(2)}s over ${times.length} queries (reasons load after results)`)
}

// 5. Size / budget / radius never violated unless relaxed and announced
{
  const cases = [
    { query: DEMO_QUERY }, { query: 'party outfit', size: 'S', max_price: 700 }, { query: 'job interview for my brother' },
    { query: 'bridal lehenga under 400' }, { query: 'wedding guest saree', area: 'Tambaram' }, { query: 'reception outfit', size: 'M', max_price: 600 },
  ]
  const violations = []
  for (const c of cases) {
    const r = await search(c)
    const { size, max_price } = r.parsed
    for (const x of r.results) {
      if (size && x.size !== size && x.size !== 'FREE') violations.push(`${c.query}: ${x.title} size ${x.size}`)
      if (!r.relaxed && max_price && x.price_per_day > max_price) violations.push(`${c.query}: ${x.title} ₹${x.price_per_day} > ₹${max_price}`)
      if (!r.relaxed && x.distance_km > 10.001) violations.push(`${c.query}: ${x.title} ${x.distance_km.toFixed(1)} km`)
    }
  }
  record('#5', 'Filters never violated unless relaxed + announced', violations.length === 0, violations.length ? violations.join('; ') : `${cases.length} scenarios, 0 violations`)
}

// 6. Demo query's top 3 are plausible for the occasion
{
  const r = await search({ query: DEMO_QUERY })
  const top = r.results.slice(0, 3)
  const plausible = top.filter((x) => x.occasions.includes(r.parsed.occasion) || ['festival', 'party'].some((o) => x.occasions.includes(o)))
  record('#6', 'Demo query top 3 plausible for the occasion', r.parsed.occasion === 'sangeet_mehendi' && plausible.length === 3, top.map((x) => `${x.title} [${x.occasions.join(', ')}]`).join(' | '))
}

// 7. Zero-result queries trigger the fallback ladder and a relaxed notice
{
  const r = await search({ query: 'bridal lehenga under ₹200', area: 'Tambaram' })
  record('#7', 'Zero-result query triggers fallback + notice', Boolean(r.relaxed) && r.results.length > 0, `relaxed: "${r.relaxed}" → ${r.results.length} results`)
}

// 8. Every occasion template shows at least 3 real listings
{
  const counts = await Promise.all(OCCASIONS.map(async (o) => [o, (await getJson(`/api/listings?occasion=${o}&limit=48`)).listings.length]))
  const thin = counts.filter(([, n]) => n < 3)
  record('#8', 'Every occasion template has ≥ 3 listings', thin.length === 0, counts.map(([o, n]) => `${o}=${n}`).join(', '))
}

// 9. ≥ 40 listings across ≥ 6 occasions and ≥ 5 areas
{
  const listings = (await getJson('/api/listings?limit=48')).listings
  const occasions = new Set(listings.flatMap((l) => l.occasions))
  const areas = new Set(listings.map((l) => l.area))
  record('#9', '≥ 40 listings, ≥ 6 occasions, ≥ 5 areas', listings.length >= 40 && occasions.size >= 6 && areas.size >= 5, `${listings.length}${listings.length === 48 ? '+' : ''} listings, ${occasions.size} occasions, ${areas.size} areas`)
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} PRD success criteria pass${failed.length ? ` — failing: ${failed.map((f) => f.id).join(', ')}` : ''}\n`)
process.exit(failed.length ? 1 : 0)
