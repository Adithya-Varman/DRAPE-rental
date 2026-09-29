// Serves /api/* handlers during `npm run dev` using the same file-based routing Vercel uses in production,
// so the full stack runs locally without `vercel dev`.
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadEnv, type Plugin } from 'vite'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

// Resolve /api/listings/abc/contact → api/listings/[id]/contact.ts (static segments win over [param] ones).
export function resolveRoute(apiDir: string, pathname: string): string | null {
  const segments = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  const walk = (dir: string, rest: string[]): string | null => {
    if (rest.length === 0) {
      const index = join(dir, 'index.ts')
      return existsSync(index) ? index : null
    }
    const [head, ...tail] = rest
    if (head.startsWith('_') || head.startsWith('.')) return null
    if (tail.length === 0 && existsSync(join(dir, `${head}.ts`))) return join(dir, `${head}.ts`)
    if (existsSync(join(dir, head))) {
      const found = walk(join(dir, head), tail)
      if (found) return found
    }
    if (!existsSync(dir)) return null
    for (const entry of readdirSync(dir)) {
      if (!/^\[[^\]]+\](\.ts)?$/.test(entry)) continue
      if (entry.endsWith('.ts') && tail.length === 0) return join(dir, entry)
      if (!entry.endsWith('.ts')) {
        const found = walk(join(dir, entry), tail)
        if (found) return found
      }
    }
    return null
  }
  return walk(apiDir, segments)
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v))
    else if (value !== undefined) headers.set(key, value)
  }
  const method = req.method ?? 'GET'
  return new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  })
}

async function send(res: ServerResponse, response: Response) {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.end(Buffer.from(await response.arrayBuffer()))
}

export function apiPlugin(): Plugin {
  return {
    name: 'drape-dev-api',
    apply: 'serve',
    configureServer(server) {
      // Expose non-VITE_ secrets from .env.local to handlers, mirroring Vercel's server-side env.
      Object.assign(process.env, loadEnv(server.config.mode, server.config.root, ''))
      const apiDir = resolve(server.config.root, 'api')
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') return next()
        const file = resolveRoute(apiDir, url.pathname)
        if (!file) return send(res, Response.json({ error: 'not_found' }, { status: 404 }))
        try {
          const mod = await server.ssrLoadModule(file)
          const method = (req.method ?? 'GET').toUpperCase() as typeof METHODS[number]
          const handler = mod[method]
          if (typeof handler !== 'function') {
            return send(res, Response.json({ error: 'method_not_allowed' }, { status: 405 }))
          }
          await send(res, await handler(await toRequest(req)))
        } catch (error) {
          server.config.logger.error(String((error as Error).stack ?? error))
          await send(res, Response.json({ error: 'internal_error' }, { status: 500 }))
        }
      })
    },
  }
}
