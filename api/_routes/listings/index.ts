import { z } from 'zod'
import { createListingSchema, occasionSchema } from '../../../shared/contracts.js'
import { isAdmin } from '../../_lib/admin.js'
import { requireUser } from '../../_lib/auth.js'
import { embed } from '../../_lib/gemini.js'
import { HttpError, json, publicCache, readJson, route } from '../../_lib/http.js'
import { isOwnImageUrl } from '../../_lib/images.js'
import { db, getArea, PUBLIC_LISTING_COLUMNS } from '../../_lib/supabase.js'
import { embeddingText } from '../../_lib/vision.js'

const listQuery = z.object({
  occasion: occasionSchema.optional(),
  area: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(48).default(8),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
})

// GET /api/listings?area=&occasion=&limit=&offset= → { listings[], total }
// With an area: nearest first, with distance_km, paged (home "nearby" row and Explore). Without: newest first.
export const GET = route(async (request) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const { occasion, area: areaName, limit, offset } = listQuery.parse(params)
  if (areaName) {
    const area = await getArea(areaName)
    const { data, error } = await db().rpc('nearby_listings', { q_lat: area.lat, q_lng: area.lng, q_occasion: occasion ?? null, lim: limit, off: offset })
    if (error) throw error
    const rows = (data ?? []) as Record<string, unknown>[]
    const total = rows.length ? Number(rows[0].total) : 0
    return publicCache(json({ listings: rows.map(({ total: _, ...listing }) => listing), total }), 30)
  }
  let query = db().from('listings').select(PUBLIC_LISTING_COLUMNS, { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1)
  if (occasion) query = query.contains('occasions', [occasion])
  const { data, error, count } = await query
  if (error) throw error
  return publicCache(json({ listings: data, total: count ?? data?.length ?? 0 }), 30)
})

// POST /api/listings → { listing }. The server computes the embedding and the location; the client never sends them.
export const POST = route(async (request) => {
  // Seeding scripts publish with the server key and no owner; scripts/create-demo-owner.mjs then claims them.
  const user = isAdmin(request) ? null : await requireUser(request)
  const input = createListingSchema.parse(await readJson(request))
  if (!isOwnImageUrl(input.image_url)) throw new HttpError(400, 'image_url must come from /api/listings/analyze')
  const [area, embedding] = await Promise.all([getArea(input.area), embed(embeddingText(input), 'RETRIEVAL_DOCUMENT')])
  const { data, error } = await db().from('listings').insert({
    ...input,
    owner_id: user?.id ?? null,
    area: area.name,
    location: `SRID=4326;POINT(${area.lng} ${area.lat})`,
    embedding: JSON.stringify(embedding),
  }).select(PUBLIC_LISTING_COLUMNS).single()
  if (error) throw error
  return json({ listing: data }, 201)
})
