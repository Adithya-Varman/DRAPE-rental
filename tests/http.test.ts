import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { HttpError, json, route } from '../api/_lib/http'

describe('route()', () => {
  it('passes successful responses through', async () => {
    const res = await route(async () => json({ ok: true }))(new Request('http://x/'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
  it('turns HttpError into a JSON error with its status', async () => {
    const res = await route(async () => { throw new HttpError(404, 'missing') })(new Request('http://x/'))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'missing' })
  })
  it('turns ZodError into a 400', async () => {
    const res = await route(async () => { z.number().parse('no'); return json(null) })(new Request('http://x/'))
    expect(res.status).toBe(400)
  })
})
