import { json, route } from '../../_lib/http.js'
import { destroySession } from '../../_lib/sessions.js'

// POST /api/auth/logout → deletes the session row and clears the cookie.
export const POST = route(async (request) => {
  const response = json({ ok: true })
  response.headers.append('set-cookie', await destroySession(request))
  return response
})
