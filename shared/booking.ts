// Booking rules shared by the UI (to show the quote) and the server (which recomputes it — never trusts the client).
// Kept free of zod so the browser bundle stays small; the request schema lives in shared/booking-schema.ts.

export const MAX_BOOKING_DAYS = 14
export const MAX_DAYS_AHEAD = 90
export const ADVANCE_RATE = 0.2
export const MIN_ADVANCE = 50

export type BookingRequest = {
  listing_id: string
  start_date: string
  end_date: string
  borrower_contact: string
  payment_method: 'upi' | 'card'
}

export type Booking = {
  id: string
  listing_id: string
  start_date: string
  end_date: string
  days: number
  price_per_day: number
  total: number
  advance: number
  status: 'confirmed' | 'cancelled'
  payment_ref: string
  borrower_name?: string
  borrower_contact?: string
  cancelled_at?: string | null
  cancelled_by?: 'borrower' | 'owner' | null
  listing: { title: string; image_url: string; area: string; owner_name: string; owner_contact: string }
}
export type BookingResponse = { booking: Booking }

// Calendar dates are plain YYYY-MM-DD in India time — no time-of-day, so no timezone drift.
export function todayInIndia(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now)
}

const toUtc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
export const daysBetween = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / 86_400_000)
export const addDays = (iso: string, n: number) => new Date(toUtc(iso) + n * 86_400_000).toISOString().slice(0, 10)

// Pickup and return days both count: picking up on the 10th and returning on the 12th is 3 days.
export function quote(pricePerDay: number, startDate: string, endDate: string) {
  const days = daysBetween(startDate, endDate) + 1
  const total = days * pricePerDay
  const advance = Math.min(total, Math.max(MIN_ADVANCE, Math.round(total * ADVANCE_RATE)))
  return { days, total, advance, due_at_pickup: total - advance }
}

// Returns a human-readable problem, or null if the dates are bookable (overlaps are checked by the database).
export function validateDates(startDate: string, endDate: string, today = todayInIndia()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return 'Pick a pickup and a return date.'
  if (Number.isNaN(toUtc(startDate)) || addDays(startDate, 0) !== startDate || addDays(endDate, 0) !== endDate) return 'That date doesn’t exist.'
  if (startDate < today) return 'Pickup can’t be in the past.'
  if (daysBetween(today, startDate) > MAX_DAYS_AHEAD) return `You can book up to ${MAX_DAYS_AHEAD} days ahead.`
  if (endDate < startDate) return 'Return must be on or after pickup.'
  if (daysBetween(startDate, endDate) + 1 > MAX_BOOKING_DAYS) return `Bookings can be at most ${MAX_BOOKING_DAYS} days.`
  return null
}

export const overlaps = (a: { start_date: string; end_date: string }, b: { start_date: string; end_date: string }) =>
  a.start_date <= b.end_date && b.start_date <= a.end_date
