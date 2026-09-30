// Typed browser client for /api. Contracts come from shared/ so the UI and server can't drift apart.
import type {
  AnalyzeResponse, Area, CreateListingInput, Draft, Listing, ReasonsResponse, SearchRequest, SearchResponse,
} from '../shared/contracts'
import type { Booking, BookingRequest, BookingResponse } from '../shared/booking'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public body: Record<string, unknown> = {}) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    // Same-origin requests carry the httpOnly session cookie automatically; the browser never handles the token.
    response = await fetch(path, { credentials: 'same-origin', ...init })
  } catch {
    throw new ApiError(0, 'network', 'You seem to be offline — check your connection and try again.')
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const code = typeof body.error === 'string' ? body.error : 'error'
    const message = code === 'rate_limited'
      ? `Our AI is busy right now — try again in ${body.retry_after ?? 30} seconds.`
      : typeof body.message === 'string' ? body.message
      : typeof body.error === 'string' && body.error.includes(' ') ? body.error
      : code === 'invalid_request' && Array.isArray(body.issues) && body.issues[0]?.message ? String(body.issues[0].message)
      : 'Something went wrong. Please try again.'
    throw new ApiError(response.status, code, message, body)
  }
  return body as T
}

const post = <T>(path: string, data: unknown) =>
  request<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })

export const api = {
  areas: () => request<{ areas: Area[] }>('/api/areas').then((r) => r.areas),
  // With an area the server returns nearest first (with distance_km) and a total for paging.
  listings: (params: { area?: string; occasion?: string; limit?: number; offset?: number } = {}) => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value))
    return request<{ listings: Listing[]; total: number }>(`/api/listings?${query}`)
  },
  complete: (id: string) => request<{ slot: string; pairs_with: string[]; results: (Listing & { slot: string; similarity: number })[] }>(`/api/listings/${id}/complete`),
  listing: (id: string) => request<{ listing: Listing }>(`/api/listings/${id}`).then((r) => r.listing),
  contact: (id: string) => request<{ owner_name: string; owner_contact: string }>(`/api/listings/${id}/contact`),
  // Results first (fast), reasons second — see POST /api/search/reasons.
  search: (input: SearchRequest) => post<SearchResponse>('/api/search', { ...input, reasons: false }),
  reasons: (query: string, ids: string[]) => post<ReasonsResponse>('/api/search/reasons', { query, ids }).then((r) => r.reasons),
  analyze: async (image: Blob): Promise<{ image_url: string; draft: Draft }> => {
    const form = new FormData()
    form.append('image', image, 'photo.jpg')
    const result = await request<AnalyzeResponse>('/api/listings/analyze', { method: 'POST', body: form })
    if ('error' in result) throw new ApiError(422, result.error, result.error)
    return result
  },
  create: (input: CreateListingInput) => post<{ listing: Listing }>('/api/listings', input).then((r) => r.listing),
  availability: (id: string) => request<{ booked: { start_date: string; end_date: string }[] }>(`/api/listings/${id}/availability`).then((r) => r.booked),
  book: (input: BookingRequest) => post<BookingResponse>('/api/bookings', input),
  myBookings: () => request<{ bookings: Booking[] }>('/api/bookings/mine').then((r) => r.bookings),
  signup: (input: { name: string; email: string; password: string }) => post<{ user: Me }>('/api/auth/signup', input).then((r) => r.user),
  login: (input: { email: string; password: string }) => post<{ user: Me }>('/api/auth/login', input).then((r) => r.user),
  logout: () => post<{ ok: true }>('/api/auth/logout', {}),
  providers: () => request<{ password: boolean; google: boolean }>('/api/auth/providers'),
  me: () => request<{ user: Me; stats: { listed: number; rentals: number; earned: number } }>('/api/me'),
  notifications: () => request<{ notifications: AppNotification[]; unread: number }>('/api/notifications'),
  markRead: (ids?: string[]) => post<{ ok: true }>('/api/notifications/read', { ids }),
  cancelBooking: (id: string) => post<{ booking: Booking }>(`/api/bookings/${id}/cancel`, {}).then((r) => r.booking),
  myListings: () => request<{ listings: OwnedListing[]; bookings: OwnerBooking[] }>('/api/me/listings'),
  updateListing: (id: string, changes: Partial<CreateListingInput>) =>
    request<{ listing: Listing }>(`/api/listings/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(changes) }).then((r) => r.listing),
  deleteListing: (id: string) => request<{ ok: true }>(`/api/listings/${id}`, { method: 'DELETE' }),
}

export type Me = { id: string; email: string; name: string }
export type AppNotification = {
  id: string
  created_at: string
  read_at: string | null
  type: 'booking_received' | 'booking_cancelled' | 'booking_declined'
  booking: { id: string; start_date: string; end_date: string; days: number; total: number; advance: number; status: string; borrower_name: string; borrower_contact: string; listing: { id: string; title: string; image_url: string; area: string; owner_name?: string } } | null
}
export type OwnedListing = Listing & { owner_contact: string }
export type OwnerBooking = { id: string; listing_id: string; start_date: string; end_date: string; days: number; total: number; advance: number; status: 'confirmed' | 'cancelled'; cancelled_by: 'borrower' | 'owner' | null; borrower_name: string; borrower_contact: string; listing: { title: string; image_url: string; area: string } }
