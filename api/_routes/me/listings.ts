import { requireUser } from '../../_lib/auth.js'
import { json, route } from '../../_lib/http.js'
import { db, PUBLIC_LISTING_COLUMNS } from '../../_lib/supabase.js'

// GET /api/me/listings → { listings[], bookings[] } — the signed-in owner's pieces, plus bookings on them
// (upcoming and recent, with the borrower's contact) for the My Listings page.
export const GET = route(async (request) => {
  const user = await requireUser(request)
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const [listings, bookings] = await Promise.all([
    db().from('listings').select(`${PUBLIC_LISTING_COLUMNS}, owner_contact`).eq('owner_id', user.id).order('created_at', { ascending: false }),
    db().from('bookings')
      .select('id, listing_id, start_date, end_date, days, total, advance, status, cancelled_by, borrower_name, borrower_contact, listing:listings!inner(title, image_url, area, owner_id)')
      .eq('listing.owner_id', user.id).gte('end_date', since).order('start_date'),
  ])
  if (listings.error) throw listings.error
  if (bookings.error) throw bookings.error
  return json({ listings: listings.data ?? [], bookings: bookings.data ?? [] })
})
