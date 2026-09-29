import { HttpError, json, route } from '../../../_lib/http.js'
import { db } from '../../../_lib/supabase.js'
import { listingIdFrom } from './index.js'

// GET /api/listings/:id/contact → { owner_name, owner_contact } — only fetched when the user taps "Show contact".
export const GET = route(async (request) => {
  const id = listingIdFrom(request)
  const { data, error } = await db().from('listings').select('owner_name, owner_contact').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'Listing not found')
  return json(data)
})
