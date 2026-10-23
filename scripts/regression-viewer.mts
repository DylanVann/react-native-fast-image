#!/usr/bin/env node
// Shows the regression screenshots of a verify.mts run next to their
// references and the cases' descriptions, and approves new screenshots as
// references (copies them into screenshots/).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { parseArgs } from 'node:util'

const USAGE = `Usage: node scripts/regression-viewer.mts [folder] [options]

Serves a page (http://localhost:<port>) with each regression group from a
verify.mts run: each case's crop of the group's screenshot next to its
reference in screenshots/ and the diff (a group without cases as a whole),
the video samples, and what the group and its cases check. A crop that's new
or differs can be approved: it's copied over its reference in screenshots/
(commit it).

  folder              A verify.mts output folder, or any folder with runs in
                      it (e.g. a CI run's artifacts, unzipped); the shards of
                      an app and platform are shown together. Default: the
                      latest run in verify-output/.
  --pr <number>       The PR's latest e2e run on CI: its screenshots (the
                      verify-* artifacts) are downloaded with gh into
                      verify-output/ci-<run id>/. Check out the PR's branch,
                      so approved screenshots replace its references.
  --port <port>       Default 8095.
  -h, --help
`

const ROOT = path.resolve(import.meta.dirname, '..')
const SCREENSHOTS = path.join(ROOT, 'screenshots')
const OUTPUT = path.join(ROOT, 'verify-output')

const { values: options, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        pr: { type: 'string' },
        port: { type: 'string', default: '8095' },
        help: { type: 'boolean', short: 'h', default: false },
    },
})
if (options.help) {
    console.log(USAGE)
    process.exit(0)
}

const gh = (...args: string[]) =>
    execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', timeout: 60_000 })

// The PR's latest e2e run's verify-* artifacts, downloaded once.
function downloadPr(pr: string) {
    const head = gh(
        'pr',
        'view',
        pr,
        '--json',
        'headRefOid',
        '-q',
        '.headRefOid',
    ).trim()
    const runs = JSON.parse(
        gh(
            'run',
            'list',
            '--workflow',
            'e2e.yml',
            '--commit',
            head,
            '--json',
            'databaseId,status,conclusion',
        ),
    ) as { databaseId: number; status: string; conclusion: string }[]
    const run = runs.find((r) => r.status === 'completed')
    if (!run) {
        console.error(`No finished e2e run for #${pr}'s head (${head}).`)
        process.exit(1)
    }
    const dir = path.join(OUTPUT, `ci-${run.databaseId}`)
    if (!fs.existsSync(dir)) {
        console.log(`Downloading run ${run.databaseId}'s screenshots…`)
        try {
            execFileSync(
                'gh',
                [
                    'run',
                    'download',
                    String(run.databaseId),
                    '-p',
                    'verify-*',
                    '-D',
                    dir,
                ],
                { cwd: ROOT, stdio: 'inherit', timeout: 600_000 },
            )
        } catch (error) {
            fs.rmSync(dir, { recursive: true, force: true })
            throw error
        }
    }
    const local = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: ROOT,
        encoding: 'utf8',
    }).trim()
    if (local !== head)
        console.warn(
            `Note: the checkout (${local.slice(0, 8)}) isn't #${pr}'s head (${head.slice(0, 8)}): references are this checkout's.`,
        )
    return dir
}

// Every results.json under a folder (a run's regression folders).
function findResults(dir: string): string[] {
    const found: string[] = []
    const walk = (d: string, depth: number) => {
        if (depth > 6) return
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, entry.name)
            if (entry.isDirectory()) walk(p, depth + 1)
            else if (
                entry.name === 'results.json' &&
                path.basename(d) === 'regression'
            )
                found.push(p)
        }
    }
    walk(dir, 0)
    return found
}

// The latest folder in verify-output/ with a regression run in it.
function latestRun() {
    const dirs = fs.existsSync(OUTPUT)
        ? fs
              .readdirSync(OUTPUT, { withFileTypes: true })
              .filter((e) => e.isDirectory())
              .map((e) => path.join(OUTPUT, e.name))
              .filter((d) => findResults(d).length > 0)
              .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
        : []
    if (!dirs[0]) {
        console.error('No regression runs in verify-output/.')
        process.exit(1)
    }
    return dirs[0]
}

const RUN = path.resolve(
    options.pr
        ? downloadPr(options.pr)
        : positionals[0]
          ? positionals[0]
          : latestRun(),
)

type Description = { checks: string; steps?: string; shows: string }
type Rect = { x: number; y: number; width: number; height: number }
type Comparison = { result: string; detail?: string; diff?: string }
type Results = {
    hello?: { groups?: string[] }
    statuses?: Record<string, Record<string, string>>
    descriptions?: Record<
        string,
        { description?: Description; cases?: Record<string, Description> }
    >
    screenshots?: Record<
        string,
        Comparison & {
            file: string
            cases?: Record<string, Comparison & { area: Rect; file: string }>
        }
    >
}

// An image compared with its reference. state: new (no reference, or one
// the run seeded), differs (from the reference), approved (the reference is
// now this image), ok.
type State = 'new' | 'differs' | 'approved' | 'ok'
type Compared = {
    state: State
    detail?: string
    shot: string
    reference: string
    hasReference: boolean
    diff?: string
}

// A group as the page shows it: compared as a whole (whole), or by case
// (each case's image). state: failed (a case didn't pass), or its images'
// worst.
type Group = {
    key: string
    name: string
    index: number
    state: 'failed' | State
    detail?: string
    description?: Description
    shot?: string
    whole?: Compared
    cases: {
        id: string
        status: string
        description?: Description
        area?: Rect
        image?: Compared
    }[]
    samples: string[]
}

const sameFile = (a: string, b: string) =>
    fs.existsSync(a) &&
    fs.existsSync(b) &&
    fs.readFileSync(a).equals(fs.readFileSync(b))

// A seeded reference (verify.mts copies it into screenshots/ in a local run)
// is new until someone has looked at it.
function compared(
    shot: string,
    reference: string,
    { result, detail, diff }: Comparison,
    dir: string,
): Compared {
    const hasReference = fs.existsSync(reference)
    const state: State =
        !hasReference || result === 'seeded' || result === 'unseeded'
            ? 'new'
            : sameFile(shot, reference)
              ? result === 'differs'
                  ? 'approved'
                  : 'ok'
              : result === 'differs'
                ? 'differs'
                : 'ok'
    return {
        state,
        detail,
        shot,
        reference,
        hasReference,
        diff: diff && path.join(dir, diff),
    }
}

const ORDER: Group['state'][] = ['failed', 'new', 'differs', 'approved', 'ok']

// The run's groups, by app and platform (e.g. main-ios), shards merged.
function load() {
    const byKey = new Map<string, Group[]>()
    for (const file of findResults(RUN)) {
        const dir = path.dirname(file)
        const key = path.basename(path.dirname(dir))
        const results = JSON.parse(fs.readFileSync(file, 'utf8')) as Results
        const files = fs.readdirSync(dir)
        const names = results.hello?.groups ?? []
        for (const [name, statuses] of Object.entries(results.statuses ?? {})) {
            const index = names.indexOf(name)
            const prefix = `${String(index + 1).padStart(2, '0')}-${name}`
            const info = results.screenshots?.[name]
            const caseInfo = info?.cases ?? {}
            const byCase = Object.keys(caseInfo).length > 0
            const descriptions = results.descriptions?.[name]
            const cases = Object.entries(statuses).map(([id, status]) => {
                const c = caseInfo[id]
                return {
                    id,
                    status,
                    description: descriptions?.cases?.[id],
                    area: c?.area,
                    image:
                        c &&
                        compared(
                            path.join(dir, c.file),
                            path.join(SCREENSHOTS, key, name, `${id}.png`),
                            c,
                            dir,
                        ),
                }
            })
            const whole =
                info && !byCase
                    ? compared(
                          path.join(dir, info.file),
                          path.join(SCREENSHOTS, key, `${name}.png`),
                          info,
                          dir,
                      )
                    : undefined
            const states = [
                ...(cases.some((c) => c.status !== 'OK') ? ['failed'] : []),
                ...(whole ? [whole.state] : []),
                ...cases.flatMap((c) => (c.image ? [c.image.state] : [])),
            ] as Group['state'][]
            const list = byKey.get(key) ?? []
            list.push({
                key,
                name,
                index,
                state: ORDER.find((s) => states.includes(s)) ?? 'ok',
                detail: info?.detail,
                description: descriptions?.description,
                shot: info && path.join(dir, info.file),
                whole,
                cases,
                samples: files
                    .filter(
                        (f) =>
                            f.startsWith(`${prefix}-samples`) &&
                            f.endsWith('.mp4'),
                    )
                    .map((f) => path.join(dir, f)),
            })
            byKey.set(key, list)
        }
    }
    return [...byKey.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, groups]) => ({
            key,
            groups: groups.sort((a, b) => a.index - b.index),
        }))
}

// Only files in the run and the references are served.
const servable = (file: string) =>
    [RUN, SCREENSHOTS].some((root) => file.startsWith(root + path.sep))

const TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.mp4': 'video/mp4',
}

const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const send = (status: number, body: string, type = 'text/plain') => {
        response.writeHead(status, {
            'content-type': type,
            'cache-control': 'no-store',
        })
        response.end(body)
    }
    if (url.pathname === '/') {
        return send(
            200,
            fs.readFileSync(
                path.join(import.meta.dirname, 'regression-viewer.html'),
                'utf8',
            ),
            'text/html',
        )
    }
    if (url.pathname === '/api/runs') {
        return send(
            200,
            JSON.stringify({ run: path.relative(ROOT, RUN), entries: load() }),
            'application/json',
        )
    }
    if (url.pathname === '/file') {
        const file = path.resolve(url.searchParams.get('path') ?? '')
        if (!servable(file) || !fs.existsSync(file)) return send(404, 'no file')
        response.writeHead(200, {
            'content-type':
                TYPES[path.extname(file)] ?? 'application/octet-stream',
            'cache-control': 'no-store',
        })
        return fs.createReadStream(file).pipe(response)
    }
    if (url.pathname === '/api/approve' && request.method === 'POST') {
        let body = ''
        request.on('data', (chunk) => (body += chunk))
        request.on('end', () => {
            // A case's image (id), or all the group's.
            const { key, name, id } = JSON.parse(body) as {
                key: string
                name: string
                id?: string
            }
            const group = load()
                .find((e) => e.key === key)
                ?.groups.find((g) => g.name === name)
            const images = [
                ...(group?.whole && !id ? [group.whole] : []),
                ...(group?.cases ?? []).flatMap((c) =>
                    c.image && (!id || c.id === id) ? [c.image] : [],
                ),
            ].filter((image) => image.state !== 'ok')
            if (images.length === 0) return send(404, 'nothing to approve')
            for (const image of images) {
                fs.mkdirSync(path.dirname(image.reference), { recursive: true })
                fs.copyFileSync(image.shot, image.reference)
                console.log(`approved ${path.relative(ROOT, image.reference)}`)
            }
            send(200, 'ok')
        })
        return
    }
    send(404, 'not found')
})

const port = Number(options.port)
server.listen(port, '127.0.0.1', () => {
    console.log(
        `Regression viewer for ${path.relative(ROOT, RUN) || RUN}: http://localhost:${port} (Ctrl-C to stop)`,
    )
})
