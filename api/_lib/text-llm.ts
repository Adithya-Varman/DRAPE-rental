// Text LLM for search-time calls (query parser + "why it fits"). OpenAI when OPENAI_API_KEY is set — separate, much
// higher rate limits than the Gemini free tier, which stays reserved for photo tagging and embeddings — with Gemini as
// an automatic fallback so search keeps working if OpenAI is missing, slow or failing.
import { generateJson, TEXT_MODEL } from './gemini.js'
import { HttpError } from './http.js'

// gpt-5.4-mini with reasoning off measured ~0.9–1.2 s on the parser prompt; same speed as nano, better writing.
export const OPENAI_TEXT_MODEL = () => process.env.OPENAI_TEXT_MODEL || 'gpt-5.4-mini'

export type TextJsonRequest = {
  name: string
  system: string
  user: string
  // Strict JSON Schema for OpenAI (all properties required, additionalProperties: false, object at the root).
  jsonSchema: Record<string, unknown>
  // Gemini's OpenAPI-subset schema describing the same shape.
  geminiSchema: object
  timeoutMs: number
}

async function openAiJson(req: TextJsonRequest, key: string): Promise<unknown> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: OPENAI_TEXT_MODEL(),
      reasoning_effort: 'none',
      messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
      response_format: { type: 'json_schema', json_schema: { name: req.name, strict: true, schema: req.jsonSchema } },
    }),
    signal: AbortSignal.timeout(req.timeoutMs),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new HttpError(502, `OpenAI failed (${response.status}): ${data?.error?.message ?? ''}`)
  const content: string | undefined = data?.choices?.[0]?.message?.content
  if (!content) throw new HttpError(502, 'OpenAI returned no content')
  return JSON.parse(content)
}

export async function textJson(req: TextJsonRequest): Promise<unknown> {
  const key = process.env.OPENAI_API_KEY
  if (key) {
    try { return await openAiJson(req, key) } catch (error) {
      console.warn(`OpenAI ${req.name} failed, falling back to Gemini:`, (error as Error).message)
    }
  }
  return generateJson({ model: TEXT_MODEL(), system: req.system, parts: [{ text: req.user }], schema: req.geminiSchema, timeoutMs: req.timeoutMs })
}
