// The ONLY Vercel Function. The Hobby plan allows 12 functions per deployment, so every /api/* request is rewritten
// here (vercel.json) and dispatched from this table. Route modules live in api/_routes/ — the leading underscore keeps
// Vercel from deploying them as separate functions. Local dev (dev/api-plugin.ts) uses this same router.
import * as adminCleanup from './_routes/admin/cleanup.js'
import * as adminRetag from './_routes/admin/retag.js'
import * as areas from './_routes/areas.js'
import * as googleCallback from './_routes/auth/google/callback.js'
import * as googleStart from './_routes/auth/google/index.js'
import * as login from './_routes/auth/login.js'
import * as logout from './_routes/auth/logout.js'
import * as providers from './_routes/auth/providers.js'
import * as signup from './_routes/auth/signup.js'
import * as bookings from './_routes/bookings/index.js'
import * as bookingCancel from './_routes/bookings/[id]/cancel.js'
import * as bookingsMine from './_routes/bookings/mine.js'
import * as health from './_routes/health.js'
import * as listingAvailability from './_routes/listings/[id]/availability.js'
import * as listingComplete from './_routes/listings/[id]/complete.js'
import * as listingContact from './_routes/listings/[id]/contact.js'
import * as listing from './_routes/listings/[id]/index.js'
import * as analyze from './_routes/listings/analyze.js'
import * as listings from './_routes/listings/index.js'
import * as me from './_routes/me/index.js'
import * as myListings from './_routes/me/listings.js'
import * as notifications from './_routes/notifications/index.js'
import * as notificationsRead from './_routes/notifications/read.js'
import * as search from './_routes/search/index.js'
import * as searchReasons from './_routes/search/reasons.js'

type Handler = (request: Request) => Promise<Response>
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'
type RouteModule = Partial<Record<Method, Handler>>

// Order matters: static segments before ":id" so /api/listings/analyze never matches /api/listings/:id.
export const ROUTES: [pattern: string, module: RouteModule][] = [
  ['/api/health', health],
  ['/api/areas', areas],
  ['/api/listings', listings],
  ['/api/listings/analyze', analyze],
  ['/api/listings/:id', listing],
  ['/api/listings/:id/contact', listingContact],
  ['/api/listings/:id/availability', listingAvailability],
  ['/api/listings/:id/complete', listingComplete],
  ['/api/search', search],
  ['/api/search/reasons', searchReasons],
  ['/api/bookings', bookings],
  ['/api/bookings/mine', bookingsMine],
  ['/api/bookings/:id/cancel', bookingCancel],
  ['/api/notifications', notifications],
  ['/api/notifications/read', notificationsRead],
  ['/api/me', me],
  ['/api/me/listings', myListings],
  ['/api/admin/retag', adminRetag],
  ['/api/admin/cleanup', adminCleanup],
  ['/api/auth/signup', signup],
  ['/api/auth/login', login],
  ['/api/auth/logout', logout],
  ['/api/auth/providers', providers],
  ['/api/auth/google', googleStart],
  ['/api/auth/google/callback', googleCallback],
]

const compiled = ROUTES.map(([pattern, module]) => ({
  regex: new RegExp(`^${pattern.replace(/:[a-z]+/g, '[^/]+')}/?$`),
  module,
}))

export function match(pathname: string): RouteModule | null {
  return compiled.find((route) => route.regex.test(pathname))?.module ?? null
}

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

// vercel.json rewrites /api/<path> to /api/router?__path=<path>; rebuild the original URL so handlers see their real
// path and query string. Local dev calls this with the original URL directly (no __path).
function originalRequest(request: Request): Request | Promise<Request> {
  const url = new URL(request.url)
  const rewritten = url.searchParams.get('__path')
  if (rewritten === null) return request
  url.searchParams.delete('__path')
  url.pathname = `/api/${rewritten.replace(/^\/+/, '')}`
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  return (hasBody ? request.arrayBuffer() : Promise.resolve(undefined)).then((body) =>
    new Request(url, { method: request.method, headers: request.headers, body }))
}

// Cookie auth + SameSite=Lax already blocks cross-site POSTs; also refuse any state-changing request whose Origin is
// another site. Server-side scripts send no Origin header and are unaffected.
export function crossSite(request: Request): boolean {
  if (request.method === 'GET' || request.method === 'HEAD') return false
  const origin = request.headers.get('origin')
  if (!origin) return false
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host
  try { return new URL(origin).host !== host } catch { return true }
}

async function dispatch(incoming: Request): Promise<Response> {
  const request = await originalRequest(incoming)
  if (crossSite(request)) return json(403, { error: 'cross_site_request' })
  const module = match(new URL(request.url).pathname)
  if (!module) return json(404, { error: 'not_found' })
  const handler = module[request.method as Method]
  if (!handler) return json(405, { error: 'method_not_allowed' })
  return handler(request)
}

export const GET = dispatch
export const POST = dispatch
export const PATCH = dispatch
export const DELETE = dispatch
