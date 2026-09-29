import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { match, POST, ROUTES } from '../api/router.js'

describe('single-function API router', () => {
  it('maps flat, nested and :id routes', () => {
    expect(match('/api/areas')).toBe(ROUTES.find(([p]) => p === '/api/areas')![1])
    expect(match('/api/listings')).toBe(ROUTES.find(([p]) => p === '/api/listings')![1])
    expect(match('/api/listings/6f1c2a4e-9b1d-4c3e-8f7a-1234567890ab/contact')).toBe(ROUTES.find(([p]) => p === '/api/listings/:id/contact')![1])
  })
  it('prefers static segments over :id', () => {
    expect(match('/api/listings/analyze')).toBe(ROUTES.find(([p]) => p === '/api/listings/analyze')![1])
    expect(match('/api/bookings/mine')).toBe(ROUTES.find(([p]) => p === '/api/bookings/mine')![1])
  })
  it('never exposes private modules or unknown paths', () => {
    expect(match('/api/_lib/http')).toBeNull()
    expect(match('/api/_routes/areas')).toBeNull()
    expect(match('/api/nope')).toBeNull()
  })
  it('rebuilds the original path from the Vercel rewrite and keeps the query and body', async () => {
    const res = await POST(new Request('http://x/api/router?__path=nope/deeper&a=1', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(404)
    const wrongMethod = await POST(new Request('http://x/api/router?__path=areas', { method: 'POST', body: '{}' }))
    expect(wrongMethod.status).toBe(405)
  })
  it('registers every route module (a new file in api/_routes must be added to the table)', () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n)])
    const routeFiles = files('api/_routes').length
    expect(ROUTES).toHaveLength(routeFiles)
  })
  it('keeps the deployment to one function (Hobby plan allows 12)', () => {
    const functions = readdirSync('api').filter((n) => n.endsWith('.ts') && !n.startsWith('_'))
    expect(functions).toEqual(['router.ts'])
  })
})
