// Search-time AI (PRD §7.3): query parser and one batched "why it fits" call. The LLM never applies filters itself.
import { parsedQuerySchema, type ParsedQuery } from '../../shared/contracts.js'
import { OCCASION_LABELS, OCCASIONS, SIZES } from '../../shared/vocab.js'
import { withOneRetry } from './gemini.js'
import { textJson } from './text-llm.js'

export const PARSER_SYSTEM_PROMPT = `You turn a shopper's message into search filters for a clothing rental marketplace in Chennai, India.
Return JSON only. Use null for anything the message does not clearly state — never guess.

- occasion: one of ${OCCASIONS.join(', ')}, or null. "sangeet" or "mehendi" → sangeet_mehendi; "job interview" → interview; "college fest/farewell" → college_event.
- size: one of ${SIZES.join(', ')}, or null. Only if a size is stated ("M", "medium", "size L", "free size").
- max_price: integer rupees per day, or null. "under ₹800", "below 800", "800 budget", "max 1k" → 800 / 1000.
- gender: "women" or "men" only if the message clearly says who it is for ("for my brother", "men's", "for her"), else null.
- style_query: rewrite the request as a short description of the ideal outfit, focusing on occasion, vibe, style, colours and
  practical needs (e.g. "comfortable to dance in"). Drop size and price. Never empty — if the message is vague, describe a
  versatile outfit for the stated purpose.`

const nullableEnum = (values: readonly string[]) => ({ type: ['string', 'null'], enum: [...values, null] })
const PARSER_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['occasion', 'size', 'max_price', 'gender', 'style_query'],
  properties: {
    occasion: nullableEnum(OCCASIONS),
    size: nullableEnum(SIZES),
    max_price: { type: ['integer', 'null'] },
    gender: nullableEnum(['women', 'men']),
    style_query: { type: 'string' },
  },
}

const PARSER_GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    occasion: { type: 'STRING', enum: [...OCCASIONS], nullable: true },
    size: { type: 'STRING', enum: [...SIZES], nullable: true },
    max_price: { type: 'INTEGER', nullable: true },
    gender: { type: 'STRING', enum: ['women', 'men'], nullable: true },
    style_query: { type: 'STRING' },
  },
  required: ['occasion', 'size', 'max_price', 'gender', 'style_query'],
  propertyOrdering: ['occasion', 'size', 'max_price', 'gender', 'style_query'],
}

// A search should still work if the parser fails twice: fall back to pure semantic search on the raw text.
export async function parseQuery(query: string): Promise<{ parsed: ParsedQuery; degraded: boolean }> {
  try {
    const parsed = await withOneRetry(async () => parsedQuerySchema.parse(await textJson({
      name: 'parsed_query',
      system: PARSER_SYSTEM_PROMPT,
      user: query,
      jsonSchema: PARSER_JSON_SCHEMA,
      geminiSchema: PARSER_GEMINI_SCHEMA,
      timeoutMs: 5_000,
    })))
    return { parsed, degraded: false }
  } catch (error) {
    console.error('Query parser failed, using raw query:', (error as Error).message)
    return { parsed: { occasion: null, size: null, max_price: null, gender: null, style_query: query }, degraded: true }
  }
}

// What gets embedded at search time: the rewritten intent plus the occasion name, mirroring how listings are embedded.
export function queryEmbeddingText(parsed: ParsedQuery): string {
  return parsed.occasion ? `${parsed.style_query}. occasion: ${OCCASION_LABELS[parsed.occasion]}` : parsed.style_query
}

export const REASONS_SYSTEM_PROMPT = `For each rental listing, write one short reason it fits the shopper's request.
Return JSON only: {"reasons": [{"id", "reason"}]} with one entry per listing, same ids as given.
Each reason: 12 words or fewer, specific to that item (fabric, colour, silhouette, vibe, why it suits the occasion).
Never mention size, fit, price, distance or availability — those are handled elsewhere. "FREE" size just means one size fits all.
Never assume who will wear it or their gender. No emojis. Do not start every reason the same way.
If an item is a weak fit for the request, say honestly what makes it a reasonable alternative.`

const REASONS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reasons'],
  properties: {
    reasons: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'reason'],
        properties: { id: { type: 'string' }, reason: { type: 'string' } },
      },
    },
  },
}

const REASONS_GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reasons: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { id: { type: 'STRING' }, reason: { type: 'STRING' } },
        required: ['id', 'reason'],
        propertyOrdering: ['id', 'reason'],
      },
    },
  },
  required: ['reasons'],
}

export type ReasonInput = { id: string; title: string; category: string; occasions: string[]; style_tags: string[]; description: string }

export function clampWords(text: string, max = 15): string {
  const words = text.trim().replace(/\s+/g, ' ').split(' ')
  return words.length <= max ? words.join(' ') : `${words.slice(0, max).join(' ').replace(/[,;:.]+$/, '')}…`
}

// One batched call for the top results — never one call per card. Failure means no reasons, not a failed search.
export async function explainMatches(query: string, items: ReasonInput[]): Promise<Map<string, string>> {
  const reasons = new Map<string, string>()
  if (items.length === 0) return reasons
  try {
    const raw = await textJson({
      name: 'match_reasons',
      system: REASONS_SYSTEM_PROMPT,
      user: JSON.stringify({ request: query, listings: items }),
      jsonSchema: REASONS_JSON_SCHEMA,
      geminiSchema: REASONS_GEMINI_SCHEMA,
      timeoutMs: 6_000,
    }) as { reasons?: unknown }
    const ids = new Set(items.map((i) => i.id))
    for (const entry of Array.isArray(raw?.reasons) ? raw.reasons : []) {
      if (entry && ids.has(entry.id) && typeof entry.reason === 'string' && entry.reason.trim()) {
        reasons.set(entry.id, clampWords(entry.reason))
      }
    }
  } catch (error) {
    console.error('Reasons call failed; returning results without reasons:', (error as Error).message)
  }
  return reasons
}
