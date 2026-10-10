// Makes a side-by-side video of a scenario's runs in a results folder: for
// each subject, its median run (by the time until every image showed), from
// the frame its clock starts in, with each frame shown at the time of the
// clock the app drew in it (a recording's own timestamps can be late on
// iOS), slowed down, under the subject's name and time.
//
//   bun benchmark/scripts/compare-videos.ts <results folder> [--scenario grid]
//       [--slow 4] [--width 270] [--names fast-image-local=FastImage 10,...]
//
// Needs the runs' recordings: run.ts keeps them with --keep-videos, and
// run-android.ts's are in the folder's pulled outputs. Needs ffmpeg and
// ImageMagick. Writes <folder>/compare-<scenario>.mp4.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { analyze, type Analysis } from './analyze'

const argv = process.argv.slice(2)
const option = (name: string, fallback: string) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : fallback
}
const dir = path.resolve(argv[0] ?? '')
if (!argv[0] || !fs.existsSync(dir)) {
    throw new Error(
        'usage: compare-videos.ts <results folder> [--scenario grid]',
    )
}
const scenario = option('scenario', 'grid')
const slow = Number(option('slow', '4'))
const width = Number(option('width', '270'))
const names = Object.fromEntries(
    option('names', '')
        .split(',')
        .filter(Boolean)
        .map((pair) => pair.split('=')),
)
const subjects: Record<string, { name: string }> = JSON.parse(
    fs.readFileSync(path.join(import.meta.dir, '../app/subjects.json'), 'utf8'),
)
const packageName = (subject: string) =>
    `com.dylanvann.rnfibenchmark.${subject.replace(/[^a-z0-9]/gi, '')}`

function run(cmd: string, args: string[]) {
    const result = spawnSync(cmd, args, { encoding: 'utf8' })
    if (result.status !== 0) {
        throw new Error(`${cmd} failed: ${result.stderr.slice(-1000)}`)
    }
}

// Files anywhere under `root` named `name`.
const find = (root: string, name: string) =>
    fs.existsSync(root)
        ? (fs.readdirSync(root, { recursive: true }) as string[])
              .filter((f) => path.basename(f) === name)
              .map((f) => path.join(root, f))
        : []

type Run = {
    subject: string
    data: Parameters<typeof analyze>[0] & { analysis: Analysis }
    video: string
}

// Each run of the scenario with its recording: iOS's
// <subject>-<scenario>-<n>.json next to its .mov, Android's
// android-<subject>-<scenario>-[<phone>-]<n>.json with its .mp4 in the
// pulled outputs (in a folder named after the app, for a paired run).
const runs: Run[] = []
for (const file of fs.readdirSync(dir)) {
    const android = file.match(
        new RegExp(`^android-(.+)-${scenario}-(?:(\\d+)-)?(\\d+)\\.json$`),
    )
    const ios = file.match(new RegExp(`^(.+)-${scenario}-(\\d+)\\.json$`))
    let subject: string | undefined
    let video: string | undefined
    if (android) {
        const [, s, phone, n] = android
        subject = s
        const pulled = path.join(
            dir,
            phone ? `android-paired-${phone}-outputs` : `android-${s}-outputs`,
        )
        video = find(pulled, `${scenario}-${n}.mp4`).find(
            (f) => !phone || f.includes(packageName(s)),
        )
    } else if (ios) {
        subject = ios[1]
        const mov = path.join(dir, file.replace(/\.json$/, '.mov'))
        if (fs.existsSync(mov)) video = mov
    }
    if (!subject || !video || !subjects[subject]) continue
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    if (!data.analysis || data.analysis.error) continue
    runs.push({ subject, data, video })
}

// Each subject's median run, this checkout's FastImage first; for a subject
// none of whose runs showed every image, the one that showed the most.
const order = Object.keys(subjects).sort(
    (a, b) =>
        Number(b === 'fast-image-local') - Number(a === 'fast-image-local'),
)
const chosen = order.flatMap((subject) => {
    const own = runs.filter((r) => r.subject === subject)
    const complete = own
        .filter((r) => r.data.analysis.allMs !== undefined)
        .sort((a, b) => a.data.analysis.allMs! - b.data.analysis.allMs!)
    if (complete.length)
        return [complete[Math.floor((complete.length - 1) / 2)]]
    const most = own.sort(
        (a, b) => a.data.analysis.notShown - b.data.analysis.notShown,
    )
    return most.length ? [most[0]] : []
})
if (chosen.length < 2) {
    throw new Error(`fewer than two subjects with ${scenario} recordings`)
}

// Until the slowest has shown every image, and a little longer.
const endMs =
    Math.max(...chosen.flatMap((r) => r.data.analysis.allMs ?? [])) + 400
// The screen from the marker to the bottom of the last image on it (in dp;
// the runs are on one model of phone).
type Rect = { x: number; y: number; width: number; height: number }
const top = Math.min(...chosen.map((r) => (r.data.marker as Rect).y))
const bottom = Math.max(
    ...chosen.map((r) =>
        Math.min(
            r.data.window.height,
            ...[
                Math.max(
                    ...(r.data.images as { rect?: Rect }[]).flatMap((image) =>
                        image.rect ? [image.rect.y + image.rect.height] : [],
                    ),
                ),
            ],
        ),
    ),
)
const even = (n: number) => 2 * Math.round(n / 2)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-videos-'))
const inputs: string[] = []
const filters: string[] = []
for (const [i, r] of chosen.entries()) {
    const clock =
        r.data.analysis.clock ?? (await analyze(r.data, r.video)).clock ?? []
    // The first frame with each clock value (later ones arrived late).
    const frames = clock.filter(
        (c, k) => c.ms <= endMs && (k === 0 || c.ms > clock[k - 1].ms),
    )
    if (!frames.length) throw new Error(`${r.video}: no clock`)
    const first = frames[0].frame
    const last = frames[frames.length - 1].frame
    const own = path.join(tmp, String(i))
    fs.mkdirSync(own)
    run('ffmpeg', [
        '-v',
        'error',
        '-i',
        r.video,
        '-vf',
        `select='between(n\\,${first}\\,${last})',scale=${width}:-2,crop=${width}:${even(((bottom - top) * width) / r.data.window.width)}:0:${even((top * width) / r.data.window.width)}`,
        '-fps_mode',
        'passthrough',
        path.join(own, '%05d.png'),
    ])
    // Each frame until the next one's clock (the first from the start).
    const list = frames.flatMap((c, k) => {
        const from = k === 0 ? 0 : c.ms
        const to = k + 1 < frames.length ? frames[k + 1].ms : endMs
        const png = path.join(
            own,
            `${String(c.frame - first + 1).padStart(5, '0')}.png`,
        )
        return [`file '${png}'`, `duration ${((to - from) * slow) / 1000}`]
    })
    list.push(list[list.length - 2])
    fs.writeFileSync(path.join(own, 'list.txt'), list.join('\n') + '\n')
    const label = path.join(own, 'label.png')
    run('magick', [
        '-size',
        `${width}x48`,
        '-background',
        'white',
        '-fill',
        'black',
        '-gravity',
        'center',
        '-font',
        '/System/Library/Fonts/Helvetica.ttc',
        '-pointsize',
        '16',
        `label:${names[r.subject] ?? subjects[r.subject].name}\n${r.data.analysis.allMs !== undefined ? `${r.data.analysis.allMs} ms` : `${r.data.analysis.notShown} not shown`}`,
        label,
    ])
    inputs.push(
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        path.join(own, 'list.txt'),
        '-i',
        label,
    )
    filters.push(
        `[${2 * i}:v]fps=60,setsar=1,format=yuv420p[v${i}];[${2 * i + 1}:v]format=yuv420p[l${i}];[l${i}][v${i}]vstack[c${i}]`,
    )
}
const output = path.join(dir, `compare-${scenario}.mp4`)
run('ffmpeg', [
    '-v',
    'error',
    '-y',
    ...inputs,
    '-filter_complex',
    `${filters.join(';')};${chosen.map((_, i) => `[c${i}]`).join('')}hstack=inputs=${chosen.length},format=yuv420p[out]`,
    '-map',
    '[out]',
    '-c:v',
    'libx264',
    '-crf',
    '23',
    '-movflags',
    '+faststart',
    output,
])
fs.rmSync(tmp, { recursive: true, force: true })
console.log(
    `${path.relative(process.cwd(), output)}: ${chosen.map((r) => `${r.subject} ${r.data.analysis.allMs !== undefined ? `${r.data.analysis.allMs} ms` : `${r.data.analysis.notShown} not shown`}`).join(', ')}; ${slow}× slower`,
)
