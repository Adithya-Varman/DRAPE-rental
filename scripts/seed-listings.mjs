#!/usr/bin/env node
// Seeds listings through the REAL upload pipeline (analyze → publish), exactly as a lister would — so seeded data
// exercises the same vision tagging, embeddings and validation as the demo.
//
// Usage:
//   node --env-file=.env.local scripts/seed-listings.mjs <manifest.json> [--base http://localhost:5173] [--dry-run]
//
// Manifest: an array of
//   { "image": "photos/red-lehenga.jpg" | "https://…", "size": "M", "price_per_day": 800, "area": "Adyar",
//     "owner_name": "Priya", "owner_contact": "98400 00000", "overrides": { "occasions": ["wedding"] } }
// `image` paths are resolved relative to the manifest. `overrides` optionally corrects AI tags (the review step).

import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const args = process.argv.slice(2)
const manifestPath = args.find((a) => !a.startsWith('--'))
const base = (args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:5173').replace(/\/$/, '')
const dryRun = args.includes('--dry-run')
if (!manifestPath) {
  console.error('Usage: node scripts/seed-listings.mjs <manifest.json> [--base URL] [--dry-run]')
  process.exit(1)
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const dir = dirname(resolve(manifestPath))

async function loadImage(image) {
  if (/^https?:\/\//.test(image)) {
    const res = await fetch(image)
    if (!res.ok) throw new Error(`download failed (${res.status})`)
    return new Blob([await res.arrayBuffer()])
  }
  return new Blob([await readFile(resolve(dir, image))])
}

const adminHeader = process.env.SUPABASE_SERVICE_ROLE_KEY ? { 'x-admin-key': process.env.SUPABASE_SERVICE_ROLE_KEY } : {}
let ok = 0
for (const [i, item] of manifest.entries()) {
  const label = `[${i + 1}/${manifest.length}] ${item.image.split('/').pop()}`
  try {
    const form = new FormData()
    form.append('image', await loadImage(item.image), 'photo.jpg')
    const started = Date.now()
    let analyzed
    for (let tries = 0; ; tries++) {
      analyzed = await fetch(`${base}/api/listings/analyze`, { method: 'POST', body: form, headers: adminHeader }).then((r) => r.json())
      if (analyzed.error !== 'rate_limited' || tries >= 5) break
      console.log(`${label}  rate limited — waiting ${analyzed.retry_after}s`)
      await new Promise((r) => setTimeout(r, (analyzed.retry_after + 1) * 1000))
    }
    if (!analyzed.draft) throw new Error(`analyze → ${analyzed.error}`)
    const listing = {
      ...analyzed.draft,
      ...item.overrides,
      image_url: analyzed.image_url,
      size: item.size,
      price_per_day: item.price_per_day,
      area: item.area,
      owner_name: item.owner_name,
      owner_contact: item.owner_contact,
    }
    const secs = ((Date.now() - started) / 1000).toFixed(1)
    if (dryRun) {
      console.log(`${label}  ${secs}s  would publish: ${listing.title} [${listing.category}; ${listing.occasions.join(', ')}]`)
      ok++
      continue
    }
    const created = await fetch(`${base}/api/listings`, {
      method: 'POST',
      // Publishing needs an account; seeding uses the server key instead (run with --env-file=.env.local).
      headers: { 'content-type': 'application/json', ...(process.env.SUPABASE_SERVICE_ROLE_KEY ? { 'x-admin-key': process.env.SUPABASE_SERVICE_ROLE_KEY } : {}) },
      body: JSON.stringify(listing),
    }).then((r) => r.json())
    if (!created.listing) throw new Error(`publish → ${JSON.stringify(created).slice(0, 200)}`)
    console.log(`${label}  ${secs}s  ✓ ${created.listing.title} [${created.listing.category}; ${created.listing.occasions.join(', ')}] ${item.size} ₹${item.price_per_day} ${item.area}`)
    ok++
  } catch (error) {
    console.error(`${label}  ✗ ${error.message}`)
  }
}
console.log(`\n${ok}/${manifest.length} ${dryRun ? 'analyzed' : 'published'}`)
process.exit(ok === manifest.length ? 0 : 1)
