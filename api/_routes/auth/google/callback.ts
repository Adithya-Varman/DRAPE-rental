import { exchangeCode, VERIFIER_COOKIE } from '../../../_lib/google.js'
import { route } from '../../../_lib/http.js'
import { cookie, createSession, readCookie } from '../../../_lib/sessions.js'
import { db } from '../../../_lib/supabase.js'

const home = (request: Request, query: string, cookies: string[]) => {
  const headers = new Headers({ location: new URL(`/?${query}`, request.url).toString() })
  for (const c of cookies) headers.append('set-cookie', c)
  return new Response(null, { status: 302, headers })
}

// GET /api/auth/google/callback?code → PKCE exchange with Supabase, then link/create OUR user and start OUR session.
export const GET = route(async (request) => {
  const url = new URL(request.url)
  const clear = cookie(request, VERIFIER_COOKIE, '', 0, '/api/auth')
  const code = url.searchParams.get('code')
  const verifier = readCookie(request, VERIFIER_COOKIE)
  if (!code || !verifier) return home(request, 'auth_error=google_failed', [clear])

  let identity
  try { identity = await exchangeCode(code, verifier) } catch (error) {
    console.error(error)
    const unverified = /not verified/i.test(String((error as Error).message))
    return home(request, `auth_error=${unverified ? 'google_unverified' : 'google_failed'}`, [clear])
  }

  // Same Google account → same user. Otherwise link to an existing account with that verified email, or create one.
  let { data: user } = await db().from('users').select('id').eq('google_sub', identity.sub).maybeSingle()
  if (!user) {
    const { data: byEmail } = await db().from('users').select('id').eq('email', identity.email).maybeSingle()
    if (byEmail) {
      await db().from('users').update({ google_sub: identity.sub }).eq('id', byEmail.id)
      user = byEmail
    } else {
      const { data: created, error } = await db().from('users')
        .insert({ email: identity.email, name: identity.name, google_sub: identity.sub }).select('id').single()
      if (error) throw error
      user = created
    }
  }
  return home(request, 'signed_in=google', [clear, await createSession(request, user.id)])
})
