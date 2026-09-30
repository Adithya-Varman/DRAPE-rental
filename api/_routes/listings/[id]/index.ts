import { z } from 'zod'
import { createListingSchema } from '../../../../shared/contracts.js'
import { todayInIndia } from '../../../../shared/booking.js'
import { requireUser } from '../../../_lib/auth.js'
import { embed } from '../../../_lib/gemini.js'
import { HttpError, json, publicCache, readJson, route } from '../../../_lib/http.js'
import { db, getArea, PUBLIC_LISTING_COLUMNS } from '../../../_lib/supabase.js'
import { embeddingText } from '../../../_lib/vision.js'

export function listingIdFrom(request: Request): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean) // ['api','listings',id,...]
  const parsed = z.string().uuid().safeParse(segments[2])
  if (!parsed.success) throw new HttpError(404, 'Listing not found')
  return parsed.data
}

// GET /api/listings/:id → { listing } (public fields only)
export const GET = route(async (request) => {
  const id = listingIdFrom(request)
  const { data, error } = await db().from('listings').select(PUBLIC_LISTING_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'Listing not found')
  return publicCache(json({ listing: data }), 60)
})

// Owners can change everything except the photo. Fields that feed the embedding trigger a re-embed, and a new area
// moves the pin — so search stays correct after an edit.
const editable = createListingSchema.omit({ image_url: true }).partial()
const SEMANTIC = ['title', 'category', 'occasions', 'style_tags', 'colors', 'description'] as const

async function ownedListing(request: Request) {
  const user = await requireUser(request)
  const id = listingIdFrom(request)
  const { data, error } = await db().from('listings').select('id, owner_id, title, category, occasions, style_tags, colors, description').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data || data.owner_id !== user.id) throw new HttpError(404, 'Listing not found')  // same answer for "not yours"
  return data
}

// PATCH /api/listings/:id (owner) → { listing }
export const PATCH = route(async (request) => {
  const current = await ownedListing(request)
  const changes = editable.parse(await readJson(request))
  const update: Record<string, unknown> = { ...changes }
  if (changes.area) {
    const area = await getArea(changes.area)
    update.area = area.name
    update.location = `SRID=4326;POINT(${area.lng} ${area.lat})`
  }
  if (SEMANTIC.some((k) => k in changes)) {
    const merged = { ...current, ...changes } as Parameters<typeof embeddingText>[0]
    update.embedding = JSON.stringify(await embed(embeddingText(merged), 'RETRIEVAL_DOCUMENT'))
  }
  const { data, error } = await db().from('listings').update(update).eq('id', current.id).select(PUBLIC_LISTING_COLUMNS).single()
  if (error) throw error
  return json({ listing: data })
})

// DELETE /api/listings/:id (owner) — refused while it has upcoming confirmed bookings (decline those first).
export const DELETE = route(async (request) => {
  const current = await ownedListing(request)
  const { count, error: countError } = await db().from('bookings').select('id', { count: 'exact', head: true })
    .eq('listing_id', current.id).eq('status', 'confirmed').gte('end_date', todayInIndia())
  if (countError) throw countError
  if (count) throw new HttpError(409, `This piece has ${count} upcoming booking${count === 1 ? '' : 's'} — decline ${count === 1 ? 'it' : 'them'} first.`)
  const { error } = await db().from('listings').delete().eq('id', current.id)
  if (error) throw error
  return json({ ok: true })
})
