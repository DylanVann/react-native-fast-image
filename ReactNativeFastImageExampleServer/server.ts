// Serves the example app's images (images/) so it doesn't depend on remote
// servers. scripts/verify.mts starts it; to run it yourself:
//
//   bun ReactNativeFastImageExampleServer/server.ts
//
// Query strings are ignored (the examples add ?bust=… to skip the cache), and
// anything that isn't a file under images/ is a 404.

import path from 'node:path'

const IMAGES = path.join(import.meta.dir, 'images')
const PORT = Number(process.env.PORT ?? 8090)

const server = Bun.serve({
    port: PORT,
    async fetch(request) {
        const { pathname } = new URL(request.url)
        const file = path.join(IMAGES, decodeURIComponent(pathname))
        if (!file.startsWith(IMAGES + path.sep)) {
            return new Response('Not found', { status: 404 })
        }
        const image = Bun.file(file)
        if (!(await image.exists())) {
            return new Response('Not found', { status: 404 })
        }
        return new Response(image)
    },
})

console.log(`Serving ${IMAGES} at ${server.url}`)
