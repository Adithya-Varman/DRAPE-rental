import { z } from 'zod'
import { requireUser } from '../../_lib/auth.js'
import { json, readJson, route } from '../../_lib/http.js'
import { db } from '../../_lib/supabase.js'

const body = z.object({ ids: z.array(z.string().uuid()).max(100).optional() })

// POST /api/notifications/read { ids? } → marks the given (or all) of the user's unread notifications as read.
export const POST = route(async (request) => {
  const user = await requireUser(request)
  const { ids } = body.parse(await readJson(request).catch(() => ({})))
  let query = db().from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', user.id).is('read_at', null)
  if (ids?.length) query = query.in('id', ids)
  const { error } = await query
  if (error) throw error
  return json({ ok: true })
})
