import { googleEnabled } from '../../_lib/google.js'
import { json, route } from '../../_lib/http.js'

// GET /api/auth/providers → which sign-in options to show (Google only once it's enabled in Supabase).
export const GET = route(async () => json({ password: true, google: await googleEnabled() }))
