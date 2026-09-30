// Cookie sessions. The browser holds a random token in an httpOnly cookie; the database stores only its SHA-256.
import { createHash, randomBytes } from 'node:crypto'
import { db } from './supabase.js'

export const SESSION_COOKIE = 'drape_session'
const SESSION_DAYS = 30

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return null
}

// Secure cookies everywhere except plain-http localhost during development.
const isLocalHttp = (request: Request) => new URL(request.url).protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(new URL(request.url).hostname)

export function cookie(request: Request, name: string, value: string, maxAgeSeconds: number, path = '/'): string {
  return [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `Max-Age=${maxAgeSeconds}`, 'HttpOnly', 'SameSite=Lax', ...(isLocalHttp(request) ? [] : ['Secure'])].join('; ')
}

export async function createSession(request: Request, userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  const { error } = await db().from('sessions').insert({ token_hash: hashToken(token), user_id: userId, expires_at: expires.toISOString() })
  if (error) throw error
  // Opportunistic cleanup of this user's expired sessions.
  await db().from('sessions').delete().eq('user_id', userId).lt('expires_at', new Date().toISOString())
  return cookie(request, SESSION_COOKIE, token, SESSION_DAYS * 86_400)
}

export async function destroySession(request: Request): Promise<string> {
  const token = readCookie(request, SESSION_COOKIE)
  if (token) await db().from('sessions').delete().eq('token_hash', hashToken(token))
  return cookie(request, SESSION_COOKIE, '', 0)
}

export async function sessionUserId(request: Request): Promise<string | null> {
  const token = readCookie(request, SESSION_COOKIE)
  if (!token) return null
  const { data, error } = await db().from('sessions').select('user_id, expires_at').eq('token_hash', hashToken(token)).maybeSingle()
  if (error || !data || new Date(data.expires_at) <= new Date()) return null
  return data.user_id
}
