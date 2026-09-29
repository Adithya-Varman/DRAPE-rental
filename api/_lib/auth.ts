// Accounts are Supabase Auth. The browser sends its access token as "Authorization: Bearer …"; the server verifies it
// with Supabase on every request (no trust in client-supplied user ids).
import { HttpError } from './http.js'
import { db } from './supabase.js'

export type User = { id: string; email: string; name: string }

export async function getUser(request: Request): Promise<User | null> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return null
  const { data, error } = await db().auth.getUser(token)
  if (error || !data.user) return null
  const { data: profile } = await db().from('profiles').select('name').eq('id', data.user.id).maybeSingle()
  return { id: data.user.id, email: data.user.email ?? '', name: profile?.name ?? data.user.email?.split('@')[0] ?? 'Member' }
}

export async function requireUser(request: Request): Promise<User> {
  const user = await getUser(request)
  if (!user) throw new HttpError(401, 'Please sign in first.')
  return user
}
