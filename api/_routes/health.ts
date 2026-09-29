import { json, route } from '../_lib/http.js'

export const GET = route(async () => json({
  ok: true,
  supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  gemini: Boolean(process.env.GEMINI_API_KEY),
}))
