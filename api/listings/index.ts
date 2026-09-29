import { z } from 'zod'
import { occasionSchema } from '../../shared/contracts.js'
import { json, route } from '../_lib/http.js'
import { db, PUBLIC_LISTING_COLUMNS } from '../_lib/supabase.js'

const listQuery = z.object({
  occasion: occasionSchema.optional(),
  limit: z.coerce.number().int().min(1).max(48).default(8),
})

// GET /api/listings?occasion=wedding&limit=8 → { listings[] } (templates grid, nearby row, explore)
export const GET = route(async (request) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const { occasion, limit } = listQuery.parse(params)
  let query = db().from('listings').select(PUBLIC_LISTING_COLUMNS).order('created_at', { ascending: false }).limit(limit)
  if (occasion) query = query.contains('occasions', [occasion])
  const { data, error } = await query
  if (error) throw error
  return json({ listings: data })
})
