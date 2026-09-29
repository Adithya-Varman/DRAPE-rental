// Gemini REST client (no SDK — keeps functions small). Server-only.
import { EMBEDDING_DIMENSIONS } from '../../shared/vocab.js'
import { HttpError, requireEnv } from './http.js'

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// gemini-3.5-flash-lite with minimal thinking measured ~3 s for vision tagging; the full flash model had
// multi-second variance (one 82 s outlier), too risky for a live demo. Override per deployment if needed.
// Vision and text use DIFFERENT models on purpose: the free tier caps each model at 15 requests/minute, and a search
// makes two text calls, so sharing one model would let a few searches block uploads (and vice versa).
export const VISION_MODEL = () => process.env.GEMINI_VISION_MODEL || 'gemini-3.5-flash-lite'
export const TEXT_MODEL = () => process.env.GEMINI_TEXT_MODEL || 'gemini-3.5-flash-lite'
// Locked in hour 0 (PRD §2). Changing this model means re-embedding every listing.
export const EMBEDDING_MODEL = 'gemini-embedding-001'

export type Part = { text: string } | { inline_data: { mime_type: string; data: string } }

export class RateLimitError extends HttpError {
  constructor(public retryAfterSeconds: number) { super(429, `AI is busy — try again in ${retryAfterSeconds}s`) }
}

async function call(model: string, method: string, body: unknown, timeoutMs: number): Promise<any> {
  const response = await fetch(`${BASE}/${model}:${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': requireEnv('GEMINI_API_KEY') },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const data = await response.json().catch(() => ({}))
  if (response.status === 429) {
    const hint = /retry in ([\d.]+)s/i.exec(data?.error?.message ?? '')
    throw new RateLimitError(Math.ceil(Number(hint?.[1] ?? 30)))
  }
  if (!response.ok) throw new HttpError(502, `Gemini ${method} failed: ${data?.error?.message ?? response.status}`)
  return data
}

// One JSON-mode generation. Callers validate with zod and decide whether to retry.
export async function generateJson(opts: {
  model: string
  system: string
  parts: Part[]
  schema: object
  timeoutMs?: number
}): Promise<unknown> {
  const data = await call(opts.model, 'generateContent', {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: 'user', parts: opts.parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: opts.schema,
      temperature: 0.2,
      thinkingConfig: { thinkingLevel: 'minimal' },
    },
  }, opts.timeoutMs ?? 20_000)
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text
  if (!text) throw new HttpError(502, 'Gemini returned no content')
  try { return JSON.parse(text) } catch { throw new HttpError(502, 'Gemini returned invalid JSON') }
}

// The single embedding helper used by both upload and search, so dimensions can never drift between routes.
export async function embed(text: string, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<number[]> {
  const data = await call(EMBEDDING_MODEL, 'embedContent', {
    content: { parts: [{ text }] },
    taskType,
    outputDimensionality: EMBEDDING_DIMENSIONS,
  }, 10_000)
  const values: unknown = data?.embedding?.values
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    throw new HttpError(502, `Embedding has ${Array.isArray(values) ? values.length : 0} dims, expected ${EMBEDDING_DIMENSIONS}`)
  }
  return values as number[]
}

// Run a generate+validate step, retrying once on failure (PRD §13: "structured output + zod + one retry").
// Rate limits are not retried: an immediate retry would just spend another request of the same exhausted quota.
export async function withOneRetry<T>(step: () => Promise<T>): Promise<T> {
  try { return await step() } catch (first) {
    if (first instanceof RateLimitError) throw first
    console.warn('Gemini step failed, retrying once:', (first as Error).message)
    return step()
  }
}
