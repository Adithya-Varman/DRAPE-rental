import { searchRequestSchema, type SearchResponse } from '../../shared/contracts.js'
import { json, readJson, route } from '../_lib/http.js'
import { explainMatches } from '../_lib/search-ai.js'
import { REASON_COUNT, runSearch, Timer } from '../_lib/search.js'

// POST /api/search { query, area, size?, max_price?, reasons? } → { parsed, relaxed, results }
export const POST = route(async (request) => {
  const timer = new Timer()
  const input = searchRequestSchema.parse(await readJson(request))
  const { parsed, relaxed, rows } = await runSearch(input, timer)
  const reasons = input.reasons === false ? new Map<string, string>() : await explainMatches(input.query, rows.slice(0, REASON_COUNT))
  if (input.reasons !== false) timer.lap('reasons')

  const body: SearchResponse = { parsed, relaxed, results: rows.map((row) => ({ ...row, reason: reasons.get(row.id) ?? null })) }
  const response = json(body)
  response.headers.set('server-timing', timer.header())
  return response
})
