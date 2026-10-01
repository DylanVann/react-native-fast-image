// Serves the benchmark's images (made by make-images.ts), the same way for
// every request, so runs differ by the component and the network, not the
// server. They're the Worker's static assets (deployed from out/ with it),
// which Cloudflare keeps in its edge cache: most requests take 0 ms here
// (R2 took 90–490 ms each).
//
//   GET /<set>/<index>.jpg?run=<run id>[&delay=<ms>]
//   GET /manifest.json
//
// The query is left out of the lookup: `run` only makes each run's urls new
// to the devices' caches (so no image comes from an earlier run), and
// `delay` adds that many milliseconds before responding (at most 10 s), for a
// fixed added latency. Responses have a long Cache-Control (the manifest
// none), and Server-Timing with how long the lookup took, so a run can tell a
// slow server from a slow component.

interface Env {
    ASSETS: Fetcher
}

const MAX_DELAY = 10_000

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            return new Response('Method not allowed', { status: 405 })
        }
        const url = new URL(request.url)
        const key = decodeURIComponent(url.pathname.slice(1))
        if (!/^(manifest\.json|[a-z]+\/\d+\.jpg)$/.test(key)) {
            return new Response('Not found', { status: 404 })
        }
        const delay = Math.min(
            MAX_DELAY,
            Math.max(0, Number(url.searchParams.get('delay')) || 0),
        )
        if (delay > 0) await new Promise((r) => setTimeout(r, delay))
        const start = Date.now()
        const asset = await env.ASSETS.fetch(
            new Request(`${url.origin}/${key}`, { method: request.method }),
        )
        if (!asset.ok) return new Response('Not found', { status: 404 })
        const headers = new Headers(asset.headers)
        headers.set(
            'Cache-Control',
            key.endsWith('.json')
                ? 'no-store'
                : 'public, max-age=31536000, immutable',
        )
        headers.set('Server-Timing', `assets;dur=${Date.now() - start}`)
        headers.set('Access-Control-Allow-Origin', '*')
        headers.set('Timing-Allow-Origin', '*')
        return new Response(asset.body, { status: asset.status, headers })
    },
} satisfies ExportedHandler<Env>
