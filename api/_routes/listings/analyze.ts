import { isAdmin } from '../../_lib/admin.js'
import { requireUser } from '../../_lib/auth.js'
import { RateLimitError } from '../../_lib/gemini.js'
import { LIMITS } from '../../_lib/ratelimit.js'
import { HttpError, json, route } from '../../_lib/http.js'
import { readImage, removeImage, storeImage } from '../../_lib/images.js'
import { analyzeImage } from '../../_lib/vision.js'

// POST /api/listings/analyze (multipart: image) → { image_url, draft } | { error: "not_clothing" }
// Signed-in users only (or the server key for seed/readiness scripts): each call spends AI quota and stores a photo.
export const POST = route(async (request) => {
  if (!isAdmin(request)) await LIMITS.analyze((await requireUser(request)).id)
  const image = await readImage(request)
  // Upload and tagging are independent, so run them together to keep the wait under the PRD's 10 s.
  const [stored, vision] = await Promise.allSettled([
    storeImage(image),
    analyzeImage({ mime: image.mime, base64: Buffer.from(image.bytes).toString('base64') }),
  ])
  if (stored.status === 'rejected') throw stored.reason
  if (vision.status === 'rejected' && vision.reason instanceof RateLimitError) {
    // Busy, not broken: drop the photo and let the UI say "try again in N seconds".
    await removeImage(stored.value.path)
    throw vision.reason
  }
  if (vision.status === 'rejected') {
    // Keep the photo: the UI falls back to manual tagging with this image (PRD §13).
    console.error('Vision failed after retry:', vision.reason)
    return json({ error: 'analysis_failed', image_url: stored.value.url }, 502)
  }
  if (!vision.value.is_clothing) {
    await removeImage(stored.value.path)
    return json({ error: 'not_clothing' }, 422)
  }
  const { is_clothing: _, ...draft } = vision.value
  if (!draft.title) throw new HttpError(502, 'Incomplete analysis')
  return json({ image_url: stored.value.url, draft })
})
