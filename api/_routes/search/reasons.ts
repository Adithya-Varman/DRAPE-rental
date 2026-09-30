import { reasonsRequestSchema, type ReasonsResponse } from '../../../shared/contracts.js'
import { json, readJson, route } from '../../_lib/http.js'
import { clientIp, LIMITS } from '../../_lib/ratelimit.js'
import { explainMatches } from '../../_lib/search-ai.js'
import { db } from '../../_lib/supabase.js'

// POST /api/search/reasons { query, ids } → { reasons: [{ id, reason }] } — one batched call for up to 6 results.
export const POST = route(async (request) => {
  await LIMITS.reasons(clientIp(request))
  const { query, ids } = reasonsRequestSchema.parse(await readJson(request))
  const { data, error } = await db().from('listings').select('id, title, category, occasions, style_tags, description').in('id', ids)
  if (error) throw error
  const reasons = await explainMatches(query, data ?? [])
  const body: ReasonsResponse = { reasons: [...reasons].map(([id, reason]) => ({ id, reason })) }
  return json(body)
})
