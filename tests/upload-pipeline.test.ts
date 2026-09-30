import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../api/_lib/ratelimit', () => ({ clientIp: () => 'test-ip', enforceLimit: async () => {}, LIMITS: new Proxy({}, { get: () => async () => {} }) }))
import { fakeDb } from './fake-db.js'

process.env.SUPABASE_URL = 'https://proj.supabase.co'
const OWN_URL = 'https://proj.supabase.co/storage/v1/object/public/listings/2026-09-29/a.jpeg'

let fake = fakeDb()
const storage = { upload: vi.fn(), remove: vi.fn() }
vi.mock('../api/_lib/supabase', async (orig) => {
  const actual = await orig<typeof import('../api/_lib/supabase')>()
  const client = () => Object.assign(fake.client, {
    storage: { from: () => ({ upload: storage.upload, remove: storage.remove, getPublicUrl: (p: string) => ({ data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/listings/${p}` } }) }) },
  })
  return { ...actual, db: client, getArea: async (name: string) => { if (name !== 'Adyar') throw new (await import('../api/_lib/http')).HttpError(400, `Unknown area: ${name}`); return { name, lat: 13.0012, lng: 80.2565 } } }
})
vi.mock('../api/_lib/auth', () => ({ requireUser: async () => ({ id: 'owner-1', email: 'o@drape.demo', name: 'Owner' }), getUser: async () => null }))
const vision = vi.fn()
vi.mock('../api/_lib/vision', async (orig) => ({ ...(await orig<typeof import('../api/_lib/vision')>()), analyzeImage: (...a: unknown[]) => vision(...a) }))
vi.mock('../api/_lib/gemini', async (orig) => ({ ...(await orig<typeof import('../api/_lib/gemini')>()), embed: async () => Array(768).fill(0.1) }))

const { sniffImage, isOwnImageUrl } = await import('../api/_lib/images')
const { normalizeVision, embeddingText } = await import('../api/_lib/vision')
const { POST: analyze } = await import('../api/_routes/listings/analyze')
const { POST: create } = await import('../api/_routes/listings/index')

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
const draft = {
  title: 'Purple silk saree with gold zari border', category: 'saree', gender: 'women', occasions: ['wedding', 'festival'],
  style_tags: ['silk', 'zari'], colors: ['purple', 'gold'], formality: 4,
  description: 'Rich silk saree for weddings. Too heavy for casual outings.',
}
const upload = (bytes: Uint8Array = JPEG) => {
  const form = new FormData()
  form.append('image', new Blob([bytes as BlobPart]), 'photo.jpg')
  return analyze(new Request('http://x/api/listings/analyze', { method: 'POST', body: form }))
}
const post = (body: unknown) => create(new Request('http://x/api/listings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

beforeEach(() => {
  fake = fakeDb()
  storage.upload.mockReset().mockResolvedValue({ error: null })
  storage.remove.mockReset().mockResolvedValue({ error: null })
  vision.mockReset()
})

describe('image intake', () => {
  it('sniffs real image types from magic bytes', () => {
    expect(sniffImage(JPEG)?.mime).toBe('image/jpeg')
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe('png')
    expect(sniffImage(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))?.ext).toBe('webp')
    expect(sniffImage(new TextEncoder().encode('\0\0\0\x18ftypheic....'))?.ext).toBe('heic')
    expect(sniffImage(new TextEncoder().encode('<html>not an image'))).toBeNull()
  })
  it('only accepts image URLs from our own bucket', () => {
    expect(isOwnImageUrl(OWN_URL)).toBe(true)
    expect(isOwnImageUrl('https://evil.example.com/listings/a.jpeg')).toBe(false)
    expect(isOwnImageUrl('https://proj.supabase.co/storage/v1/object/public/listings/../other/a.jpeg')).toBe(false)
  })
})

describe('vision output handling', () => {
  it('normalizes duplicate / mixed-case tags and clamps formality', () => {
    const out = normalizeVision({ is_clothing: true, ...draft, style_tags: ['Silk', 'silk ', 'Zari'], colors: ['Purple', 'purple'], formality: 7 }) as typeof draft
    expect(out.style_tags).toEqual(['silk', 'zari'])
    expect(out.colors).toEqual(['purple'])
    expect(out.formality).toBe(5)
  })
  it('strips everything but the verdict for non-clothing', () => {
    expect(normalizeVision({ is_clothing: false, title: 'A plate of food' })).toEqual({ is_clothing: false })
  })
  it('builds embedding text from semantics only — no size or price', () => {
    const text = embeddingText({ ...draft, category: 'saree', occasions: ['wedding', 'festival'] } as never)
    expect(text).toContain('Purple silk saree')
    expect(text).toContain('occasions: wedding, festival')
    expect(text).toContain('Too heavy for casual outings')
    expect(text).not.toMatch(/₹|price|size/i)
  })
})

describe('POST /api/listings/analyze', () => {
  it('returns the stored image URL and the draft', async () => {
    vision.mockResolvedValue({ is_clothing: true, ...draft })
    const res = await upload()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.image_url).toMatch(/^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/public\/listings\/.+\.jpeg$/)
    expect(body.draft).toEqual(draft)
  })
  it('rejects non-clothing with 422 and deletes the uploaded photo', async () => {
    vision.mockResolvedValue({ is_clothing: false })
    const res = await upload()
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'not_clothing' })
    expect(storage.remove).toHaveBeenCalledOnce()
  })
  it('keeps the photo and signals manual tagging when the model fails', async () => {
    vision.mockRejectedValue(new Error('bad json twice'))
    const res = await upload()
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toBe('analysis_failed')
    expect(body.image_url).toBeTruthy()
    expect(storage.remove).not.toHaveBeenCalled()
  })
  it('rejects files that are not images without calling the model', async () => {
    const res = await upload(new TextEncoder().encode('just text'))
    expect(res.status).toBe(415)
    expect(vision).not.toHaveBeenCalled()
  })
})

describe('POST /api/listings', () => {
  const valid = { ...draft, image_url: OWN_URL, size: 'FREE', price_per_day: 650, area: 'Adyar', owner_name: 'Priya', owner_contact: '98400 00000' }
  it('inserts with server-computed location (lng lat order) and a 768-d embedding', async () => {
    fake.result = { data: { id: 'new' }, error: null }
    const res = await post(valid)
    expect(res.status).toBe(201)
    const insert = fake.calls.find(([m]) => m === 'insert')![1] as Record<string, unknown>
    expect(insert.location).toBe('SRID=4326;POINT(80.2565 13.0012)')
    expect(JSON.parse(insert.embedding as string)).toHaveLength(768)
    expect(insert.owner_contact).toBe('98400 00000')
    expect(insert.owner_id).toBe('owner-1')
  })
  it('ignores client-supplied embedding/location fields', async () => {
    fake.result = { data: { id: 'new' }, error: null }
    await post({ ...valid, location: 'SRID=4326;POINT(0 0)', embedding: '[1]' })
    const insert = fake.calls.find(([m]) => m === 'insert')![1] as Record<string, unknown>
    expect(insert.location).toBe('SRID=4326;POINT(80.2565 13.0012)')
    expect(JSON.parse(insert.embedding as string)).toHaveLength(768)
  })
  it('rejects foreign image URLs, unknown areas and invalid prices', async () => {
    expect((await post({ ...valid, image_url: 'https://evil.example.com/a.jpg' })).status).toBe(400)
    expect((await post({ ...valid, area: 'Mumbai' })).status).toBe(400)
    expect((await post({ ...valid, price_per_day: -5 })).status).toBe(400)
    expect(fake.calls.some(([m]) => m === 'insert')).toBe(false)
  })
})
