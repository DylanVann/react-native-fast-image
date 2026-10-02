// Finds when each image showed in a run's screen recording (see run.ts).
//
// The app's results say where each cell is (in points) and what's in it; the
// recording (from capture, at the device's pixel size) is decoded at a
// fraction of its size. The start is the first frame in which the marker bar
// is green (the app turns it green as it mounts the images) and the cells are
// still empty. A cell's image
// has shown in the first frame whose average color (of the middle of the
// cell) is more than halfway from the placeholder's to the cell's final color
// (the last frame's), so a fade-in counts from its middle. Only cells fully
// on screen are timed. The phone's recording can stall and resume with a
// stale frame: a run where an image shows long before its load event, or
// never shows although it loaded, is an error (run.ts runs it again).

import { spawn, spawnSync } from 'node:child_process'

export type Rect = { x: number; y: number; width: number; height: number }

export type Results = {
    scale: number
    window: { width: number; height: number }
    marker?: Rect
    placeholder: string
    images: {
        index: number
        key: string
        color: string
        rect?: Rect
        loadMs?: number
        errorMs?: number
    }[]
}

export type Analysis = {
    // ms from the marker's green frame to each timed image's frame.
    images: {
        index: number
        shownMs?: number
        // loadMs minus shownMs: positive when the load event came after the
        // pixels. Includes the marker's own drawing delay (about a frame).
        eventGapMs?: number
        // The final color is far from the image's average: another image, or
        // none, shows there.
        mismatch?: boolean
    }[]
    firstMs?: number
    allMs?: number
    timed: number
    notShown: number
    frames: number
    error?: string
}

// The recording is decoded at 1/DOWNSCALE of its size.
const DOWNSCALE = 6
// The longest an image's load event can come after its pixels before the
// recording is taken to have stalled: the largest seen otherwise is about
// 100 ms, on a busy JS thread.
const STALL_MS = 500

type Rgb = [number, number, number]

const parseHex = (hex: string): Rgb => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
]

// CIE Lab (D65), for perceptual color distances.
function lab([r, g, b]: Rgb): Rgb {
    const lin = (c: number) => {
        c /= 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    const [lr, lg, lb] = [lin(r), lin(g), lin(b)]
    const x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047
    const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722
    const z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883
    const f = (t: number) =>
        t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

const distance = (a: Rgb, b: Rgb) => {
    const [l1, a1, b1] = lab(a)
    const [l2, a2, b2] = lab(b)
    return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

function capture(cmd: string, args: string[]) {
    const result = spawnSync(cmd, args, { maxBuffer: 1 << 30 })
    if (result.status !== 0) {
        throw new Error(`${cmd} failed: ${String(result.stderr).slice(-500)}`)
    }
    return result.stdout
}

// Decodes the video at a fraction of its size, one frame at a time, calling
// `onFrame` with each frame's pixels (rgb24).
async function eachFrame(
    video: string,
    width: number,
    height: number,
    onFrame: (frame: Uint8Array) => void,
) {
    const frameSize = width * height * 3
    const ffmpeg = spawn('ffmpeg', [
        '-v',
        'error',
        '-i',
        video,
        '-vf',
        `scale=${width}:${height}:flags=area`,
        '-fps_mode',
        'passthrough',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        '-',
    ])
    let stderr = ''
    ffmpeg.stderr.on('data', (d) => (stderr += d))
    let pending: Buffer = Buffer.alloc(0)
    for await (const chunk of ffmpeg.stdout) {
        pending = pending.length
            ? Buffer.concat([pending, chunk])
            : (chunk as Buffer)
        while (pending.length >= frameSize) {
            onFrame(pending.subarray(0, frameSize))
            pending = pending.subarray(frameSize)
        }
    }
    const code = await new Promise<number>((resolve) =>
        ffmpeg.on('close', (c) => resolve(c ?? 1)),
    )
    if (code !== 0) throw new Error(`ffmpeg failed: ${stderr.slice(-500)}`)
}

export async function analyze(
    results: Results,
    video: string,
): Promise<Analysis> {
    const probe = String(
        capture('ffprobe', [
            '-v',
            'error',
            '-select_streams',
            'v:0',
            '-show_entries',
            'stream=width,height',
            '-of',
            'csv=p=0',
            video,
        ]),
    ).trim()
    const [fullWidth, fullHeight] = probe.split(',').map(Number)
    const width = Math.floor(fullWidth / DOWNSCALE)
    const height = Math.floor(fullHeight / DOWNSCALE)
    const times = String(
        capture('ffprobe', [
            '-v',
            'error',
            '-select_streams',
            'v:0',
            '-show_entries',
            'frame=pts_time',
            '-of',
            'csv=p=0',
            video,
        ]),
    )
        .trim()
        .split('\n')
        // A frame's line can end with a comma (side data).
        .map((line) => parseFloat(line))
    // Points to the decoded frame's pixels.
    const px = fullWidth / results.window.width / DOWNSCALE

    // The average color of a rect's middle (inset by `inset` of its size).
    const average = (data: Uint8Array, rect: Rect, inset: number): Rgb => {
        const x0 = Math.round((rect.x + rect.width * inset) * px)
        const x1 = Math.round((rect.x + rect.width * (1 - inset)) * px)
        const y0 = Math.round((rect.y + rect.height * inset) * px)
        const y1 = Math.round((rect.y + rect.height * (1 - inset)) * px)
        let r = 0
        let g = 0
        let b = 0
        let n = 0
        for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) {
            for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) {
                const i = (y * width + x) * 3
                r += data[i]
                g += data[i + 1]
                b += data[i + 2]
                n++
            }
        }
        return n ? [r / n, g / n, b / n] : [0, 0, 0]
    }

    const empty: Analysis = { images: [], timed: 0, notShown: 0, frames: 0 }
    if (!results.marker) return { ...empty, error: 'no marker' }
    const marker = results.marker
    const onScreen = (rect?: Rect): rect is Rect =>
        !!rect &&
        rect.x >= 0 &&
        rect.y >= 0 &&
        rect.x + rect.width <= results.window.width &&
        rect.y + rect.height <= results.window.height
    const timedImages = results.images.filter((image) => onScreen(image.rect))
    // Each frame's marker and cell colors: all that's kept of the video.
    const markerColors: Rgb[] = []
    const cellColors: Rgb[][] = []
    await eachFrame(video, width, height, (data) => {
        markerColors.push(average(data, marker, 0.2))
        cellColors.push(
            timedImages.map((image) => average(data, image.rect!, 0.2)),
        )
    })
    const frames = Math.min(times.length, markerColors.length)
    if (frames === 0) return { ...empty, error: 'no frames' }

    // The start: the first frame with the marker green and the cells still
    // showing the placeholder. The recording can begin on an earlier run's
    // screen, and iOS can show a snapshot of it while the app launches again:
    // both have a green marker, but with images in the cells.
    const green: Rgb = [0, 255, 0]
    const placeholder = parseHex(results.placeholder)
    const empty_ = (f: number) =>
        cellColors[f].filter((color) => distance(color, placeholder) < 10)
            .length >=
        0.8 * timedImages.length
    let start = -1
    for (let f = 0; f < frames; f++) {
        if (distance(markerColors[f], green) < 20 && empty_(f)) {
            start = f
            break
        }
    }
    if (start < 0) {
        return {
            ...empty,
            frames,
            error: 'no frame with the marker green and the cells empty',
        }
    }

    const images: Analysis['images'] = []
    let notShown = 0
    timedImages.forEach((image, i) => {
        const final = cellColors[frames - 1][i]
        const span = distance(final, placeholder)
        const mismatch = distance(final, parseHex(image.color)) > 30
        if (span < 10) {
            notShown++
            images.push({ index: image.index, mismatch: true })
            return
        }
        let shown: number | undefined
        for (let f = start; f < frames; f++) {
            if (distance(cellColors[f][i], placeholder) > span / 2) {
                shown = f
                break
            }
        }
        const shownMs =
            shown === undefined
                ? undefined
                : Math.round((times[shown] - times[start]) * 1000)
        images.push({
            index: image.index,
            shownMs,
            eventGapMs:
                shownMs !== undefined && image.loadMs !== undefined
                    ? Math.round(image.loadMs - shownMs)
                    : undefined,
            ...(mismatch ? { mismatch } : {}),
        })
    })
    const shownTimes = images
        .map((image) => image.shownMs)
        .filter((ms): ms is number => ms !== undefined)
    const early = images.find((image) => (image.eventGapMs ?? 0) > STALL_MS)
    const unseen = images.find(
        (image, i) =>
            image.shownMs === undefined && timedImages[i].loadMs !== undefined,
    )
    const error = early
        ? `recording stalled: image ${early.index} showed ${early.eventGapMs} ms before its load event`
        : unseen
          ? `recording stalled: image ${unseen.index} loaded but didn't show`
          : undefined
    return {
        images,
        firstMs: shownTimes.length ? Math.min(...shownTimes) : undefined,
        allMs:
            shownTimes.length && shownTimes.length === images.length
                ? Math.max(...shownTimes)
                : undefined,
        timed: images.length,
        notShown,
        frames,
        ...(error ? { error } : {}),
    }
}
