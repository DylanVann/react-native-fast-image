// Serves the example app's images (images/) so it doesn't depend on remote
// servers. scripts/verify.mts starts it; to run it yourself:
//
//   bun ReactNativeFastImageExampleServer/server.ts
//
// Query strings are ignored (the examples add ?bust=… to skip the cache), and
// anything that isn't a file under images/ is a 404. For testing headers, a
// path can start with:
//
//   /private/   403 unless the request has `x-token: fast-image`.
//   /no-token/  400 if the request has an `x-token` header (headers meant for
//               one request must not be sent with others).
//   /max-age/   Sent with `Cache-Control: max-age=3600` (for HTTP caching).
//
// GET /requests?path=<path and query> returns how many times it was requested,
// so a test can check what was loaded from the network: `{ "count": 1 }`.

import path from 'node:path'

const IMAGES = path.join(import.meta.dir, 'images')
const PORT = Number(process.env.PORT ?? 8090)
const requests = new Map<string, number>()

const server = Bun.serve({
    port: PORT,
    async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/requests') {
            const key = url.searchParams.get('path') ?? ''
            return Response.json({ count: requests.get(key) ?? 0 })
        }
        const key = url.pathname + url.search
        requests.set(key, (requests.get(key) ?? 0) + 1)

        let { pathname } = url
        let cacheControl: string | undefined
        const token = request.headers.get('x-token')
        if (pathname.startsWith('/private/')) {
            if (token !== 'fast-image') {
                return new Response('Forbidden', { status: 403 })
            }
            pathname = pathname.slice('/private'.length)
        } else if (pathname.startsWith('/no-token/')) {
            if (token !== null) {
                return new Response('Unexpected x-token header', {
                    status: 400,
                })
            }
            pathname = pathname.slice('/no-token'.length)
        } else if (pathname.startsWith('/max-age/')) {
            cacheControl = 'max-age=3600'
            pathname = pathname.slice('/max-age'.length)
        }
        const file = path.join(IMAGES, decodeURIComponent(pathname))
        if (!file.startsWith(IMAGES + path.sep)) {
            return new Response('Not found', { status: 404 })
        }
        const image = Bun.file(file)
        if (!(await image.exists())) {
            return new Response('Not found', { status: 404 })
        }
        return new Response(
            image,
            cacheControl ? { headers: { 'Cache-Control': cacheControl } } : {},
        )
    },
})

console.log(`Serving ${IMAGES} at ${server.url}`)
