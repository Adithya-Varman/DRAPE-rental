import { requireUser } from '../_lib/auth.js'
import { BOOKING_COLUMNS, toBooking } from '../_lib/bookings.js'
import { json, route } from '../_lib/http.js'
import { db } from '../_lib/supabase.js'

// GET /api/bookings/mine → { bookings[] } — everything the signed-in user has booked (powers My Rentals).
export const GET = route(async (request) => {
  const user = await requireUser(request)
  const { data, error } = await db().from('bookings').select(BOOKING_COLUMNS).eq('borrower_id', user.id).order('start_date')
  if (error) throw error
  return json({ bookings: (data ?? []).map(toBooking) })
})
