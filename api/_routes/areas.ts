import { json, publicCache, route } from '../_lib/http.js'
import { listAreas } from '../_lib/supabase.js'

// GET /api/areas → { areas[] }
export const GET = route(async () => publicCache(json({ areas: await listAreas() }), 3600))
