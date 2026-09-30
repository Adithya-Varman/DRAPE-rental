import { isAdmin } from '../../_lib/admin.js'
import { HttpError, json, route } from '../../_lib/http.js'
import { db, LISTING_BUCKET } from '../../_lib/supabase.js'

// GET /api/admin/cleanup[?delete=1] — finds listing photos that no listing uses (analyzed but never published, or
// left behind by a deleted listing) and are older than a day. Dry run by default: it only reports. With ?delete=1 it
// removes them. Callers: scripts/cleanup-orphans.mjs (x-admin-key) or a Vercel Cron (Authorization: Bearer CRON_SECRET).
const MIN_AGE_MS = 24 * 3600_000

function authorized(request: Request): boolean {
  if (isAdmin(request)) return true
  const secret = process.env.CRON_SECRET
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`
}

export const GET = route(async (request) => {
  if (!authorized(request)) throw new HttpError(403, 'forbidden')
  const remove = new URL(request.url).searchParams.get('delete') === '1'
  const bucket = db().storage.from(LISTING_BUCKET)

  const { data: folders, error } = await bucket.list('', { limit: 1000 })
  if (error) throw error
  const files: { path: string; created: number }[] = []
  for (const folder of folders ?? []) {
    if (folder.id) continue  // a file at the root, not a date folder
    const { data: inside, error: listError } = await bucket.list(folder.name, { limit: 1000 })
    if (listError) throw listError
    for (const f of inside ?? []) if (f.id) files.push({ path: `${folder.name}/${f.name}`, created: Date.parse(f.created_at ?? '') || Date.now() })
  }
  const { data: used, error: usedError } = await db().from('listings').select('image_url')
  if (usedError) throw usedError
  const inUse = new Set((used ?? []).map((l) => String(l.image_url).split(`/${LISTING_BUCKET}/`)[1]))
  const orphans = files.filter((f) => !inUse.has(f.path) && Date.now() - f.created > MIN_AGE_MS).map((f) => f.path)

  if (remove && orphans.length) {
    for (let i = 0; i < orphans.length; i += 100) {
      const { error: removeError } = await bucket.remove(orphans.slice(i, i + 100))
      if (removeError) throw removeError
    }
  }
  return json({ scanned: files.length, in_use: inUse.size, orphans: orphans.length, deleted: remove ? orphans.length : 0, sample: orphans.slice(0, 10) })
})
