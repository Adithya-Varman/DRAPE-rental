#!/usr/bin/env node
// Lists (and optionally deletes) listing photos that no listing uses and that are over a day old.
//
//   node --env-file=.env.local scripts/cleanup-orphans.mjs [--base https://drape-sable.vercel.app] [--delete]
//
// Dry run unless --delete is passed. To run it daily instead, set CRON_SECRET in Vercel and add to vercel.json:
//   "crons": [{ "path": "/api/admin/cleanup?delete=1", "schedule": "0 3 * * *" }]
const args = process.argv.slice(2)
const base = (args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:5173').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local).'); process.exit(1) }
const remove = args.includes('--delete')
const res = await fetch(`${base}/api/admin/cleanup${remove ? '?delete=1' : ''}`, { headers: { 'x-admin-key': key } })
const body = await res.json()
if (!res.ok) { console.error('Failed:', body.error); process.exit(1) }
console.log(`Scanned ${body.scanned} photos · ${body.in_use} in use · ${body.orphans} orphaned (older than a day)`)
if (body.sample.length) console.log('e.g.', body.sample.join('\n     '))
console.log(remove ? `Deleted ${body.deleted}.` : 'Dry run — nothing deleted. Re-run with --delete to remove them.')
