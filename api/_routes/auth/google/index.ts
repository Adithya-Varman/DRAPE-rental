import { authorizeUrl, googleEnabled, newVerifier, VERIFIER_COOKIE } from '../../../_lib/google.js'
import { route } from '../../../_lib/http.js'
import { cookie } from '../../../_lib/sessions.js'

// GET /api/auth/google → 302 to Supabase's Google sign-in, with a PKCE challenge; the verifier stays in a cookie here.
export const GET = route(async (request) => {
  if (!(await googleEnabled())) return Response.redirect(new URL('/?auth_error=google_unavailable', request.url), 302)
  const { verifier, challenge } = newVerifier()
  return new Response(null, { status: 302, headers: { location: authorizeUrl(request, challenge), 'set-cookie': cookie(request, VERIFIER_COOKIE, verifier, 600, '/api/auth') } })
})
