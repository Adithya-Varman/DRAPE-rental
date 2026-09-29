import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveRoute } from '../dev/api-plugin'

const dir = mkdtempSync(join(tmpdir(), 'drape-api-'))
for (const file of ['areas.ts', 'search.ts', 'listings/index.ts', 'listings/analyze.ts', 'listings/[id]/contact.ts', '_lib/http.ts']) {
  mkdirSync(join(dir, file, '..'), { recursive: true })
  writeFileSync(join(dir, file), '')
}

describe('resolveRoute (Vercel-style file routing for dev)', () => {
  it('maps flat and index routes', () => {
    expect(resolveRoute(dir, '/api/areas')).toBe(join(dir, 'areas.ts'))
    expect(resolveRoute(dir, '/api/listings')).toBe(join(dir, 'listings/index.ts'))
  })
  it('prefers static segments over dynamic ones', () => {
    expect(resolveRoute(dir, '/api/listings/analyze')).toBe(join(dir, 'listings/analyze.ts'))
  })
  it('matches dynamic [id] directories', () => {
    expect(resolveRoute(dir, '/api/listings/1234/contact')).toBe(join(dir, 'listings/[id]/contact.ts'))
  })
  it('never exposes private _lib modules or unknown paths', () => {
    expect(resolveRoute(dir, '/api/_lib/http')).toBeNull()
    expect(resolveRoute(dir, '/api/nope')).toBeNull()
  })
})
