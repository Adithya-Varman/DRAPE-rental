// Server-side validation for booking requests (kept separate so the browser doesn't bundle zod).
import { z } from 'zod'
import type { BookingRequest } from './booking.js'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const bookingRequestSchema: z.ZodType<BookingRequest> = z.object({
  listing_id: z.string().uuid(),
  start_date: isoDate,
  end_date: isoDate,
  borrower_contact: z.string().trim().min(3).max(120),
  payment_method: z.enum(['upi', 'card']),
})
