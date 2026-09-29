// Search filters + zero-results fallback ladder (PRD §7.3). Pure functions: no I/O, fully unit-tested.
import type { ParsedQuery, SearchRequest } from '../../shared/contracts.js'
import { DEFAULT_RADIUS_KM } from '../../shared/vocab.js'

export type Filters = {
  size: ParsedQuery['size']
  max_price: number | null
  gender: ParsedQuery['gender']
}

export type Attempt = {
  step: 'strict' | 'wider_radius' | 'no_budget' | 'no_radius'
  radius_km: number | null // null = anywhere
  max_price: number | null
}

export const WIDER_RADIUS_KM = 25

// Vector search always returns *something* that passes the filters, so "zero results" alone would almost never fire
// the ladder. A step only counts as a hit if at least one result is a genuinely good match; otherwise we relax and say so.
// Calibrated on gemini-embedding-001 over 14 real queries: plausible top matches scored 0.686–0.85, poor ones
// 0.59–0.66 (e.g. "wedding guest saree" whose nearest item was a beige dress at 0.653). Override with MATCH_FLOOR.
export const MATCH_FLOOR = () => Number(process.env.MATCH_FLOOR ?? 0.68)

export function isGoodEnough(similarities: number[], isLast: boolean): boolean {
  if (isLast) return similarities.length > 0
  return similarities.some((s) => s >= MATCH_FLOOR())
}

// UI chips override the parser when both are set; area always comes from the header selector.
export function mergeFilters(parsed: ParsedQuery, request: Pick<SearchRequest, 'size' | 'max_price'>): Filters {
  return {
    size: request.size ?? parsed.size,
    max_price: request.max_price ?? parsed.max_price,
    gender: parsed.gender,
  }
}

// 10 km → 25 km → drop the budget → drop the radius. Steps that would repeat the previous query are skipped.
// Size and gender are never relaxed: a dress that doesn't fit or suit the person is not a match.
export function planAttempts(filters: Filters): Attempt[] {
  const attempts: Attempt[] = [
    { step: 'strict', radius_km: DEFAULT_RADIUS_KM, max_price: filters.max_price },
    { step: 'wider_radius', radius_km: WIDER_RADIUS_KM, max_price: filters.max_price },
  ]
  if (filters.max_price !== null) attempts.push({ step: 'no_budget', radius_km: WIDER_RADIUS_KM, max_price: null })
  attempts.push({ step: 'no_radius', radius_km: null, max_price: null })
  return attempts
}

export const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`

// Tell the user exactly what changed (PRD: "Nothing under ₹800 nearby, so here are options up to ₹1,200").
// Worded as "no good match" because the floor can relax a step that technically had weak results.
export function relaxedMessage(attempt: Attempt, filters: Filters, area: string, prices: number[]): string | null {
  const budget = filters.max_price === null ? '' : ` under ${rupees(filters.max_price)}`
  const nothing = `No good match${budget}`
  const topPrice = prices.length ? rupees(Math.max(...prices)) : null
  switch (attempt.step) {
    case 'strict':
      return null
    case 'wider_radius':
      return `${nothing} within ${DEFAULT_RADIUS_KM} km of ${area}, so here are options up to ${WIDER_RADIUS_KM} km away.`
    case 'no_budget':
      return `${nothing} near ${area}, so here are options up to ${topPrice} within ${WIDER_RADIUS_KM} km.`
    case 'no_radius':
      return `${nothing} within ${WIDER_RADIUS_KM} km of ${area}, so here are the closest matches across Chennai${filters.max_price !== null && topPrice ? `, up to ${topPrice}` : ''}.`
  }
}
