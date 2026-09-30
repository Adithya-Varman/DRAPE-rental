#!/usr/bin/env node
// Creates (or reuses) the shared demo owner account in our own users table and gives it every listing that has no
// owner yet — so bookings on the seeded listings notify someone you can log in as on stage. Safe to re-run.
//
//   node --env-file=.env.local scripts/create-demo-owner.mjs [email] [password] ["Display Name"]
//
// With no arguments it uses owner@drape.demo and generates a strong password, printed once in your terminal.
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server keys — run this on your machine, never in the browser).

import { randomBytes, scryptSync } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const email = (args[0] ?? 'owner@drape.demo').trim().toLowerCase()
const generated = !args[1]
const password = args[1] ?? `drape-${randomBytes(9).toString('base64url')}`
const name = args[2] ?? 'DRAPE Demo Owner'
if (password.length < 8) { console.error('Password must be at least 8 characters.'); process.exit(1) }
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local).'); process.exit(1) }

// Same format the API writes (api/_lib/passwords.ts): scrypt$N$r$p$salt$hash
function hashPassword(pw) {
  const salt = randomBytes(16)
  const key = scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

let { data: user, error: findError } = await db.from('users').select('id').eq('email', email).maybeSingle()
if (findError) { console.error('Could not look up the account:', findError.message); process.exit(1) }
let created = false
if (user) {
  console.log(`Account ${email} already exists — reusing it (password unchanged).`)
} else {
  const { data, error } = await db.from('users').insert({ email, name, password_hash: hashPassword(password) }).select('id').single()
  if (error) { console.error('Could not create account:', error.message); process.exit(1) }
  user = data
  created = true
  console.log(`Created ${email} (${name}).`)
}

const { data: claimed, error } = await db.from('listings').update({ owner_id: user.id }).is('owner_id', null).select('id')
if (error) { console.error('Could not assign listings:', error.message); process.exit(1) }
const { count } = await db.from('listings').select('id', { count: 'exact', head: true }).eq('owner_id', user.id)
console.log(`Assigned ${claimed.length} unowned listings. ${email} now owns ${count} listings.`)
console.log('Sign in on the site with this account to see booking notifications on the bell.')
// Only print a password we actually set; an existing account keeps its own.
if (created && generated) {
  console.log(`\n  Login for the demo:  ${email}  /  ${password}\n  (Shown once — save it somewhere safe.)`)
}
