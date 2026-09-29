import { bookingRequestSchema, quote, validateDates, type BookingResponse } from '../../shared/booking.js'
import { BOOKING_COLUMNS, hashToken, newToken, toBooking } from '../_lib/bookings.js'
import { HttpError, json, readJson, route } from '../_lib/http.js'
import { chargeAdvance } from '../_lib/payments.js'
import { db } from '../_lib/supabase.js'

// POST /api/bookings → { booking, token }. Price, advance and dates are all recomputed and checked here; the
// database's exclusion constraint is the final word on double-booking.
export const POST = route(async (request) => {
  const input = bookingRequestSchema.parse(await readJson(request))
  const problem = validateDates(input.start_date, input.end_date)
  if (problem) throw new HttpError(400, problem)

  const { data: listing, error: listingError } = await db().from('listings').select('id, price_per_day').eq('id', input.listing_id).maybeSingle()
  if (listingError) throw listingError
  if (!listing) throw new HttpError(404, 'Listing not found')

  const { days, total, advance } = quote(listing.price_per_day, input.start_date, input.end_date)
  const payment = await chargeAdvance({ amount: advance, method: input.payment_method })
  const token = newToken()

  const { data, error } = await db().from('bookings').insert({
    listing_id: listing.id,
    borrower_name: input.borrower_name,
    borrower_contact: input.borrower_contact,
    start_date: input.start_date,
    end_date: input.end_date,
    days,
    price_per_day: listing.price_per_day,
    total,
    advance,
    payment_method: input.payment_method,
    payment_ref: payment.ref,
    access_token_hash: hashToken(token),
  }).select(BOOKING_COLUMNS).single()
  if (error?.code === '23P01') throw new HttpError(409, 'Someone just booked those dates — please pick different ones.')
  if (error) throw error

  const body: BookingResponse = { booking: toBooking(data), token }
  return json(body, 201)
})
