import { z } from 'zod'
import { HttpError, json, readJson, route } from '../../_lib/http.js'
import { hashPassword, MIN_PASSWORD_LENGTH } from '../../_lib/passwords.js'
import { clientIp, LIMITS } from '../../_lib/ratelimit.js'
import { createSession } from '../../_lib/sessions.js'
import { db } from '../../_lib/supabase.js'

const body = z.object({
  name: z.string().trim().min(1, 'Add your name').max(80),
  email: z.string().trim().toLowerCase().email('That doesn’t look like an email address').max(200),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Passwords need at least ${MIN_PASSWORD_LENGTH} characters`).max(200),
})

// POST /api/auth/signup { name, email, password } → { user } + session cookie
export const POST = route(async (request) => {
  await LIMITS.signup(clientIp(request))
  const input = body.parse(await readJson(request))
  const { data, error } = await db().from('users')
    .insert({ name: input.name, email: input.email, password_hash: await hashPassword(input.password) })
    .select('id, email, name').single()
  if (error?.code === '23505') throw new HttpError(409, 'That email already has an account — sign in instead.')
  if (error) throw error
  const response = json({ user: { id: data.id, email: String(data.email), name: data.name } }, 201)
  response.headers.append('set-cookie', await createSession(request, data.id))
  return response
})
