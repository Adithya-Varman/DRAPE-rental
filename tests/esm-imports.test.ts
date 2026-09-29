// Vercel runs each api/ file as native Node ESM ("type": "module"), which needs explicit extensions on relative
// imports. An extensionless import builds fine locally but crashes every function in production.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : []
})

describe('server-side ESM imports', () => {
  it.each([...files('api'), ...files('shared')])('%s uses .js extensions on relative imports', (file) => {
    const bad = [...readFileSync(file, 'utf8').matchAll(/from '(\.{1,2}\/[^']+)'/g)].map((m) => m[1]).filter((p) => !p.endsWith('.js'))
    expect(bad).toEqual([])
  })
})
