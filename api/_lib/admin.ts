import { timingSafeEqual } from 'node:crypto'
import { requireEnv } from './http.js'

// Server-key holders (seed/retag scripts) authenticate with the service-role key in x-admin-key. Never used by the UI.
export function isAdmin(request: Request): boolean {
  const header = request.headers.get('x-admin-key')
  if (!header) return false // ordinary requests never touch the server key
  const given = Buffer.from(header)
  const expected = Buffer.from(requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
  return given.length === expected.length && timingSafeEqual(given, expected)
}
