import { afterEach, describe, expect, it, vi } from 'vitest'
import { isGoodEnough, mergeFilters, planAttempts, relaxedMessage, WIDER_RADIUS_KM } from '../api/_lib/ladder.js'
import { applyCategoryIntent, clampWords, queryEmbeddingText } from '../api/_lib/search-ai.js'
import type { ParsedQuery } from '../shared/contracts.js'

const parsed: ParsedQuery = { occasion: 'sangeet_mehendi', size: 'L', max_price: 2000, gender: null, categories: [], style_query: 'festive outfit' }

describe('mergeFilters', () => {
  it('lets UI chips override the parser', () => {
    expect(mergeFilters(parsed, { size: 'M', max_price: 600 })).toEqual({ size: 'M', max_price: 600, gender: null, categories: [] })
  })
  it('keeps parser values when no chip is set', () => {
    expect(mergeFilters(parsed, {})).toEqual({ size: 'L', max_price: 2000, gender: null, categories: [] })
  })
})

describe('planAttempts (fallback ladder)', () => {
  it('goes 10 km → 25 km → drop budget → drop radius', () => {
    expect(planAttempts({ size: 'M', max_price: 800, gender: null, categories: [] })).toEqual([
      { step: 'strict', radius_km: 10, max_price: 800 },
      { step: 'wider_radius', radius_km: WIDER_RADIUS_KM, max_price: 800 },
      { step: 'no_budget', radius_km: WIDER_RADIUS_KM, max_price: null },
      { step: 'no_radius', radius_km: null, max_price: null },
    ])
  })
  it('skips the budget step when there is no budget', () => {
    expect(planAttempts({ size: null, max_price: null, gender: null, categories: [] }).map((a) => a.step)).toEqual(['strict', 'wider_radius', 'no_radius'])
  })
  it('never relaxes size or gender', () => {
    // Attempts only carry radius and budget; size and gender come from the filters on every step.
    for (const attempt of planAttempts({ size: 'M', max_price: 800, gender: 'men', categories: [] })) {
      expect(Object.keys(attempt).sort()).toEqual(['max_price', 'radius_km', 'step'])
    }
  })
})

describe('isGoodEnough (match floor)', () => {
  it('needs one result at or above the floor on non-final steps', () => {
    expect(isGoodEnough([0.66, 0.6], false)).toBe(false)
    expect(isGoodEnough([0.61, 0.7], false)).toBe(true)
    expect(isGoodEnough([], false)).toBe(false)
  })
  it('accepts any results on the final step so the user always sees something', () => {
    expect(isGoodEnough([0.5], true)).toBe(true)
    expect(isGoodEnough([], true)).toBe(false)
  })
})

describe('relaxedMessage', () => {
  const f = { size: 'M' as const, max_price: 800, gender: null, categories: [] as ParsedQuery['categories'] }
  it('is null when nothing was relaxed', () => {
    expect(relaxedMessage(planAttempts(f)[0], f, 'Adyar', [500])).toBeNull()
  })
  it('announces the wider radius', () => {
    expect(relaxedMessage(planAttempts(f)[1], f, 'Adyar', [500])).toBe('No good match under ₹800 within 10 km of Adyar, so here are options up to 25 km away.')
  })
  it('announces the dropped budget with the real top price, Indian-formatted', () => {
    expect(relaxedMessage(planAttempts(f)[2], f, 'Adyar', [650, 1200])).toBe('No good match under ₹800 near Adyar, so here are options up to ₹1,200 within 25 km.')
  })
  it('announces the dropped radius', () => {
    const noBudget = { size: null, max_price: null, gender: null, categories: [] as ParsedQuery['categories'] }
    expect(relaxedMessage(planAttempts(noBudget)[2], noBudget, 'Tambaram', [900])).toBe('No good match within 25 km of Tambaram, so here are the closest matches across Chennai.')
  })
})

describe('reasons + query text helpers', () => {
  it('maps pants intent to both bottom categories', () => {
    expect(applyCategoryIntent('show me the pants', parsed).categories).toEqual(['jeans', 'trousers'])
    expect(applyCategoryIntent('show me jeans', parsed).categories).toEqual(['jeans'])
  })

  it('clamps reasons to 15 words', () => {
    expect(clampWords('one two three', 15)).toBe('one two three')
    const long = Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ')
    expect(clampWords(long).split(' ')).toHaveLength(15)
    expect(clampWords(long).endsWith('…')).toBe(true)
  })
  it('adds the occasion label to the embedded query text', () => {
    expect(queryEmbeddingText(parsed)).toBe('festive outfit. occasion: Sangeet / Mehendi')
    expect(queryEmbeddingText({ ...parsed, occasion: null })).toBe('festive outfit')
  })
})

describe('textJson provider fallback', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.OPENAI_API_KEY })
  const req = { name: 't', system: 's', user: 'u', jsonSchema: {}, geminiSchema: {}, timeoutMs: 1000 }

  it('uses OpenAI when a key is set', async () => {
    process.env.OPENAI_API_KEY = 'k'
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: '{"ok":"openai"}' } }] }))
    vi.stubGlobal('fetch', fetchMock)
    const { textJson } = await import('../api/_lib/text-llm.js')
    expect(await textJson(req)).toEqual({ ok: 'openai' })
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('api.openai.com')
  })
  it('falls back to Gemini when OpenAI fails', async () => {
    process.env.OPENAI_API_KEY = 'k'
    process.env.GEMINI_API_KEY = 'g'
    const fetchMock = vi.fn(async (url: string) => url.includes('openai')
      ? Response.json({ error: { message: 'boom' } }, { status: 500 })
      : Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":"gemini"}' }] } }] }))
    vi.stubGlobal('fetch', fetchMock)
    const { textJson } = await import('../api/_lib/text-llm.js')
    expect(await textJson(req)).toEqual({ ok: 'gemini' })
  })
  it('goes straight to Gemini when no OpenAI key is set', async () => {
    process.env.GEMINI_API_KEY = 'g'
    const fetchMock = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":"gemini"}' }] } }] }))
    vi.stubGlobal('fetch', fetchMock)
    const { textJson } = await import('../api/_lib/text-llm.js')
    expect(await textJson(req)).toEqual({ ok: 'gemini' })
    expect(fetchMock.mock.calls.every((c) => !String((c as unknown[])[0]).includes('openai'))).toBe(true)
  })
})
