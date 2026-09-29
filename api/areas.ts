import { json, route } from './_lib/http.js'
import { listAreas } from './_lib/supabase.js'

// GET /api/areas → { areas[] }
export const GET = route(async () => json({ areas: await listAreas() }))
