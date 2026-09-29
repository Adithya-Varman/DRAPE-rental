import { describe, expect, it } from 'vitest'
import { createListingSchema, parsedQuerySchema, visionResultSchema } from '../shared/contracts'

const prdDraft = {
  is_clothing: true,
  title: 'Maroon silk saree with gold zari border',
  category: 'saree',
  gender: 'women',
  occasions: ['wedding', 'reception', 'festival'],
  style_tags: ['traditional', 'silk', 'heavy border', 'rich'],
  colors: ['maroon', 'gold'],
  formality: 5,
  description: 'A rich maroon silk saree with a broad gold zari border. Best for weddings and receptions; too heavy for daytime college events or casual outings.',
}

describe('visionResultSchema', () => {
  it('accepts the PRD §7.2 example verbatim', () => {
    expect(visionResultSchema.parse(prdDraft).is_clothing).toBe(true)
  })
  it('accepts a not-clothing verdict with no other fields', () => {
    expect(visionResultSchema.parse({ is_clothing: false })).toEqual({ is_clothing: false })
  })
  it('rejects categories and occasions outside the controlled vocabulary', () => {
    expect(visionResultSchema.safeParse({ ...prdDraft, category: 'jumpsuit' }).success).toBe(false)
    expect(visionResultSchema.safeParse({ ...prdDraft, occasions: ['brunch'] }).success).toBe(false)
  })
  it('rejects formality outside 1–5', () => {
    expect(visionResultSchema.safeParse({ ...prdDraft, formality: 6 }).success).toBe(false)
  })
})

describe('createListingSchema', () => {
  const { is_clothing: _ignored, ...draft } = prdDraft
  const valid = { ...draft, image_url: 'https://x.supabase.co/a.jpg', size: 'FREE', price_per_day: 600, area: 'Adyar', owner_name: 'Priya', owner_contact: '98400 00000' }
  it('accepts a complete listing', () => { expect(createListingSchema.parse(valid).size).toBe('FREE') })
  it('rejects non-positive prices and unknown sizes', () => {
    expect(createListingSchema.safeParse({ ...valid, price_per_day: 0 }).success).toBe(false)
    expect(createListingSchema.safeParse({ ...valid, size: 'XXXL' }).success).toBe(false)
  })
})

describe('parsedQuerySchema', () => {
  it('accepts the PRD §7.3 parser example', () => {
    const parsed = parsedQuerySchema.parse({ occasion: 'sangeet_mehendi', size: 'M', max_price: 800, gender: null, style_query: 'festive colourful outfit for a sangeet, comfortable to dance in' })
    expect(parsed.max_price).toBe(800)
  })
})
