import { z } from 'zod'
import { createListingSchema, occasionSchema } from '../../shared/contracts.js'
import { requireUser } from '../_lib/auth.js'
import { embed } from '../_lib/gemini.js'
import { HttpError, json, readJson, route } from '../_lib/http.js'
import { isOwnImageUrl } from '../_lib/images.js'
import { db, getArea, PUBLIC_LISTING_COLUMNS } from '../_lib/supabase.js'
import { embeddingText } from '../_lib/vision.js'

const listQuery = z.object({
  occasion: occasionSchema.optional(),
  limit: z.coerce.number().int().min(1).max(48).default(8),
})

// GET /api/listings?occasion=wedding&limit=8 → { listings[] } (templates grid, nearby row, explore)
export const GET = route(async (request) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const { occasion, limit } = listQuery.parse(params)
  let query = db().from('listings').select(PUBLIC_LISTING_COLUMNS).order('created_at', { ascending: false }).limit(limit)
  if (occasion) query = query.contains('occasions', [occasion])
  const { data, error } = await query
  if (error) throw error
  return json({ listings: data })
})

// POST /api/listings → { listing }. The server computes the embedding and the location; the client never sends them.
export const POST = route(async (request) => {
  const user = await requireUser(request)
  const input = createListingSchema.parse(await readJson(request))
  if (!isOwnImageUrl(input.image_url)) throw new HttpError(400, 'image_url must come from /api/listings/analyze')
  const [area, embedding] = await Promise.all([getArea(input.area), embed(embeddingText(input), 'RETRIEVAL_DOCUMENT')])
  const { data, error } = await db().from('listings').insert({
    ...input,
    owner_id: user.id,
    area: area.name,
    location: `SRID=4326;POINT(${area.lng} ${area.lat})`,
    embedding: JSON.stringify(embedding),
  }).select(PUBLIC_LISTING_COLUMNS).single()
  if (error) throw error
  return json({ listing: data }, 201)
})
