import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from './fake-db'

let fake = fakeDb()
vi.mock('../api/_lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/_lib/supabase')>()
  return { ...actual, db: () => fake.client }
})

const { GET: listListings } = await import('../api/_routes/listings/index')
const { GET: getListing } = await import('../api/_routes/listings/[id]/index')
const { GET: getContact } = await import('../api/_routes/listings/[id]/contact')
const { PUBLIC_LISTING_COLUMNS } = await import('../api/_lib/supabase')

const ID = '6f1c2a4e-9b1d-4c3e-8f7a-1234567890ab'
beforeEach(() => { fake = fakeDb() })

describe('GET /api/listings', () => {
  it('never selects owner_contact or embedding', () => {
    expect(PUBLIC_LISTING_COLUMNS).not.toMatch(/owner_contact|embedding|location/)
  })
  it('filters by occasion and honours limit', async () => {
    fake.result = { data: [{ id: ID }], error: null }
    const res = await listListings(new Request('http://x/api/listings?occasion=wedding&limit=4'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ listings: [{ id: ID }], total: 1 })
    expect(fake.calls).toContainEqual(['contains', 'occasions', ['wedding']])
    expect(fake.calls).toContainEqual(['range', 0, 3])
  })
  it('is cacheable at the CDN for a short while', async () => {
    const res = await listListings(new Request('http://x/api/listings'))
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=30/)
  })
  it('pages with offset', async () => {
    await listListings(new Request('http://x/api/listings?limit=24&offset=24'))
    expect(fake.calls).toContainEqual(['range', 24, 47])
  })
  it('defaults limit to 8 with no occasion filter', async () => {
    await listListings(new Request('http://x/api/listings'))
    expect(fake.calls).toContainEqual(['range', 0, 7])
    expect(fake.calls.some(([m]) => m === 'contains')).toBe(false)
  })
  it('rejects occasions outside the vocabulary', async () => {
    const res = await listListings(new Request('http://x/api/listings?occasion=brunch'))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/listings/:id and /contact', () => {
  it('404s for non-uuid ids without touching the database', async () => {
    const res = await getListing(new Request('http://x/api/listings/not-a-uuid'))
    expect(res.status).toBe(404)
    expect(fake.calls).toHaveLength(0)
  })
  it('404s when the listing does not exist', async () => {
    fake.result = { data: null, error: null }
    expect((await getListing(new Request(`http://x/api/listings/${ID}`))).status).toBe(404)
  })
  it('returns the contact only from the contact route', async () => {
    fake.result = { data: { owner_name: 'Priya', owner_contact: '98400 00000' }, error: null }
    const res = await getContact(new Request(`http://x/api/listings/${ID}/contact`))
    expect(await res.json()).toEqual({ owner_name: 'Priya', owner_contact: '98400 00000' })
    expect(fake.calls).toContainEqual(['eq', 'id', ID])
  })
})
