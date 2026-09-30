import { z } from 'zod'
import { HttpError, json, publicCache, route } from '../../../_lib/http.js'
import { db, PUBLIC_LISTING_COLUMNS } from '../../../_lib/supabase.js'

export function listingIdFrom(request: Request): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean) // ['api','listings',id,...]
  const parsed = z.string().uuid().safeParse(segments[2])
  if (!parsed.success) throw new HttpError(404, 'Listing not found')
  return parsed.data
}

// GET /api/listings/:id → { listing } (public fields only)
export const GET = route(async (request) => {
  const id = listingIdFrom(request)
  const { data, error } = await db().from('listings').select(PUBLIC_LISTING_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'Listing not found')
  return publicCache(json({ listing: data }), 60)
})
