// Makes the benchmark's images: photos from picsum.photos, each tinted to its
// own color. A tinted photo keeps a photo's detail, so it costs what a photo
// costs to download and decode, and it has its own average color, so a screen
// recording shows when each image appears, in which cell. Writes
// out/<set>/<index>.jpg and out/manifest.json (each image's key, size, bytes
// and average color); `wrangler deploy` uploads them with worker.ts, which
// serves them.
//
//   bun make-images.ts
//
// The photos are downloaded once into .cache/. The output is deterministic
// for the same picsum photos, so running it again gives the same set.

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const DIR = import.meta.dir
const CACHE = path.join(DIR, '.cache')
const OUT = path.join(DIR, 'out')

// One set per scenario (see PLAN-benchmark.local.md). `large` uses photos
// that are at least that large originally, so they aren't scaled up.
const SETS = [
    { name: 'grid', count: 60, width: 400, height: 400 },
    { name: 'scroll', count: 500, width: 300, height: 300 },
    { name: 'large', count: 20, width: 4000, height: 3000, large: true },
] as const

const QUALITY = 82

type Photo = { id: string; width: number; height: number }

// Every photo on picsum.photos, in its list's order.
async function listPhotos(): Promise<Photo[]> {
    const file = path.join(CACHE, 'list.json')
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
    const photos: Photo[] = []
    for (let page = 1; ; page++) {
        const response = await fetch(
            `https://picsum.photos/v2/list?page=${page}&limit=100`,
        )
        const items = (await response.json()) as Photo[]
        if (items.length === 0) break
        photos.push(
            ...items.map(({ id, width, height }) => ({ id, width, height })),
        )
    }
    fs.mkdirSync(CACHE, { recursive: true })
    fs.writeFileSync(file, JSON.stringify(photos))
    return photos
}

async function download(id: string, width: number, height: number) {
    const file = path.join(CACHE, 'picsum', `${id}-${width}x${height}.jpg`)
    if (!fs.existsSync(file)) {
        const response = await fetch(
            `https://picsum.photos/id/${id}/${width}/${height}.jpg`,
        )
        if (!response.ok) {
            throw new Error(`picsum ${id}: ${response.status}`)
        }
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()))
    }
    return file
}

// The i-th tint: hues a golden angle apart, so neighbors differ a lot.
function tint(i: number) {
    const hue = (i * 137.508) % 360
    const s = 0.8
    const l = 0.5
    const f = (n: number) => {
        const k = (n + hue / 30) % 12
        const a = s * Math.min(l, 1 - l)
        return Math.round(
            255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))),
        )
    }
    return { r: f(0), g: f(8), b: f(4) }
}

const hex = (c: { r: number; g: number; b: number }) =>
    '#' +
    [c.r, c.g, c.b]
        .map((v) => Math.round(v).toString(16).padStart(2, '0'))
        .join('')

// Runs `work` over `items`, `limit` at a time.
async function pool<T, R>(
    items: T[],
    limit: number,
    work: (item: T, index: number) => Promise<R>,
) {
    const results: R[] = []
    let next = 0
    await Promise.all(
        Array.from({ length: limit }, async () => {
            while (next < items.length) {
                const index = next++
                results[index] = await work(items[index], index)
            }
        }),
    )
    return results
}

const photos = await listPhotos()
fs.rmSync(OUT, { recursive: true, force: true })
const manifest: Record<string, unknown> = {}
for (const set of SETS) {
    const candidates =
        'large' in set
            ? photos.filter(
                  (p) => p.width >= set.width && p.height >= set.height,
              )
            : photos
    if (candidates.length < set.count) {
        throw new Error(`${set.name}: only ${candidates.length} photos`)
    }
    const images = await pool(
        candidates.slice(0, set.count),
        8,
        async (photo, index) => {
            const source = await download(photo.id, set.width, set.height)
            const key = `${set.name}/${index}.jpg`
            const file = path.join(OUT, key)
            fs.mkdirSync(path.dirname(file), { recursive: true })
            await sharp(source)
                .tint(tint(index))
                .jpeg({ quality: QUALITY })
                .toFile(file)
            const { channels } = await sharp(file).stats()
            const [r, g, b] = channels.map((channel) => channel.mean)
            return {
                key,
                photo: photo.id,
                bytes: fs.statSync(file).size,
                color: hex({ r, g, b }),
            }
        },
    )
    manifest[set.name] = { width: set.width, height: set.height, images }
    console.log(`${set.name}: ${images.length} images`)
}
fs.writeFileSync(
    path.join(OUT, 'manifest.json'),
    JSON.stringify({ version: 1, quality: QUALITY, sets: manifest }, null, 2),
)
