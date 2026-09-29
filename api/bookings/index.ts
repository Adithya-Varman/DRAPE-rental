import { bookingRequestSchema } from '../../shared/booking-schema.js'
import { quote, validateDates, type BookingResponse } from '../../shared/booking.js'
import { requireUser } from '../_lib/auth.js'
import { BOOKING_COLUMNS, toBooking } from '../_lib/bookings.js'
import { HttpError, json, readJson, route } from '../_lib/http.js'
import { chargeAdvance } from '../_lib/payments.js'
import { db } from '../_lib/supabase.js'

// POST /api/bookings (signed in) → { booking }. Price, advance and dates are all recomputed and checked here; the
// database's exclusion constraint is the final word on double-booking.
export const POST = route(async (request) => {
  const user = await requireUser(request)
  const input = bookingRequestSchema.parse(await readJson(request))
  const problem = validateDates(input.start_date, input.end_date)
  if (problem) throw new HttpError(400, problem)

  const { data: listing, error: listingError } = await db().from('listings').select('id, price_per_day, owner_id').eq('id', input.listing_id).maybeSingle()
  if (listingError) throw listingError
  if (!listing) throw new HttpError(404, 'Listing not found')
  if (listing.owner_id === user.id) throw new HttpError(400, 'This is your own listing.')

  const { days, total, advance } = quote(listing.price_per_day, input.start_date, input.end_date)
  const payment = await chargeAdvance({ amount: advance, method: input.payment_method })

  const { data, error } = await db().from('bookings').insert({
    listing_id: listing.id,
    borrower_id: user.id,
    borrower_name: user.name,
    borrower_contact: input.borrower_contact,
    start_date: input.start_date,
    end_date: input.end_date,
    days,
    price_per_day: listing.price_per_day,
    total,
    advance,
    payment_method: input.payment_method,
    payment_ref: payment.ref,
  }).select(BOOKING_COLUMNS).single()
  if (error?.code === '23P01') throw new HttpError(409, 'Someone just booked those dates — please pick different ones.')
  if (error) throw error

  // The owner's notification is created by a database trigger in the same transaction as this insert.
  const body: BookingResponse = { booking: toBooking(data) }
  return json(body, 201)
})
