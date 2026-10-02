// Makes the benchmark's images: photos from picsum.photos, each tinted to its
// own color. A tinted photo keeps a photo's detail, so it costs what a photo
// costs to download and decode, and it has its own average color, so a screen
// recording shows when each image appears, in which cell. Writes
// out/<set>/<index>.jpg and out/manifest.json (each image's key, photo, bytes
// and average color), which the benchmark's tests serve on the phone (see
// ../README.md).
//
//   bun make-images.ts
//
// The photos are the ones in photos.json (picsum ids, per set), downloaded
// once into .cache/, so every run of this makes the same set.

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const DIR = import.meta.dir
const CACHE = path.join(DIR, '.cache')
const OUT = path.join(DIR, 'out')

// One set per scenario (see ../README.md). The `large` set's photos are at
// least that large originally, so they aren't scaled up.
const SETS = [
    { name: 'grid', width: 400, height: 400 },
    { name: 'scroll', width: 300, height: 300 },
    { name: 'large', width: 4000, height: 3000 },
] as const

const QUALITY = 82

const PHOTOS: Record<string, string[]> = JSON.parse(
    fs.readFileSync(path.join(DIR, 'photos.json'), 'utf8'),
)

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

fs.rmSync(OUT, { recursive: true, force: true })
const manifest: Record<string, unknown> = {}
for (const set of SETS) {
    const images = await pool(PHOTOS[set.name], 8, async (photo, index) => {
        const source = await download(photo, set.width, set.height)
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
            photo,
            bytes: fs.statSync(file).size,
            color: hex({ r, g, b }),
        }
    })
    manifest[set.name] = { width: set.width, height: set.height, images }
    console.log(`${set.name}: ${images.length} images`)
}
fs.writeFileSync(
    path.join(OUT, 'manifest.json'),
    JSON.stringify({ version: 1, quality: QUALITY, sets: manifest }, null, 2),
)
