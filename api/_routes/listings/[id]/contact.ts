import { requireUser } from '../../../_lib/auth.js'
import { HttpError, json, route } from '../../../_lib/http.js'
import { LIMITS } from '../../../_lib/ratelimit.js'
import { db } from '../../../_lib/supabase.js'
import { listingIdFrom } from './index.js'

// GET /api/listings/:id/contact → { owner_name, owner_contact } — signed-in users only, rate-limited, so owner
// contacts can't be scraped in bulk.
export const GET = route(async (request) => {
  const user = await requireUser(request)
  await LIMITS.contact(user.id)
  const id = listingIdFrom(request)
  const { data, error } = await db().from('listings').select('owner_name, owner_contact').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'Listing not found')
  return json(data)
})
