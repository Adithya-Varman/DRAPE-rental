import { CATEGORY_SLOT, PAIRS_WITH, categoriesInSlot, type Category } from '../../../../shared/vocab.js'
import { HttpError, json, publicCache, route } from '../../../_lib/http.js'
import { db } from '../../../_lib/supabase.js'
import { listingIdFrom } from './index.js'

// GET /api/listings/:id/complete → { slot, pairs_with, results[] } — pieces that complete this one's outfit
// (bottoms for a top, tops for a bottom, layers for a one-piece …), sharing an occasion and a style.
export const GET = route(async (request) => {
  const id = listingIdFrom(request)
  const { data: anchor, error } = await db().from('listings').select('category').eq('id', id).maybeSingle()
  if (error) throw error
  if (!anchor) throw new HttpError(404, 'Listing not found')
  const slot = CATEGORY_SLOT[anchor.category as Category] ?? 'other'
  const pairsWith = PAIRS_WITH[slot]
  if (pairsWith.length === 0) return publicCache(json({ slot, pairs_with: [], results: [] }), 60)
  // One query per complementary slot, concatenated in priority order: the pieces that complete the outfit come first.
  const perSlot = await Promise.all(pairsWith.map(async (pair, i) => {
    const { data, error: rpcError } = await db().rpc('complete_the_look', { anchor: id, pair_categories: categoriesInSlot(pair, slot), k: i === 0 ? 4 : 2 })
    if (rpcError) throw rpcError
    return (data ?? []).map((row: Record<string, unknown>) => ({ ...row, slot: pair }))
  }))
  return publicCache(json({ slot, pairs_with: pairsWith, results: perSlot.flat().slice(0, 8) }), 60)
})
