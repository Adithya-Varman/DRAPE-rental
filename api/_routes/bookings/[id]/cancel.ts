import { z } from 'zod'
import { todayInIndia } from '../../../../shared/booking.js'
import { requireUser } from '../../../_lib/auth.js'
import { BOOKING_COLUMNS, toBooking } from '../../../_lib/bookings.js'
import { HttpError, json, readJson, route } from '../../../_lib/http.js'
import { refundAdvance } from '../../../_lib/payments.js'
import { db } from '../../../_lib/supabase.js'

// POST /api/bookings/:id/cancel → the borrower cancels, or the owner declines, a confirmed booking that hasn't ended.
// Frees the dates (the no-overlap rule only counts confirmed bookings), refunds the advance, and notifies the other side.
export const POST = route(async (request) => {
  const user = await requireUser(request)
  const id = z.string().uuid().safeParse(new URL(request.url).pathname.split('/')[3])
  if (!id.success) throw new HttpError(404, 'Booking not found')
  await readJson(request).catch(() => ({}))

  const { data: booking, error } = await db().from('bookings')
    .select('id, status, end_date, advance, payment_ref, borrower_id, listing:listings!inner(owner_id)').eq('id', id.data).maybeSingle()
  if (error) throw error
  if (!booking) throw new HttpError(404, 'Booking not found')
  const ownerId = (booking.listing as unknown as { owner_id: string | null }).owner_id
  const role = booking.borrower_id === user.id ? 'borrower' : ownerId === user.id ? 'owner' : null
  if (!role) throw new HttpError(404, 'Booking not found')  // don't reveal other people's bookings
  if (booking.status !== 'confirmed') throw new HttpError(409, 'This booking is already cancelled.')
  if (booking.end_date < todayInIndia()) throw new HttpError(409, 'This booking has already finished.')

  await refundAdvance({ amount: booking.advance, paymentRef: booking.payment_ref })
  const { data: updated, error: updateError } = await db().from('bookings')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: role })
    .eq('id', booking.id).eq('status', 'confirmed').select(BOOKING_COLUMNS).maybeSingle()
  if (updateError) throw updateError
  if (!updated) throw new HttpError(409, 'This booking is already cancelled.')

  // Tell the other person.
  const notify = role === 'borrower' ? ownerId : booking.borrower_id
  if (notify) {
    await db().from('notifications').insert({ user_id: notify, type: role === 'borrower' ? 'booking_cancelled' : 'booking_declined', booking_id: booking.id })
  }
  return json({ booking: toBooking(updated) })
})
