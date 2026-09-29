// JSON contracts (PRD §7–8). The UI and every /api route validate against these shapes.
import { z } from 'zod'
import { CATEGORIES, GENDERS, OCCASIONS, SIZES } from './vocab.js'

export const categorySchema = z.enum(CATEGORIES)
export const occasionSchema = z.enum(OCCASIONS)
export const sizeSchema = z.enum(SIZES)
export const genderSchema = z.enum(GENDERS)

const tag = z.string().trim().min(1).max(40)

// Vision model output (PRD §7.2)
export const draftSchema = z.object({
  title: z.string().trim().min(3).max(120),
  category: categorySchema,
  gender: genderSchema,
  occasions: z.array(occasionSchema).min(1).max(6),
  style_tags: z.array(tag).max(8),
  colors: z.array(tag).min(1).max(5),
  formality: z.number().int().min(1).max(5),
  description: z.string().trim().min(10).max(600),
})
export type Draft = z.infer<typeof draftSchema>

export const visionResultSchema = z.discriminatedUnion('is_clothing', [
  draftSchema.extend({ is_clothing: z.literal(true) }),
  z.object({ is_clothing: z.literal(false) }),
])
export type VisionResult = z.infer<typeof visionResultSchema>

// POST /api/listings/analyze
export type AnalyzeResponse = { image_url: string; draft: Draft } | { error: 'not_clothing' | string }

// POST /api/listings
export const createListingSchema = draftSchema.extend({
  image_url: z.string().url(),
  size: sizeSchema,
  price_per_day: z.number().int().positive().max(100000),
  area: z.string().trim().min(1),
  owner_name: z.string().trim().min(1).max(80),
  owner_contact: z.string().trim().min(3).max(120),
})
export type CreateListingInput = z.infer<typeof createListingSchema>

// Public listing shape — owner_contact is never included; it has its own endpoint.
export type Listing = {
  id: string
  created_at?: string
  owner_name?: string
  image_url: string
  title: string
  category: string
  gender?: string
  occasions: string[]
  style_tags: string[]
  colors?: string[]
  formality?: number
  size: string
  price_per_day: number
  area: string
  description: string
  distance_km?: number | null
}

// Search (PRD §7.3)
export const parsedQuerySchema = z.object({
  occasion: occasionSchema.nullable(),
  size: sizeSchema.nullable(),
  max_price: z.number().int().positive().nullable(),
  gender: z.enum(['women', 'men']).nullable(),
  style_query: z.string().trim().min(1),
})
export type ParsedQuery = z.infer<typeof parsedQuerySchema>

export const searchRequestSchema = z.object({
  query: z.string().trim().min(1).max(500),
  area: z.string().trim().min(1),
  size: sizeSchema.optional(),
  max_price: z.number().int().positive().optional(),
  // PRD contract returns reasons inline (default). The UI passes false to render results sooner, then calls
  // POST /api/search/reasons.
  reasons: z.boolean().optional(),
})
export type SearchRequest = z.infer<typeof searchRequestSchema>

export type SearchResult = Listing & { distance_km: number | null; similarity: number; reason: string | null }
export type SearchResponse = { parsed: ParsedQuery; relaxed: string | null; results: SearchResult[] }

export const reasonsRequestSchema = z.object({
  query: z.string().trim().min(1).max(500),
  ids: z.array(z.string().uuid()).min(1).max(6),
})
export type ReasonsResponse = { reasons: { id: string; reason: string }[] }

export type Area = { name: string; lat: number; lng: number }
