import type { Booking } from '../../shared/booking.js'

export const BOOKING_COLUMNS =
  'id, listing_id, start_date, end_date, days, price_per_day, total, advance, status, payment_ref, borrower_name, borrower_contact, cancelled_at, cancelled_by, listing:listings(title, image_url, area, owner_name, owner_contact)'

export const toBooking = (row: Record<string, unknown>) => row as unknown as Booking
