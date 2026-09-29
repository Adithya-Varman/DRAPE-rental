// Search core (PRD §7.3): parse → embed → match with fallback ladder. Reasons are added by the caller.
import type { Area, ParsedQuery, SearchRequest, SearchResult } from '../../shared/contracts.js'
import { embed } from './gemini.js'
import { isGoodEnough, mergeFilters, planAttempts, relaxedMessage, type Attempt, type Filters } from './ladder.js'
import { parseQuery, queryEmbeddingText } from './search-ai.js'
import { db, getArea } from './supabase.js'

export const RESULT_LIMIT = 12
export const REASON_COUNT = 6
// "No radius" still passes a radius so distance_km stays populated; 1000 km covers all of the city scope.
const ANYWHERE_KM = 1000

export type Row = Omit<SearchResult, 'reason'>

export class Timer {
  private marks: string[] = []
  private last = performance.now()
  private readonly start = this.last
  lap(name: string) { const now = performance.now(); this.marks.push(`${name};dur=${Math.round(now - this.last)}`); this.last = now }
  header() { return [...this.marks, `total;dur=${Math.round(performance.now() - this.start)}`].join(', ') }
}

async function match(embedding: number[], filters: Filters, area: Area, attempt: Attempt): Promise<Row[]> {
  const { data, error } = await db().rpc('match_listings', {
    q_emb: JSON.stringify(embedding),
    q_size: filters.size,
    q_max_price: attempt.max_price,
    q_gender: filters.gender,
    q_lat: area.lat,
    q_lng: area.lng,
    q_radius_km: attempt.radius_km ?? ANYWHERE_KM,
    k: RESULT_LIMIT,
  })
  if (error) throw error
  return data as Row[]
}

export async function runSearch(input: SearchRequest, timer: Timer): Promise<{ parsed: ParsedQuery; relaxed: string | null; rows: Row[] }> {
  const [{ parsed }, area] = await Promise.all([parseQuery(input.query), getArea(input.area)])
  timer.lap('parse')
  const embedding = await embed(queryEmbeddingText(parsed), 'RETRIEVAL_QUERY')
  timer.lap('embed')

  const filters = mergeFilters(parsed, input)
  const attempts = planAttempts(filters)
  let rows: Row[] = []
  let used: Attempt = attempts[0]
  for (const [i, attempt] of attempts.entries()) {
    rows = await match(embedding, filters, area, attempt)
    used = attempt
    if (isGoodEnough(rows.map((r) => r.similarity), i === attempts.length - 1)) break
  }
  timer.lap('match')

  return {
    parsed: { ...parsed, size: filters.size, max_price: filters.max_price },
    relaxed: rows.length ? relaxedMessage(used, filters, area.name, rows.map((r) => r.price_per_day)) : null,
    rows,
  }
}
