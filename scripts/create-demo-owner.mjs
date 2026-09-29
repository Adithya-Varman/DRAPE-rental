#!/usr/bin/env node
// Creates (or reuses) the shared demo owner account and gives it every listing that has no owner yet — so bookings
// on the seeded listings notify someone you can log in as on stage. Safe to re-run.
//
//   node --env-file=.env.local scripts/create-demo-owner.mjs <email> <password> ["Display Name"]
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server keys — run this on your machine, never in the browser).

import { createClient } from '@supabase/supabase-js'

const [email, password, name = 'DRAPE Demo Owner'] = process.argv.slice(2)
if (!email || !password) {
  console.error('Usage: node --env-file=.env.local scripts/create-demo-owner.mjs <email> <password> ["Display Name"]')
  process.exit(1)
}
if (password.length < 6) { console.error('Password must be at least 6 characters.'); process.exit(1) }
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local).'); process.exit(1) }

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

async function findUser(address) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email?.toLowerCase() === address.toLowerCase())
    if (hit || data.users.length < 200) return hit ?? null
  }
  return null
}

let user = await findUser(email)
if (user) {
  console.log(`Account ${email} already exists — reusing it (password unchanged).`)
} else {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } })
  if (error) { console.error('Could not create account:', error.message); process.exit(1) }
  user = data.user
  console.log(`Created ${email} (${name}).`)
}

const { data: claimed, error } = await db.from('listings').update({ owner_id: user.id }).is('owner_id', null).select('id')
if (error) { console.error('Could not assign listings:', error.message); process.exit(1) }
const { count } = await db.from('listings').select('id', { count: 'exact', head: true }).eq('owner_id', user.id)
console.log(`Assigned ${claimed.length} unowned listings. ${email} now owns ${count} listings.`)
console.log('Sign in on the site with this account to see booking notifications on the bell.')
