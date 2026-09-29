import { requireUser } from '../../_lib/auth.js'
import { json, route } from '../../_lib/http.js'
import { db } from '../../_lib/supabase.js'

// GET /api/me → the signed-in user's profile and Profile-page stats.
export const GET = route(async (request) => {
  const user = await requireUser(request)
  const [listed, rented, earned] = await Promise.all([
    db().from('listings').select('id', { count: 'exact', head: true }).eq('owner_id', user.id),
    db().from('bookings').select('id', { count: 'exact', head: true }).eq('borrower_id', user.id).eq('status', 'confirmed'),
    db().from('bookings').select('total, listing:listings!inner(owner_id)').eq('listing.owner_id', user.id).eq('status', 'confirmed'),
  ])
  for (const r of [listed, rented, earned]) if (r.error) throw r.error
  const earnedTotal = (earned.data ?? []).reduce((sum, b) => sum + (b.total as number), 0)
  return json({ user, stats: { listed: listed.count ?? 0, rentals: rented.count ?? 0, earned: earnedTotal } })
})
