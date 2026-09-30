import { requireUser } from '../../_lib/auth.js'
import { json, route } from '../../_lib/http.js'
import { db } from '../../_lib/supabase.js'

// GET /api/notifications → { notifications[], unread } for the signed-in user (the header bell). Owners see who
// booked, when, what was paid, and the borrower's contact so they can arrange pickup.
export const GET = route(async (request) => {
  const user = await requireUser(request)
  const { data, error } = await db().from('notifications')
    .select('id, created_at, read_at, type, booking:bookings(id, start_date, end_date, days, total, advance, status, cancelled_by, borrower_name, borrower_contact, listing:listings(id, title, image_url, area, owner_name))')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(30)
  if (error) throw error
  const notifications = data ?? []
  return json({ notifications, unread: notifications.filter((n) => !n.read_at).length })
})
