#!/usr/bin/env node
// Re-tags listings with the current vision prompt + vocabulary (e.g. after new categories/occasions are added).
// Overwrites AI fields (title, category, gender, occasions, style, colours, formality, description, embedding);
// keeps owner, size, price, area and photo.
//
//   node --env-file=.env.local scripts/retag-listings.mjs [--base http://localhost:5173] [--only other,shirt] [--dry-run]

import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const base = (args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:5173').replace(/\/$/, '')
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key || !process.env.SUPABASE_URL) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local).'); process.exit(1) }

// Read every listing straight from the database (one query, no paging needed).
const db = createClient(process.env.SUPABASE_URL, key, { auth: { persistSession: false } })
const { data: listings, error } = await db.from('listings').select('id, title, category').order('created_at')
if (error) { console.error(error.message); process.exit(1) }
const targets = listings.filter((l) => !only || only.includes(l.category))
console.log(`${targets.length} listing(s) to re-tag${only ? ` (categories: ${only.join(', ')})` : ''}`)
if (args.includes('--dry-run')) { targets.forEach((l) => console.log(`  ${l.category.padEnd(12)} ${l.title}`)); process.exit(0) }

let changed = 0
for (const [i, l] of targets.entries()) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${base}/api/admin/retag`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': key }, body: JSON.stringify({ id: l.id }) })
    const body = await res.json()
    if (res.status === 429) { console.log(`  rate limited — waiting ${body.retry_after}s`); await new Promise((r) => setTimeout(r, (body.retry_after + 1) * 1000)); continue }
    if (!res.ok) { console.log(`[${i + 1}/${targets.length}] ✗ ${l.title}: ${body.error}`); break }
    if (body.skipped) { console.log(`[${i + 1}/${targets.length}] – ${l.title}: skipped (${body.skipped})`); break }
    const moved = body.before.category !== body.after.category || body.before.occasions.join() !== body.after.occasions.join()
    if (moved) changed++
    console.log(`[${i + 1}/${targets.length}] ${moved ? '✎' : '='} ${body.before.category} → ${body.after.category} | ${body.after.title} [${body.after.occasions.join(', ')}]`)
    break
  }
}
console.log(`\nDone. ${changed} listing(s) changed category or occasions.`)
