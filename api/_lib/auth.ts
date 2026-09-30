// Accounts are ours (public.users); the signed-in user comes from the session cookie, looked up server-side on every
// request. The browser never tells the server who it is.
import { HttpError } from './http.js'
import { sessionUserId } from './sessions.js'
import { db } from './supabase.js'

export type User = { id: string; email: string; name: string }

export async function getUser(request: Request): Promise<User | null> {
  const id = await sessionUserId(request)
  if (!id) return null
  const { data } = await db().from('users').select('id, email, name').eq('id', id).maybeSingle()
  return data ? { id: data.id, email: String(data.email), name: data.name } : null
}

export async function requireUser(request: Request): Promise<User> {
  const user = await getUser(request)
  if (!user) throw new HttpError(401, 'Please sign in first.')
  return user
}
