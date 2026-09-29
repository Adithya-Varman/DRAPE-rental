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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    throw new ApiError(0, 'network', 'You seem to be offline — check your connection and try again.')
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const code = typeof body.error === 'string' ? body.error : 'error'
    const message = code === 'rate_limited'
      ? `Our AI is busy right now — try again in ${body.retry_after ?? 30} seconds.`
      : typeof body.message === 'string' ? body.message : 'Something went wrong. Please try again.'
    throw new ApiError(response.status, code, message, body)
  }
  return body as T
}

const post = <T>(path: string, data: unknown) =>
  request<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })

export const api = {
  areas: () => request<{ areas: Area[] }>('/api/areas').then((r) => r.areas),
  listings: (params: { occasion?: string; limit?: number } = {}) => {
    const query = new URLSearchParams()
    if (params.occasion) query.set('occasion', params.occasion)
    if (params.limit) query.set('limit', String(params.limit))
    return request<{ listings: Listing[] }>(`/api/listings?${query}`).then((r) => r.listings)
  },
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
  myBookings: (keys: { id: string; token: string }[]) => post<{ bookings: Booking[] }>('/api/bookings/lookup', { bookings: keys }).then((r) => r.bookings),
}
