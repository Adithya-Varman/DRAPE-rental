import { z } from 'zod'
import { isAdmin } from '../../_lib/admin.js'
import { embed } from '../../_lib/gemini.js'
import { HttpError, json, readJson, route } from '../../_lib/http.js'
import { sniffImage } from '../../_lib/images.js'
import { db } from '../../_lib/supabase.js'
import { analyzeImage, embeddingText } from '../../_lib/vision.js'

// POST /api/admin/retag { id } — re-runs the current vision prompt on a listing's stored photo and re-embeds it
// (used after the vocabulary changes). Server-key holders only: send the service-role key as x-admin-key.
// One listing per call so each request stays well inside the function time limit; scripts/retag-listings.mjs loops.

export const POST = route(async (request) => {
  if (!isAdmin(request)) throw new HttpError(403, 'forbidden')
  const { id } = z.object({ id: z.string().uuid() }).parse(await readJson(request))
  const { data: listing, error } = await db().from('listings').select('id, image_url, title, category, occasions').eq('id', id).maybeSingle()
  if (error) throw error
  if (!listing) throw new HttpError(404, 'Listing not found')

  const photo = await fetch(String(listing.image_url))
  if (!photo.ok) throw new HttpError(502, 'Could not load the stored photo')
  const bytes = new Uint8Array(await photo.arrayBuffer())
  const type = sniffImage(bytes)
  if (!type) throw new HttpError(422, 'Stored image is not a supported type')
  const vision = await analyzeImage({ mime: type.mime, base64: Buffer.from(bytes).toString('base64') })
  if (!vision.is_clothing) return json({ id, skipped: 'not_clothing' })

  const { is_clothing: _, ...draft } = vision
  const embedding = await embed(embeddingText(draft), 'RETRIEVAL_DOCUMENT')
  const { error: updateError } = await db().from('listings').update({ ...draft, embedding: JSON.stringify(embedding) }).eq('id', id)
  if (updateError) throw updateError
  return json({ id, before: { title: listing.title, category: listing.category, occasions: listing.occasions }, after: { title: draft.title, category: draft.category, occasions: draft.occasions } })
})
