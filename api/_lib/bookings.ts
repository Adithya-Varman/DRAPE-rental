import { createHash, randomBytes } from 'node:crypto'
import type { Booking } from '../../shared/booking.js'

export const BOOKING_COLUMNS =
  'id, listing_id, start_date, end_date, days, price_per_day, total, advance, status, payment_ref, access_token_hash, listing:listings(title, image_url, area, owner_name, owner_contact)'

export const newToken = () => randomBytes(24).toString('base64url')
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

// Strip the hash before anything leaves the server.
export function toBooking(row: Record<string, unknown>): Booking {
  const { access_token_hash: _, ...booking } = row
  return booking as unknown as Booking
}
