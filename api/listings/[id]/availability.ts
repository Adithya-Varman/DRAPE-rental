import { todayInIndia } from '../../../shared/booking.js'
import { json, route } from '../../_lib/http.js'
import { db } from '../../_lib/supabase.js'
import { listingIdFrom } from './index.js'

// GET /api/listings/:id/availability → { booked: [{ start_date, end_date }] } — upcoming confirmed bookings only,
// with no borrower details.
export const GET = route(async (request) => {
  const id = listingIdFrom(request)
  const { data, error } = await db().from('bookings').select('start_date, end_date')
    .eq('listing_id', id).eq('status', 'confirmed').gte('end_date', todayInIndia()).order('start_date')
  if (error) throw error
  return json({ booked: data ?? [] })
})
