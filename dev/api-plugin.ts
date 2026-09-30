// Serves /api/* during `npm run dev` through the same single router Vercel runs in production (api/router.ts),
// so the full stack runs locally without `vercel dev`.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { loadEnv, type Plugin } from 'vite'

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
  // Set-Cookie must stay separate headers (Headers.forEach would join several cookies into one broken value).
  response.headers.forEach((value, key) => { if (key !== 'set-cookie') res.setHeader(key, value) })
  const cookies = response.headers.getSetCookie()
  if (cookies.length) res.setHeader('set-cookie', cookies)
  res.end(Buffer.from(await response.arrayBuffer()))
}

export function apiPlugin(): Plugin {
  return {
    name: 'drape-dev-api',
    apply: 'serve',
    configureServer(server) {
      // Expose non-VITE_ secrets from .env.local to handlers, mirroring Vercel's server-side env.
      Object.assign(process.env, loadEnv(server.config.mode, server.config.root, ''))
      const routerFile = resolve(server.config.root, 'api/router.ts')
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') return next()
        try {
          const router = await server.ssrLoadModule(routerFile)
          const handler = router[(req.method ?? 'GET').toUpperCase()]
          if (typeof handler !== 'function') return send(res, Response.json({ error: 'method_not_allowed' }, { status: 405 }))
          await send(res, await handler(await toRequest(req)))
        } catch (error) {
          server.config.logger.error(String((error as Error).stack ?? error))
          await send(res, Response.json({ error: 'internal_error' }, { status: 500 }))
        }
      })
    },
  }
}
