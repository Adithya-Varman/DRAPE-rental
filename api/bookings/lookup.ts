import { bookingLookupSchema } from '../../shared/booking.js'
import { BOOKING_COLUMNS, hashToken, toBooking } from '../_lib/bookings.js'
import { json, readJson, route } from '../_lib/http.js'
import { db } from '../_lib/supabase.js'

// POST /api/bookings/lookup { bookings: [{ id, token }] } → { bookings[] }. There are no accounts in v0, so a booking
// is shown only to a browser holding its token (saved when it was made). Unknown ids or wrong tokens are skipped.
export const POST = route(async (request) => {
  const { bookings: keys } = bookingLookupSchema.parse(await readJson(request))
  if (keys.length === 0) return json({ bookings: [] })
  const { data, error } = await db().from('bookings').select(BOOKING_COLUMNS).in('id', keys.map((k) => k.id)).order('start_date')
  if (error) throw error
  // The same id may appear more than once (e.g. a stale token and a fresh one); any matching token grants access.
  const offered = new Map<string, Set<string>>()
  for (const k of keys) offered.set(k.id, (offered.get(k.id) ?? new Set()).add(hashToken(k.token)))
  return json({ bookings: (data ?? []).filter((row) => offered.get(row.id)?.has(row.access_token_hash)).map(toBooking) })
})
