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
// 5 wrong passwords lock the account for 10 minutes. Unknown emails cost the same time as real ones.
export const POST = route(async (request) => {
  const { email, password } = body.parse(await readJson(request))
  const { data: user, error } = await db().from('users')
    .select('id, email, name, password_hash, failed_logins, locked_until').eq('email', email).maybeSingle()
  if (error) throw error
  if (!user) { await burnPasswordCheck(password); throw new HttpError(401, WRONG) }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new HttpError(429, `Too many wrong passwords — try again in ${Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60_000)} min.`)
  }
  if (!user.password_hash) throw new HttpError(401, 'This account uses Google — tap “Continue with Google”.')

  const { ok, needsRehash } = await verifyPassword(user.password_hash, password)
  if (!ok) {
    const failed = user.failed_logins + 1
    const lock = failed >= MAX_FAILED_LOGINS
    await db().from('users').update({
      failed_logins: lock ? 0 : failed,
      locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
    }).eq('id', user.id)
    throw new HttpError(401, WRONG)
  }
  await db().from('users').update({
    failed_logins: 0,
    locked_until: null,
    ...(needsRehash ? { password_hash: await hashPassword(password) } : {}),  // upgrade legacy bcrypt to scrypt
  }).eq('id', user.id)
  const response = json({ user: { id: user.id, email: String(user.email), name: user.name } })
  response.headers.append('set-cookie', await createSession(request, user.id))
  return response
})
