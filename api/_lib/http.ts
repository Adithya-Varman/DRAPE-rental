// Small helpers shared by every /api handler (Web Request → Response signature, as Vercel Functions expect).
import { ZodError } from 'zod'

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

// JSON bodies only: a form post from another site can't produce this content type without a CORS preflight.
export async function readJson(request: Request): Promise<unknown> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    throw new HttpError(415, 'Send the request body as application/json')
  }
  try { return await request.json() } catch { throw new HttpError(400, 'Request body must be valid JSON') }
}

// Public, non-personal reads can be served from Vercel's CDN for a short while (and stale while it refreshes).
export function publicCache(response: Response, seconds: number): Response {
  response.headers.set('cache-control', `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 10}`)
  return response
}

// Wrap a handler so thrown HttpErrors / ZodErrors become clean JSON responses instead of 500 stack traces.
export function route(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      return await handler(request)
    } catch (error) {
      if (error instanceof HttpError) {
        const retry = (error as HttpError & { retryAfterSeconds?: number }).retryAfterSeconds
        const response = json(retry ? { error: 'rate_limited', message: error.message, retry_after: retry } : { error: error.message }, error.status)
        if (retry) response.headers.set('retry-after', String(retry))
        return response
      }
      if (error instanceof ZodError) return json({ error: 'invalid_request', issues: error.issues }, 400)
      console.error(error)
      return json({ error: 'internal_error' }, 500)
    }
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new HttpError(500, `Server is missing ${name}`)
  return value
}
