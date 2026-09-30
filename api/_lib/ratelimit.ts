// Fixed-window rate limits stored in Postgres (hit_rate_limit), so they hold across serverless instances.
// Fails open: if the limiter itself errors, the request goes through rather than breaking the app.
import { HttpError } from './http.js'
import { db } from './supabase.js'

export function clientIp(request: Request): string {
  return (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown'
}

export async function enforceLimit(key: string, windowSeconds: number, max: number): Promise<void> {
  const { data, error } = await db().rpc('hit_rate_limit', { p_key: key, p_window_seconds: windowSeconds, p_max: max })
  if (error) { console.warn('rate limiter unavailable:', error.message); return }
  if (data === false) {
    const err = new HttpError(429, `You're going a bit fast — try again in ${windowSeconds >= 3600 ? `${Math.round(windowSeconds / 3600)} h` : `${Math.round(windowSeconds / 60) || 1} min`}.`) as HttpError & { retryAfterSeconds?: number }
    err.retryAfterSeconds = windowSeconds
    throw err
  }
}

// One place to see and tune every limit.
export const LIMITS = {
  search: (ip: string) => enforceLimit(`search:${ip}`, 60, 30),
  reasons: (ip: string) => enforceLimit(`reasons:${ip}`, 60, 30),
  signup: (ip: string) => enforceLimit(`signup:${ip}`, 3600, 10),
  login: (ip: string) => enforceLimit(`login:${ip}`, 600, 30),
  analyze: (userId: string) => enforceLimit(`analyze:${userId}`, 3600, 20),
  contact: (userId: string) => enforceLimit(`contact:${userId}`, 3600, 40),
  booking: (userId: string) => enforceLimit(`booking:${userId}`, 3600, 20),
}
