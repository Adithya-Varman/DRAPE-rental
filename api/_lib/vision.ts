// Upload step (PRD §7.2): one vision call turns a messy phone photo into a structured, editable draft.
import { visionResultSchema, type Draft, type VisionResult } from '../../shared/contracts.js'
import { CATEGORIES, GENDERS, OCCASIONS } from '../../shared/vocab.js'
import { generateJson, VISION_MODEL, withOneRetry } from './gemini.js'

export const VISION_SYSTEM_PROMPT = `You tag clothing photos for a peer-to-peer outfit rental marketplace in Chennai, India.
Return JSON only.

Rules:
- If the photo does not show a garment someone could rent (e.g. a person's face only, food, a room, a pet, a document), return {"is_clothing": false} and nothing else.
- The photo may be messy: on a hanger, a mirror selfie, on a bed, poor lighting. Describe the garment only — never the person, their body, or the background.
- category must be exactly one of: ${CATEGORIES.join(', ')}.
  ethnic_jacket means Indian ethnic jackets only (Nehru, bandhgala, embroidered jackets worn over kurtas). A western
  tailored jacket is blazer; a leather, denim, bomber or other western jacket is other.
- occasions must only use: ${OCCASIONS.join(', ')}. Pick the 1–4 that genuinely fit.
- gender must be one of: ${GENDERS.join(', ')}.
- title: short and specific, like "Maroon silk saree with gold zari border" (max ~8 words).
- style_tags: 3–6 short lowercase tags (fabric, embellishment, silhouette, vibe).
- colors: 1–3 main colours, lowercase plain names.
- formality: 1 (very casual) to 5 (bridal / black tie).
- description: 2 sentences. First say what it is and what it is best for. Then say where it does NOT fit well (e.g. "too heavy for daytime college events"). This second sentence is required.`

export const VISION_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_clothing: { type: 'BOOLEAN' },
    title: { type: 'STRING' },
    category: { type: 'STRING', enum: [...CATEGORIES] },
    gender: { type: 'STRING', enum: [...GENDERS] },
    occasions: { type: 'ARRAY', items: { type: 'STRING', enum: [...OCCASIONS] } },
    style_tags: { type: 'ARRAY', items: { type: 'STRING' } },
    colors: { type: 'ARRAY', items: { type: 'STRING' } },
    formality: { type: 'INTEGER' },
    description: { type: 'STRING' },
  },
  required: ['is_clothing'],
  propertyOrdering: ['is_clothing', 'title', 'category', 'gender', 'occasions', 'style_tags', 'colors', 'formality', 'description'],
}

// Light cleanup before validation: models occasionally return duplicate or oddly-cased tags.
export function normalizeVision(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const r = raw as Record<string, unknown>
  if (r.is_clothing === false) return { is_clothing: false }
  const tags = (v: unknown, max: number) => Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().toLowerCase()).filter(Boolean))].slice(0, max)
    : v
  return {
    ...r,
    occasions: Array.isArray(r.occasions) ? [...new Set(r.occasions)].slice(0, 6) : r.occasions,
    style_tags: tags(r.style_tags, 8),
    colors: tags(r.colors, 5),
    formality: typeof r.formality === 'number' ? Math.min(5, Math.max(1, Math.round(r.formality))) : r.formality,
  }
}

export async function analyzeImage(image: { mime: string; base64: string }): Promise<VisionResult> {
  return withOneRetry(async () => {
    const raw = await generateJson({
      model: VISION_MODEL(),
      system: VISION_SYSTEM_PROMPT,
      parts: [{ inline_data: { mime_type: image.mime, data: image.base64 } }, { text: 'Tag this item.' }],
      schema: VISION_RESPONSE_SCHEMA,
    })
    return visionResultSchema.parse(normalizeVision(raw))
  })
}

// Embedding text (PRD §7.2): semantics only. Size and price are excluded because they are SQL filters.
export function embeddingText(d: Pick<Draft, 'title' | 'category' | 'occasions' | 'style_tags' | 'colors' | 'description'>): string {
  return [
    d.title,
    d.category.replace(/_/g, ' '),
    `occasions: ${d.occasions.map((o) => o.replace(/_/g, ' ')).join(', ')}`,
    `style: ${d.style_tags.join(', ')}`,
    `colors: ${d.colors.join(', ')}`,
    d.description,
  ].join('. ')
}
