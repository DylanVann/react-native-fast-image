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

Serves a page (http://localhost:<port>) with each regression group's
screenshot from a verify.mts run, its reference in screenshots/, the diff,
the video samples, and what the group and its cases check. A group whose
screenshot is new or differs can be approved: its screenshot is copied over
the reference in screenshots/ (commit it).

  folder              A verify.mts output folder, or any folder with runs in
                      it (e.g. a CI run's artifacts, unzipped); the shards of
                      an app and platform are shown together. Default: the
                      latest run in verify-output/.
  --pr <number>       The PR's latest e2e run on CI: its screenshots (the
                      verify-* artifacts) are downloaded with gh into
                      verify-output/ci-<run id>-<attempt>/. Check out the
                      PR's branch, so approved screenshots replace its
                      references.
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

// The PR's latest e2e run's verify-* artifacts, downloaded once (into a
// partial folder first, so an interrupted download isn't taken for one).
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
            'databaseId,attempt,status,conclusion',
        ),
    ) as {
        databaseId: number
        attempt: number
        status: string
        conclusion: string
    }[]
    const run = runs.find((r) => r.status === 'completed')
    if (!run) {
        console.error(`No finished e2e run for #${pr}'s head (${head}).`)
        process.exit(1)
    }
    // Per attempt: a rerun has artifacts of its own.
    const dir = path.join(OUTPUT, `ci-${run.databaseId}-${run.attempt}`)
    if (!fs.existsSync(dir)) {
        console.log(`Downloading run ${run.databaseId}'s screenshots…`)
        const partial = `${dir}.partial`
        fs.rmSync(partial, { recursive: true, force: true })
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
                    partial,
                ],
                { cwd: ROOT, stdio: 'inherit', timeout: 600_000 },
            )
        } catch {
            fs.rmSync(partial, { recursive: true, force: true })
            console.error(
                `Couldn't download run ${run.databaseId}'s screenshots (a run without the apps, e.g. for docs, has none).`,
            )
            process.exit(1)
        }
        fs.renameSync(partial, dir)
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

// The latest folder in verify-output/ with a regression run in it, not a
// CI run's (--pr).
function latestRun() {
    const dirs = fs.existsSync(OUTPUT)
        ? fs
              .readdirSync(OUTPUT, { withFileTypes: true })
              .filter((e) => e.isDirectory() && !e.name.startsWith('ci-'))
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

type Description = { checks: string; steps?: string; shows?: string }
type Rect = { x: number; y: number; width: number; height: number }
type Results = {
    hello?: { groups?: string[] }
    statuses?: Record<string, Record<string, string>>
    descriptions?: Record<
        string,
        { description?: Description; cases?: Record<string, Description> }
    >
    screenshots?: Record<
        string,
        {
            file: string
            result: string
            detail?: string
            diff?: string
            cases?: Record<string, Rect>
            approvable?: boolean
            failures?: string[]
        }
    >
}

// A group as the page shows it. state: failed (a case didn't pass, or the
// group failed: failures), new (no reference), differs (from the reference),
// approved (the reference is now this screenshot), ok. approvable: whether
// its screenshot may become the reference (verify.mts wouldn't seed it from
// a failed group or a --ref run).
type Group = {
    key: string
    name: string
    index: number
    state: 'failed' | 'new' | 'differs' | 'approved' | 'ok'
    approvable: boolean
    failures: string[]
    result?: string
    detail?: string
    description?: Description
    cases: {
        id: string
        status: string
        description?: Description
        area?: Rect
    }[]
    shot?: string
    reference?: string
    diff?: string
    samples: string[]
}

const sameFile = (a: string, b: string) =>
    fs.existsSync(a) &&
    fs.existsSync(b) &&
    fs.readFileSync(a).equals(fs.readFileSync(b))

// The run's groups, by app and platform (e.g. main-ios), shards merged.
function load() {
    const byKey = new Map<string, Group[]>()
    for (const file of findResults(RUN)) {
        const dir = path.dirname(file)
        const key = path.basename(path.dirname(dir))
        const results = JSON.parse(fs.readFileSync(file, 'utf8')) as Results
        const written = fs.statSync(file).mtimeMs
        const files = fs.readdirSync(dir)
        const names = results.hello?.groups ?? []
        for (const [name, statuses] of Object.entries(results.statuses ?? {})) {
            const index = names.indexOf(name)
            const prefix = `${String(index + 1).padStart(2, '0')}-${name}`
            const shotInfo = results.screenshots?.[name]
            // Runs from before results.json had the screenshots: by name.
            const shotFile =
                shotInfo?.file ?? files.find((f) => f === `${prefix}.png`)
            const diffFile =
                shotInfo?.diff ?? files.find((f) => f === `${prefix}-diff.png`)
            const shot = shotFile && path.join(dir, shotFile)
            const reference = path.join(SCREENSHOTS, key, `${name}.png`)
            const hasReference = fs.existsSync(reference)
            const descriptions = results.descriptions?.[name]
            const cases = Object.entries(statuses).map(([id, status]) => ({
                id,
                status,
                description: descriptions?.cases?.[id],
                area: shotInfo?.cases?.[id],
            }))
            const failures = shotInfo?.failures ?? []
            const failed =
                cases.some((c) => c.status !== 'OK') || failures.length > 0
            const seeded =
                shotInfo?.result === 'seeded' || shotInfo?.result === 'unseeded'
            // A seeded reference (verify.mts copies it into screenshots/ in
            // a local run) is new until someone has looked at it: until it's
            // approved, which writes it after the run's results.
            const state: Group['state'] = failed
                ? 'failed'
                : !shot
                  ? 'ok'
                  : !hasReference
                    ? 'new'
                    : seeded
                      ? sameFile(shot, reference) &&
                        fs.statSync(reference).mtimeMs > written
                          ? 'approved'
                          : 'new'
                      : sameFile(shot, reference)
                        ? shotInfo?.result === 'differs'
                            ? 'approved'
                            : 'ok'
                        : shotInfo?.result === 'differs' ||
                            (!shotInfo && diffFile)
                          ? 'differs'
                          : 'ok'
            const list = byKey.get(key) ?? []
            list.push({
                key,
                name,
                index,
                state,
                // Runs from before results.json said: not approvable.
                approvable: !failed && !!shot && !!shotInfo?.approvable,
                failures,
                result: shotInfo?.result,
                detail: shotInfo?.detail,
                description: descriptions?.description,
                cases,
                shot,
                reference: hasReference ? reference : undefined,
                diff: diffFile && path.join(dir, diffFile),
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

const port = Number(options.port)

type Send = (status: number, body: string, type?: string) => void

const server = http.createServer((request, response) => {
    const send: Send = (status, body, type = 'text/plain') => {
        response.writeHead(status, {
            'content-type': type,
            'cache-control': 'no-store',
        })
        response.end(body)
    }
    // Only this machine's names for the server: a page whose own name was
    // made to point here (DNS rebinding) would otherwise be same-origin.
    if (
        request.headers.host !== `localhost:${port}` &&
        request.headers.host !== `127.0.0.1:${port}`
    )
        return send(403, 'unknown host')
    // An error (e.g. a results.json being written) answers 500, and the
    // server goes on.
    const guard = (handle: () => void) => {
        try {
            handle()
        } catch (error) {
            console.error(error)
            send(500, String(error))
        }
    }
    guard(() => {
        const url = new URL(request.url ?? '/', 'http://localhost')
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
                JSON.stringify({
                    run: path.relative(ROOT, RUN),
                    entries: load(),
                }),
                'application/json',
            )
        }
        if (url.pathname === '/file') {
            const file = path.resolve(url.searchParams.get('path') ?? '')
            if (
                !servable(file) ||
                !fs.statSync(file, { throwIfNoEntry: false })?.isFile()
            )
                return send(404, 'no file')
            response.writeHead(200, {
                'content-type':
                    TYPES[path.extname(file)] ?? 'application/octet-stream',
                'cache-control': 'no-store',
            })
            return fs
                .createReadStream(file)
                .on('error', () => response.destroy())
                .pipe(response)
        }
        // JSON only: another site's page can't send that without the
        // browser asking first (CORS), which this server doesn't answer.
        if (
            url.pathname === '/api/approve' &&
            request.method === 'POST' &&
            request.headers['content-type'] === 'application/json'
        ) {
            let body = ''
            request.on('data', (chunk) => (body += chunk))
            request.on('end', () => guard(() => approve(body, send)))
            return
        }
        send(404, 'not found')
    })
})

// Copies a group's screenshot over its reference; body: { key, name }.
function approve(body: string, send: Send) {
    let parsed: { key?: unknown; name?: unknown } | null
    try {
        parsed = JSON.parse(body)
    } catch {
        return send(400, 'not JSON')
    }
    const key = parsed?.key
    const name = parsed?.name
    if (typeof key !== 'string' || typeof name !== 'string')
        return send(400, 'needs a key and a name')
    const group = load()
        .find((e) => e.key === key)
        ?.groups.find((g) => g.name === name)
    if (!group?.shot) return send(404, 'no screenshot')
    if (!group.approvable) return send(409, "can't be approved")
    const reference = path.join(SCREENSHOTS, key, `${name}.png`)
    fs.mkdirSync(path.dirname(reference), { recursive: true })
    fs.copyFileSync(group.shot, reference)
    console.log(`approved ${path.relative(ROOT, reference)}`)
    send(200, 'ok')
}

server.listen(port, '127.0.0.1', () => {
    console.log(
        `Regression viewer for ${path.relative(ROOT, RUN) || RUN}: http://localhost:${port} (Ctrl-C to stop)`,
    )
})
