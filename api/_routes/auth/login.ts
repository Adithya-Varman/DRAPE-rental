import { z } from 'zod'
import { HttpError, json, readJson, route } from '../../_lib/http.js'
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../_lib/passwords.js'
import { createSession } from '../../_lib/sessions.js'
import { db } from '../../_lib/supabase.js'

const body = z.object({ email: z.string().trim().toLowerCase().max(200), password: z.string().max(200) })
export const MAX_FAILED_LOGINS = 5
export const LOCK_MINUTES = 10
const WRONG = 'Wrong email or password.'

// POST /api/auth/login { email, password } → { user } + session cookie.
// Every email — registered or not — is treated the same way: same message, same time spent hashing, and the same
// 10-minute lock after 5 misses (counted in login_attempts, per email address). So responses never reveal which
// emails have accounts, or which accounts use Google.
export const POST = route(async (request) => {
  const { email, password } = body.parse(await readJson(request))
  const { data: attempts } = await db().from('login_attempts').select('failed, locked_until').eq('email', email).maybeSingle()
  if (attempts?.locked_until && new Date(attempts.locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(attempts.locked_until).getTime() - Date.now()) / 60_000)
    throw new HttpError(429, `Too many attempts for this email — try again in ${minutes} min.`)
  }

  const { data: user, error } = await db().from('users').select('id, email, name, password_hash').eq('email', email).maybeSingle()
  if (error) throw error
  let ok = false
  let needsRehash = false
  if (user?.password_hash) ({ ok, needsRehash } = await verifyPassword(user.password_hash, password))
  else await burnPasswordCheck(password)

  if (!user || !ok) {
    const failed = (attempts?.failed ?? 0) + 1
    const lock = failed >= MAX_FAILED_LOGINS
    await db().from('login_attempts').upsert({
      email,
      failed: lock ? 0 : failed,
      locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    throw new HttpError(401, WRONG)
  }

  if (attempts) await db().from('login_attempts').delete().eq('email', email)
  if (needsRehash) await db().from('users').update({ password_hash: await hashPassword(password) }).eq('id', user.id)  // bcrypt → scrypt
  const response = json({ user: { id: user.id, email: String(user.email), name: user.name } })
  response.headers.append('set-cookie', await createSession(request, user.id))
  return response
})
