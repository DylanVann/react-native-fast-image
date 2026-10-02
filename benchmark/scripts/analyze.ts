// Finds when each image showed in a run's screen recording (see run.ts).
//
// The app's results say where each cell is (in points) and what's in it; the
// recording (from capture, at the device's pixel size) is decoded at a
// fraction of its size. Each frame's time comes from the clock the app draws
// next to the marker (the time since the run started, in binary), not from
// the file's timestamps: the phone's frames can reach the Mac late, and then
// they're stamped as if no time had passed. The run's frames are the ones
// after the last with the marker black (waiting): earlier ones show the
// previous run, or a snapshot of it while the app launches again. A cell's
// image has shown in the first frame whose average color (of the middle of
// the cell) is more than halfway from the placeholder's to the cell's final
// color (in the last frame, which must show the marker blue: the run's end),
// so a fade-in counts from its middle. Only cells fully on screen are timed.
// A gap in the clock (a frame the phone didn't draw, or one that didn't
// reach the Mac) is reported as each image's window: the image showed
// within that long before its frame.

import { spawn, spawnSync } from 'node:child_process'

export type Rect = { x: number; y: number; width: number; height: number }

export type Results = {
    scale: number
    window: { width: number; height: number }
    marker?: Rect
    clock?: { rect: Rect; bits: number; unitMs: number }
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
    // ms from the run's start to each timed image's frame (by its clock).
    images: {
        index: number
        shownMs?: number
        // How long before that frame the last one with an earlier clock was
        // drawn: the image showed within this long.
        windowMs?: number
        // loadMs minus shownMs: positive when the load event came after the
        // pixels. The clock starts within about a frame of loadMs's start.
        eventGapMs?: number
    }[]
    firstMs?: number
    allMs?: number
    timed: number
    notShown: number
    // The run's frames, and the median time between them.
    frames: number
    frameMs?: number
    error?: string
}

// The recording is decoded at 1/DOWNSCALE of its size.
const DOWNSCALE = 6

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
    if (!results.clock) return { ...empty, error: 'no clock' }
    const marker = results.marker
    const clock = results.clock
    const onScreen = (rect?: Rect): rect is Rect =>
        !!rect &&
        rect.x >= 0 &&
        rect.y >= 0 &&
        rect.x + rect.width <= results.window.width &&
        rect.y + rect.height <= results.window.height
    const timedImages = results.images.filter((image) => onScreen(image.rect))
    const bitWidth = clock.rect.width / clock.bits
    const bitRects = Array.from({ length: clock.bits }, (_, k) => ({
        ...clock.rect,
        x: clock.rect.x + k * bitWidth,
        width: bitWidth,
    }))
    // Each frame's marker color, clock (ms) and cell colors: all that's kept
    // of the video.
    const markerColors: Rgb[] = []
    const clockMs: number[] = []
    const cellColors: Rgb[][] = []
    await eachFrame(video, width, height, (data) => {
        markerColors.push(average(data, marker, 0.2))
        clockMs.push(
            bitRects.reduce((value, rect, k) => {
                const [r, g, b] = average(data, rect, 0.3)
                return r + g + b > 3 * 128 ? value + 2 ** k : value
            }, 0) * clock.unitMs,
        )
        cellColors.push(
            timedImages.map((image) => average(data, image.rect!, 0.2)),
        )
    })
    const frames = markerColors.length
    if (frames === 0) return { ...empty, error: 'no frames' }

    const black: Rgb = [0, 0, 0]
    const blue: Rgb = [0, 0, 255]
    let waiting = -1
    for (let f = 0; f < frames; f++) {
        if (distance(markerColors[f], black) < 20) waiting = f
    }
    const run = Array.from({ length: frames }, (_, f) => f).filter(
        (f) => f > waiting,
    )
    if (waiting < 0 || run.length === 0) {
        return { ...empty, error: 'no frame with the marker black (waiting)' }
    }
    const last = run[run.length - 1]
    if (distance(markerColors[last], blue) >= 20) {
        return {
            ...empty,
            frames: run.length,
            error: "the recording ended before the run's end",
        }
    }
    for (let i = 1; i < run.length; i++) {
        if (clockMs[run[i]] < clockMs[run[i - 1]]) {
            return {
                ...empty,
                frames: run.length,
                error: `the clock went back at frame ${run[i]}: ${clockMs[run[i - 1]]} to ${clockMs[run[i]]} ms`,
            }
        }
    }
    const gaps = run
        .slice(1)
        .map((f, i) => clockMs[f] - clockMs[run[i]])
        .filter((ms) => ms > 0)
        .sort((a, b) => a - b)

    const placeholder = parseHex(results.placeholder)
    const images: Analysis['images'] = []
    let notShown = 0
    timedImages.forEach((image, i) => {
        const final = cellColors[last][i]
        const span = distance(final, placeholder)
        if (span < 10) {
            notShown++
            images.push({ index: image.index })
            return
        }
        const at = run.findIndex(
            (f) => distance(cellColors[f][i], placeholder) > span / 2,
        )
        const shownMs = at < 0 ? undefined : clockMs[run[at]]
        // On a screen faster than the clock's animation (60 Hz frames on
        // Android), frames in a row can have the same clock.
        const earlier = run
            .slice(0, Math.max(at, 0))
            .map((f) => clockMs[f])
            .filter((ms) => ms < (shownMs ?? 0))
        images.push({
            index: image.index,
            shownMs,
            windowMs:
                shownMs === undefined
                    ? undefined
                    : shownMs - (earlier.length ? Math.max(...earlier) : 0),
            eventGapMs:
                shownMs !== undefined && image.loadMs !== undefined
                    ? Math.round(image.loadMs - shownMs)
                    : undefined,
        })
    })
    const shownTimes = images
        .map((image) => image.shownMs)
        .filter((ms): ms is number => ms !== undefined)
    const unseen = images.find(
        (image, i) =>
            image.shownMs === undefined && timedImages[i].loadMs !== undefined,
    )
    const error = unseen
        ? `image ${unseen.index} loaded but didn't show`
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
        frames: run.length,
        frameMs: gaps.length ? gaps[Math.floor(gaps.length / 2)] : undefined,
        ...(error ? { error } : {}),
    }
}
