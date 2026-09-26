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
//   /chunked/   Streamed without a Content-Length (the size is unknown).
//   /cookie/    403 unless the request has both cookies from /set-cookie with
//               the same `run` query parameter; the image is sent with its own
//               cookie (`fast-image-image=<run>`).
//
// GET /set-cookie?run=<run> sets two cookies (`fast-image-a=<run>` and
// `fast-image-b=<run>`; a new run value each time, so cookies kept from
// earlier runs don't count), and GET /cookies returns the request's Cookie
// header: `{ "cookie": "…" }`.
//
// GET /requests?path=<path and query> returns how many times it was requested,
// so a test can check what was loaded from the network: `{ "count": 1 }`.
// GET /requests?group=<group> returns how many requests the slow server got
// with that `group` query parameter, and the most of them in flight at the
// same time: `{ "count": 4, "peak": 3 }` (for checking a concurrency limit).
//
// /regression is a WebSocket relay for the example's regression runner
// (ReactNativeFastImageExample/src/RegressionRunner.tsx): the app connects with
// ?role=app&platform=<ios|android>, scripts/verify.mts with ?role=controller
// &platform=<the same>. Messages from the app go to that platform's controllers
// and the other way round, unchanged; controllers also get
// `{ "type": "app", "connected": true|false }` when the app connects or goes.
// A plain GET /regression?platform=<platform> answers whether a controller is
// connected (`{ "controller": true }`): the app asks on launch, and shows the
// runner instead of its tabs if one is.
//
// On the next port (8091), the same images are sent slowly: in 8 parts, one a
// second (about 7 s in all; `?delay=<ms>` sets the pause between parts, 50 to
// 5000), with a Content-Length (for progress), and only with `x-token:
// fast-image`. A test can do something while they load (e.g. send the app to
// the background). It's a node:http server because Bun.serve
// sends streamed responses chunked, ignoring their Content-Length
// (oven-sh/bun#10507, still the case in Bun 1.4.2).

import http from 'node:http'
import path from 'node:path'
import type { ServerWebSocket } from 'bun'

const IMAGES = path.join(import.meta.dir, 'images')
const PORT = Number(process.env.PORT ?? 8090)
const SLOW_PORT = PORT + 1
const requests = new Map<string, number>()
// Per `group` query parameter on the slow server: requests, requests in
// flight now, and the most in flight at the same time.
const groups = new Map<
    string,
    { count: number; active: number; peak: number }
>()

type Socket = ServerWebSocket<{ role: 'app' | 'controller'; platform: string }>
const apps = new Map<string, Socket>()
const controllers = new Map<string, Set<Socket>>()
const controllersFor = (platform: string) => {
    let set = controllers.get(platform)
    if (!set) controllers.set(platform, (set = new Set()))
    return set
}

const server = Bun.serve({
    port: PORT,
    async fetch(request, server) {
        const url = new URL(request.url)
        if (url.pathname === '/regression') {
            const role = url.searchParams.get('role')
            const platform = url.searchParams.get('platform') ?? ''
            if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
                return Response.json({
                    controller: controllersFor(platform).size > 0,
                })
            }
            if (role !== 'app' && role !== 'controller') {
                return new Response('role must be app or controller', {
                    status: 400,
                })
            }
            return server.upgrade(request, { data: { role, platform } })
                ? undefined
                : new Response('WebSocket upgrade failed', { status: 400 })
        }
        if (url.pathname === '/requests') {
            const group = url.searchParams.get('group')
            if (group !== null) {
                const stats = groups.get(group)
                return Response.json({
                    count: stats?.count ?? 0,
                    peak: stats?.peak ?? 0,
                })
            }
            const key = url.searchParams.get('path') ?? ''
            return Response.json({ count: requests.get(key) ?? 0 })
        }
        const run = url.searchParams.get('run') ?? ''
        if (url.pathname === '/set-cookie') {
            const headers = new Headers()
            headers.append('Set-Cookie', `fast-image-a=${run}; Path=/`)
            headers.append('Set-Cookie', `fast-image-b=${run}; Path=/`)
            return new Response('ok', { headers })
        }
        if (url.pathname === '/cookies') {
            return Response.json({
                cookie: request.headers.get('cookie') ?? '',
            })
        }
        const key = url.pathname + url.search
        requests.set(key, (requests.get(key) ?? 0) + 1)

        let { pathname } = url
        let cacheControl: string | undefined
        let chunked = false
        let setCookie: string | undefined
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
        } else if (pathname.startsWith('/chunked/')) {
            chunked = true
            pathname = pathname.slice('/chunked'.length)
        } else if (pathname.startsWith('/cookie/')) {
            const cookie = request.headers.get('cookie') ?? ''
            const cookies = cookie.split(/;\s*/)
            if (
                !cookies.includes(`fast-image-a=${run}`) ||
                !cookies.includes(`fast-image-b=${run}`)
            ) {
                return new Response(`Missing cookies: ${cookie}`, {
                    status: 403,
                })
            }
            setCookie = `fast-image-image=${run}; Path=/`
            pathname = pathname.slice('/cookie'.length)
        }
        const file = path.join(IMAGES, decodeURIComponent(pathname))
        if (!file.startsWith(IMAGES + path.sep)) {
            return new Response('Not found', { status: 404 })
        }
        const image = Bun.file(file)
        if (!(await image.exists())) {
            return new Response('Not found', { status: 404 })
        }
        if (chunked) {
            // A stream of unknown length is sent without a Content-Length.
            const bytes = new Uint8Array(await image.arrayBuffer())
            const stream = new ReadableStream({
                start(controller) {
                    for (let i = 0; i < bytes.length; i += 65536) {
                        controller.enqueue(bytes.subarray(i, i + 65536))
                    }
                    controller.close()
                },
            })
            return new Response(stream, {
                headers: { 'Content-Type': image.type },
            })
        }
        const headers = new Headers()
        if (cacheControl) headers.set('Cache-Control', cacheControl)
        if (setCookie) headers.append('Set-Cookie', setCookie)
        return new Response(image, { headers })
    },
    websocket: {
        open(ws: Socket) {
            const { role, platform } = ws.data
            if (role === 'app') {
                apps.get(platform)?.close()
                apps.set(platform, ws)
                for (const c of controllersFor(platform))
                    c.send(JSON.stringify({ type: 'app', connected: true }))
            } else {
                controllersFor(platform).add(ws)
                ws.send(
                    JSON.stringify({
                        type: 'app',
                        connected: apps.has(platform),
                    }),
                )
            }
        },
        message(ws: Socket, message) {
            const { role, platform } = ws.data
            const text =
                typeof message === 'string' ? message : message.toString()
            if (role === 'app') {
                for (const c of controllersFor(platform)) c.send(text)
            } else {
                apps.get(platform)?.send(text)
            }
        },
        close(ws: Socket) {
            const { role, platform } = ws.data
            if (role === 'app') {
                if (apps.get(platform) === ws) {
                    apps.delete(platform)
                    for (const c of controllersFor(platform))
                        c.send(
                            JSON.stringify({ type: 'app', connected: false }),
                        )
                }
            } else {
                controllersFor(platform).delete(ws)
            }
        },
    },
})

console.log(`Serving ${IMAGES} at ${server.url}`)

http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const key = `slow:${url.pathname}${url.search}`
    requests.set(key, (requests.get(key) ?? 0) + 1)
    const group = url.searchParams.get('group')
    if (group !== null) {
        const stats = groups.get(group) ?? { count: 0, active: 0, peak: 0 }
        groups.set(group, stats)
        stats.count++
        stats.active++
        stats.peak = Math.max(stats.peak, stats.active)
        // In flight until the response ends or the client goes away.
        let done = false
        const finish = () => {
            if (done) return
            done = true
            stats.active--
        }
        response.once('finish', finish)
        response.once('close', finish)
    }
    if (request.headers['x-token'] !== 'fast-image') {
        response.writeHead(403).end('Forbidden')
        return
    }
    const file = path.join(IMAGES, decodeURIComponent(url.pathname))
    const image = Bun.file(file)
    if (!file.startsWith(IMAGES + path.sep) || !(await image.exists())) {
        response.writeHead(404).end('Not found')
        return
    }
    const bytes = new Uint8Array(await image.arrayBuffer())
    response.writeHead(200, {
        'Content-Type': image.type,
        'Content-Length': String(bytes.length),
    })
    const parts = 8
    const delay = Math.min(
        5000,
        Math.max(50, Number(url.searchParams.get('delay')) || 1000),
    )
    const size = Math.ceil(bytes.length / parts)
    for (let part = 0; part < parts; part++) {
        // The client went away (e.g. the app cancelled the load).
        if (response.destroyed) return
        response.write(bytes.subarray(part * size, (part + 1) * size))
        if (part < parts - 1) await Bun.sleep(delay)
    }
    response.end()
}).listen(SLOW_PORT, () => {
    console.log(`Serving them slowly at http://localhost:${SLOW_PORT}/`)
})
