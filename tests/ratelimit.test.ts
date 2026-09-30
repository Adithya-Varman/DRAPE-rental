import { describe, expect, it, vi } from 'vitest'

let rpcResult: { data: unknown; error: unknown } = { data: true, error: null }
vi.mock('../api/_lib/supabase', async (orig) => ({ ...(await orig<typeof import('../api/_lib/supabase')>()), db: () => ({ rpc: async () => rpcResult }) }))
const { clientIp, enforceLimit } = await import('../api/_lib/ratelimit.js')

describe('rate limiting', () => {
  it('lets requests through while under the limit', async () => {
    rpcResult = { data: true, error: null }
    await expect(enforceLimit('k', 60, 5)).resolves.toBeUndefined()
  })
  it('answers 429 with a retry time once over the limit', async () => {
    rpcResult = { data: false, error: null }
    await expect(enforceLimit('k', 60, 5)).rejects.toMatchObject({ status: 429, retryAfterSeconds: 60 })
  })
  it('fails open if the limiter itself is down', async () => {
    rpcResult = { data: null, error: { message: 'db down' } }
    await expect(enforceLimit('k', 60, 5)).resolves.toBeUndefined()
  })
  it('keys on the first forwarded IP', () => {
    expect(clientIp(new Request('http://x/', { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } }))).toBe('203.0.113.7')
    expect(clientIp(new Request('http://x/'))).toBe('unknown')
  })
})
