import bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { burnPasswordCheck, hashPassword, verifyPassword } from '../api/_lib/passwords.js'
import { cookie, hashToken, readCookie } from '../api/_lib/sessions.js'
import { crossSite } from '../api/router.js'

describe('passwords', () => {
  it('hashes with scrypt and verifies', async () => {
    const hash = await hashPassword('correct horse')
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/)
    expect(await verifyPassword(hash, 'correct horse')).toEqual({ ok: true, needsRehash: false })
    expect((await verifyPassword(hash, 'wrong horse')).ok).toBe(false)
  })
  it('never produces the same hash twice (random salt)', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'))
  })
  it('verifies legacy bcrypt hashes migrated from Supabase and asks for an upgrade', async () => {
    const legacy = await bcrypt.hash('old-password', 4)
    expect(await verifyPassword(legacy, 'old-password')).toEqual({ ok: true, needsRehash: true })
    expect((await verifyPassword(legacy, 'nope')).ok).toBe(false)
  })
  it('rejects missing or unknown hash formats', async () => {
    expect((await verifyPassword(null, 'x')).ok).toBe(false)
    expect((await verifyPassword('md5$abc', 'x')).ok).toBe(false)
  })
  it('burns comparable time for unknown emails', async () => {
    await expect(burnPasswordCheck('anything')).resolves.toBeUndefined()
  })
})

describe('session cookies', () => {
  const local = new Request('http://localhost:5173/api/auth/login')
  const prod = new Request('https://drape-sable.vercel.app/api/auth/login')
  it('are httpOnly, SameSite=Lax, and Secure except on plain-http localhost', () => {
    expect(cookie(prod, 'drape_session', 't', 60)).toBe('drape_session=t; Path=/; Max-Age=60; HttpOnly; SameSite=Lax; Secure')
    expect(cookie(local, 'drape_session', 't', 60)).not.toContain('Secure')
  })
  it('reads a cookie among others', () => {
    const r = new Request('http://x/', { headers: { cookie: 'a=1; drape_session=abc%3D; b=2' } })
    expect(readCookie(r, 'drape_session')).toBe('abc=')
    expect(readCookie(r, 'missing')).toBeNull()
  })
  it('stores only a hash of the token', () => {
    expect(hashToken('token')).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken('token')).not.toContain('token')
  })
})

describe('cross-site protection', () => {
  const req = (method: string, origin?: string) => new Request('https://drape-sable.vercel.app/api/bookings', { method, headers: { host: 'drape-sable.vercel.app', ...(origin ? { origin } : {}) } })
  it('blocks state-changing requests from other sites', () => {
    expect(crossSite(req('POST', 'https://evil.example'))).toBe(true)
  })
  it('allows same-origin, server-side (no Origin) and read-only requests', () => {
    expect(crossSite(req('POST', 'https://drape-sable.vercel.app'))).toBe(false)
    expect(crossSite(req('POST'))).toBe(false)
    expect(crossSite(req('GET', 'https://evil.example'))).toBe(false)
  })
})

// Route-level tests with a tiny in-memory users table.
type Row = Record<string, unknown>
let users: Row[] = []
const sessions: Row[] = []
vi.mock('../api/_lib/supabase', async (orig) => {
  const actual = await orig<typeof import('../api/_lib/supabase')>()
  const table = (name: string) => {
    const rows = name === 'users' ? users : sessions
    let filters: [string, unknown][] = []
    let pendingUpdate: Row | null = null
    let pendingInsert: Row | null = null
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q },
      lt: () => q,
      update: (patch: Row) => { pendingUpdate = patch; return q },
      delete: () => q,
      insert: (row: Row) => {
        pendingInsert = row
        return q
      },
      maybeSingle: async () => ({ data: rows.find((r) => filters.every(([k, v]) => r[k] === v)) ?? null, error: null }),
      single: async () => {
        if (pendingInsert && name === 'users' && users.some((u) => u.email === pendingInsert!.email)) return { data: null, error: { code: '23505' } }
        const row = { id: `u${rows.length + 1}`, failed_logins: 0, locked_until: null, ...pendingInsert }
        rows.push(row)
        return { data: row, error: null }
      },
      then: (resolve: (v: unknown) => void) => {
        if (pendingInsert) rows.push({ ...pendingInsert })
        if (pendingUpdate) rows.filter((r) => filters.every(([k, v]) => r[k] === v)).forEach((r) => Object.assign(r, pendingUpdate))
        filters = []
        resolve({ error: null })
      },
    }
    return q
  }
  return { ...actual, db: () => ({ from: table }) }
})
const { POST: signup } = await import('../api/_routes/auth/signup.js')
const { POST: login, MAX_FAILED_LOGINS } = await import('../api/_routes/auth/login.js')
const { GET: googleCallback } = await import('../api/_routes/auth/google/callback.js')
const post = (fn: (r: Request) => Promise<Response>, body: unknown) => fn(new Request('https://drape-sable.vercel.app/api/auth/x', { method: 'POST', body: JSON.stringify(body) }))

describe('sign-up and login routes', () => {
  beforeEach(() => { users = []; sessions.length = 0 })
  it('signs up, sets a session cookie, and never stores the plain password', async () => {
    const res = await post(signup, { name: 'Asha', email: 'Asha@Example.com', password: 'longenough' })
    expect(res.status).toBe(201)
    expect(res.headers.get('set-cookie')).toMatch(/^drape_session=.+HttpOnly/)
    expect(users[0].email).toBe('asha@example.com')
    expect(String(users[0].password_hash)).toMatch(/^scrypt\$/)
    expect(JSON.stringify(users)).not.toContain('longenough')
  })
  it('rejects duplicate emails and short passwords', async () => {
    await post(signup, { name: 'A', email: 'a@x.co', password: 'longenough' })
    expect((await post(signup, { name: 'B', email: 'a@x.co', password: 'longenough' })).status).toBe(409)
    expect((await post(signup, { name: 'C', email: 'c@x.co', password: 'short' })).status).toBe(400)
  })
  it('logs in with the right password and refuses the wrong one with the same message as an unknown email', async () => {
    await post(signup, { name: 'A', email: 'a@x.co', password: 'longenough' })
    expect((await post(login, { email: 'A@X.CO', password: 'longenough' })).status).toBe(200)
    const wrong = await post(login, { email: 'a@x.co', password: 'nope' })
    const unknown = await post(login, { email: 'ghost@x.co', password: 'nope' })
    expect(wrong.status).toBe(401)
    expect((await wrong.json()).error).toBe((await unknown.json()).error)
  })
  it(`locks the account after ${5} wrong passwords`, async () => {
    await post(signup, { name: 'A', email: 'a@x.co', password: 'longenough' })
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await post(login, { email: 'a@x.co', password: 'nope' })
    const locked = await post(login, { email: 'a@x.co', password: 'longenough' })
    expect(locked.status).toBe(429)
  })
  it('upgrades a legacy bcrypt hash to scrypt on successful login', async () => {
    users.push({ id: 'legacy', email: 'old@x.co', name: 'Old', password_hash: await bcrypt.hash('old-password', 4), failed_logins: 0, locked_until: null })
    expect((await post(login, { email: 'old@x.co', password: 'old-password' })).status).toBe(200)
    expect(String(users[0].password_hash)).toMatch(/^scrypt\$/)
  })
})

describe('Google sign-in via Supabase (PKCE)', async () => {
  const { newVerifier, authorizeUrl } = await import('../api/_lib/google.js')
  it('sends only the S256 challenge to Supabase and keeps the verifier', () => {
    process.env.SUPABASE_URL = 'https://proj.supabase.co'
    const { verifier, challenge } = newVerifier()
    const url = new URL(authorizeUrl(new Request('https://drape-sable.vercel.app/api/auth/google'), challenge))
    expect(url.origin + url.pathname).toBe('https://proj.supabase.co/auth/v1/authorize')
    expect(url.searchParams.get('provider')).toBe('google')
    expect(url.searchParams.get('code_challenge_method')).toBe('s256')
    expect(url.searchParams.get('redirect_to')).toBe('https://drape-sable.vercel.app/api/auth/google/callback')
    expect(url.toString()).not.toContain(verifier)
  })
  it('refuses a callback that did not start in this browser (no verifier cookie)', async () => {
    const res = await googleCallback(new Request('https://drape-sable.vercel.app/api/auth/google/callback?code=stolen'))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('auth_error=google_failed')
    expect(res.headers.get('set-cookie')).not.toContain('drape_session')
  })
})

describe('demo-owner script password format', () => {
  it('matches what the API verifies', async () => {
    const { randomBytes, scryptSync } = await import('node:crypto')
    const salt = randomBytes(16)
    const key = scryptSync('demo-password', salt, 64, { N: 16384, r: 8, p: 1 })
    const scriptHash = `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`
    expect((await verifyPassword(scriptHash, 'demo-password')).ok).toBe(true)
  })
})
