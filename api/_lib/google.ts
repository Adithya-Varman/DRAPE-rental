// "Continue with Google" through Supabase Auth's Google provider. Supabase is only the Google broker: after the
// PKCE code exchange we copy the verified identity into OUR users table and start OUR session; the Supabase session is
// discarded. Google's client ID/secret live in the Supabase dashboard, never in this app.
import { createHash, randomBytes } from 'node:crypto'
import { requireEnv } from './http.js'

export const VERIFIER_COOKIE = 'drape_oauth_verifier'
const authUrl = () => `${requireEnv('SUPABASE_URL').replace(/\/$/, '')}/auth/v1`
const apikey = () => requireEnv('SUPABASE_SERVICE_ROLE_KEY')
export const callbackUrl = (request: Request) => `${new URL(request.url).origin}/api/auth/google/callback`

// Is the Google provider switched on in Supabase? Cached briefly so the sign-in page doesn't wait on it every time.
let cached: { at: number; enabled: boolean } | null = null
export async function googleEnabled(): Promise<boolean> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.enabled
  try {
    const settings = await fetch(`${authUrl()}/settings`, { headers: { apikey: apikey() }, signal: AbortSignal.timeout(4000) }).then((r) => r.json())
    cached = { at: Date.now(), enabled: Boolean(settings?.external?.google) }
  } catch {
    cached = { at: Date.now(), enabled: false }
  }
  return cached.enabled
}

// PKCE: the verifier stays in an httpOnly cookie in this browser; only its SHA-256 goes to Supabase. A callback that
// didn't start in this browser can't be exchanged, which also stops login-CSRF.
export function newVerifier() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function authorizeUrl(request: Request, challenge: string): string {
  const url = new URL(`${authUrl()}/authorize`)
  url.search = new URLSearchParams({
    provider: 'google',
    redirect_to: callbackUrl(request),
    code_challenge: challenge,
    code_challenge_method: 's256',
  }).toString()
  return url.toString()
}

export type GoogleIdentity = { sub: string; email: string; name: string }

export async function exchangeCode(code: string, verifier: string): Promise<GoogleIdentity> {
  const response = await fetch(`${authUrl()}/token?grant_type=pkce`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: apikey() },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    signal: AbortSignal.timeout(8000),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.user) throw new Error(`Supabase code exchange failed: ${data.error_description ?? data.msg ?? response.status}`)
  const user = data.user
  const identity = (user.identities ?? []).find((i: { provider: string }) => i.provider === 'google')
  if (!identity) throw new Error('Not a Google sign-in')
  if (!user.email || !user.email_confirmed_at) throw new Error('Google email not verified')
  const meta = user.user_metadata ?? {}
  return {
    sub: String(identity.identity_data?.sub ?? identity.id),
    email: String(user.email).toLowerCase(),
    name: String(meta.full_name ?? meta.name ?? user.email.split('@')[0]).slice(0, 80),
  }
}
