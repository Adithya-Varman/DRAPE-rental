import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, overlaps, quote, todayInIndia, validateDates } from '../shared/booking.js'
import { fakeDb } from './fake-db.js'

describe('booking rules (shared by UI and server)', () => {
  it('counts pickup and return days and takes a 20% advance, min ₹50', () => {
    expect(quote(400, '2026-10-10', '2026-10-12')).toEqual({ days: 3, total: 1200, advance: 240, due_at_pickup: 960 })
    expect(quote(150, '2026-10-10', '2026-10-10')).toEqual({ days: 1, total: 150, advance: 50, due_at_pickup: 100 })
    expect(quote(40, '2026-10-10', '2026-10-10').advance).toBe(40) // never more than the total
  })
  it('uses India time for "today"', () => {
    expect(todayInIndia(new Date('2026-09-29T20:00:00Z'))).toBe('2026-09-30') // 01:30 IST next day
  })
  it('validates dates', () => {
    const today = '2026-09-30'
    expect(validateDates('2026-10-01', '2026-10-03', today)).toBeNull()
    expect(validateDates('2026-09-29', '2026-10-01', today)).toMatch(/past/)
    expect(validateDates('2026-10-05', '2026-10-04', today)).toMatch(/after pickup/)
    expect(validateDates('2026-10-01', '2026-10-15', today)).toMatch(/14 days/)
    expect(validateDates(addDays(today, 91), addDays(today, 91), today)).toMatch(/90 days/)
    expect(validateDates('2026-11-31', '2026-12-01', today)).toMatch(/exist/)
  })
  it('treats touching dates as overlapping and adjacent ones as free', () => {
    const a = { start_date: '2026-10-10', end_date: '2026-10-12' }
    expect(overlaps(a, { start_date: '2026-10-12', end_date: '2026-10-13' })).toBe(true)
    expect(overlaps(a, { start_date: '2026-10-13', end_date: '2026-10-14' })).toBe(false)
  })
})

let fake = fakeDb()
let listingRow: unknown = { id: 'l1', price_per_day: 400, owner_id: 'owner-1' }
let currentUser: { id: string; email: string; name: string } | null = { id: 'user-1', email: 'asha@drape.demo', name: 'Asha' }
vi.mock('../api/_lib/auth', async () => {
  const { HttpError } = await import('../api/_lib/http')
  return {
    getUser: async () => currentUser,
    requireUser: async () => { if (!currentUser) throw new HttpError(401, 'Please sign in first.'); return currentUser },
  }
})
vi.mock('../api/_lib/supabase', async (orig) => ({
  ...(await orig<typeof import('../api/_lib/supabase')>()),
  db: () => Object.assign(fake.client, { from: (table: string) => { fake.calls.push(['from', table]); if (table === 'listings') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: listingRow, error: null }) }) }) }; return fake.client } }),
}))
const { POST: book } = await import('../api/bookings/index.js')
const { GET: mine } = await import('../api/bookings/mine.js')
const { GET: notifications } = await import('../api/notifications/index.js')
const { POST: markRead } = await import('../api/notifications/read.js')
const { POST: createListing } = await import('../api/listings/index.js')

const LISTING = '6f1c2a4e-9b1d-4c3e-8f7a-1234567890ab'
const start = addDays(todayInIndia(), 5)
const body = { listing_id: LISTING, start_date: start, end_date: addDays(start, 2), borrower_contact: 'asha@drape.demo', payment_method: 'upi' }
const post = (fn: (r: Request) => Promise<Response>, data: unknown) => fn(new Request('http://x/', { method: 'POST', body: JSON.stringify(data) }))

beforeEach(() => { fake = fakeDb(); listingRow = { id: 'l1', price_per_day: 400, owner_id: 'owner-1' }; currentUser = { id: 'user-1', email: 'asha@drape.demo', name: 'Asha' } })

describe('POST /api/bookings', () => {
  it('recomputes price and advance on the server and takes the borrower from the account', async () => {
    fake.result = { data: { id: 'b1', listing: {} }, error: null }
    const res = await post(book, { ...body, total: 1, advance: 1, price_per_day: 1, borrower_id: 'someone-else', borrower_name: 'Fake' })
    expect(res.status).toBe(201)
    const insert = fake.calls.find(([m]) => m === 'insert')![1] as Record<string, unknown>
    expect(insert).toMatchObject({ days: 3, price_per_day: 400, total: 1200, advance: 240, borrower_id: 'user-1', borrower_name: 'Asha' })
    expect(String(insert.payment_ref)).toMatch(/^MOCK-UPI-/)
  })
  it('requires sign-in', async () => {
    currentUser = null
    expect((await post(book, body)).status).toBe(401)
    expect(fake.calls).toHaveLength(0)
  })
  it('does not let owners book their own piece', async () => {
    listingRow = { id: 'l1', price_per_day: 400, owner_id: 'user-1' }
    const res = await post(book, body)
    expect(res.status).toBe(400)
    expect(fake.calls.some(([m]) => m === 'insert')).toBe(false)
  })
  it('turns the database overlap guard into a friendly 409', async () => {
    fake.result = { data: null, error: { code: '23P01', message: 'conflicting key value violates exclusion constraint' } }
    const res = await post(book, body)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/just booked/)
  })
  it('rejects bad dates before touching the database', async () => {
    expect((await post(book, { ...body, start_date: '2020-01-01', end_date: '2020-01-02' })).status).toBe(400)
    expect(fake.calls).toHaveLength(0)
  })
  it('404s for unknown listings', async () => {
    listingRow = null
    expect((await post(book, body)).status).toBe(404)
  })
})

describe('account-scoped routes', () => {
  const get = (fn: (r: Request) => Promise<Response>) => fn(new Request('http://x/'))
  it('401 when signed out', async () => {
    currentUser = null
    for (const res of [await get(mine), await get(notifications), await post(markRead, {}), await post(createListing, {})]) expect(res.status).toBe(401)
  })
  it('scopes My Rentals to the signed-in borrower', async () => {
    fake.result = { data: [], error: null }
    await get(mine)
    expect(fake.calls).toContainEqual(['eq', 'borrower_id', 'user-1'])
  })
  it('scopes notifications to the signed-in user and counts unread', async () => {
    fake.result = { data: [{ id: 'n1', read_at: null }, { id: 'n2', read_at: '2026-10-01' }], error: null }
    const res = await get(notifications)
    expect(fake.calls).toContainEqual(['eq', 'user_id', 'user-1'])
    expect((await res.json()).unread).toBe(1)
  })
})
