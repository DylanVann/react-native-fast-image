#!/usr/bin/env node
// Shows every regression case's committed reference screenshot with its
// description, next to its change if it has one: a verify.mts run's
// screenshot, or a reference in screenshots/ that isn't committed. Approves a
// run's screenshots (copies them into screenshots/, to commit) and undoes
// approvals that aren't committed.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { isDeepStrictEqual, parseArgs } from 'node:util'

const USAGE = `Usage: node scripts/regression-viewer.mts [folder] [options]

Serves a page (http://localhost:<port>) with every regression group and case,
for every app and platform: its committed reference (git's HEAD) and what it
checks, and its change, if it has one: a run's screenshot that differs (each
case's crop, or a group without cases as a whole), or a reference in
screenshots/ that isn't committed (approved, seeded or edited), with the diff.
The same goes for its descriptions, in screenshots/<app>-<platform>/
descriptions.json. Approving a run's screenshot (or a group's descriptions)
copies it into screenshots/, to commit; undo puts the committed one back.

  folder              The run to compare with: a verify.mts output folder, or
                      any folder with runs in it (e.g. a CI run's artifacts,
                      unzipped); the shards of an app and platform are shown
                      together. Default: the latest run in verify-output/.
  --pr <number>       The PR's latest e2e run on CI: its screenshots (the
                      verify-* artifacts) are downloaded with gh into
                      verify-output/ci-<run id>-<attempt>/. Check out the
                      PR's branch, so approved screenshots replace its
                      references.
  --references        No run: the references and descriptions only.
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
        references: { type: 'boolean', default: false },
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

// The folders in verify-output/ with regression runs in them, newest first.
const runs = () =>
    fs.existsSync(OUTPUT)
        ? fs
              .readdirSync(OUTPUT, { withFileTypes: true })
              .filter((e) => e.isDirectory())
              .map((e) => path.join(OUTPUT, e.name))
              .filter((d) => findResults(d).length > 0)
              .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
        : []

const readResults = (file: string) =>
    JSON.parse(fs.readFileSync(file, 'utf8')) as Results

// The latest local run (not a CI run's, --pr) that has its comparisons in
// results.json, of the newest 30 (verify-output/ keeps them all): runs from
// before it did can't be compared. None: the references alone.
function latestRun() {
    return runs()
        .slice(0, 30)
        .find(
            (d) =>
                !path.basename(d).startsWith('ci-') &&
                findResults(d).some((f) => readResults(f).screenshots),
        )
}

const run = options.references
    ? undefined
    : options.pr
      ? downloadPr(options.pr)
      : (positionals[0] ?? latestRun())
const RUN = run && path.resolve(run)

type Description = { checks: string; steps?: string; shows?: string }
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
            whole?: boolean
            approvable?: boolean
            failures?: string[]
        }
    >
}

// A case's image (or a whole group's), as the page shows it: its committed
// reference (git's HEAD) and, if it has one, an uncommitted image: a run's
// screenshot not approved yet (approved: false), or the reference in
// screenshots/ when it isn't the committed one (approved, seeded or edited,
// and not committed yet; approved: true). state: new (nothing committed),
// differs, removed (deleted from screenshots/), or ok (nothing uncommitted).
type State = 'new' | 'differs' | 'removed' | 'ok'
// An image's size in pixels, so the page can lay it out before it loads.
type Size = { width: number; height: number }
type Image = {
    state: State
    // Its path in the repository (screenshots/…).
    reference: string
    committed: boolean
    committedSize?: Size
    // The uncommitted image's file.
    current?: string
    currentSize?: Size
    approved: boolean
    detail?: string
    diff?: string
    diffSize?: Size
}

// A group's descriptions, as verify.mts keeps them in descriptions.json.
type Descriptions = {
    description?: Description
    cases?: Record<string, Description>
}

// A group's descriptions as the page shows it: like an image's (see Image),
// the committed ones and, if they differ, the run's (approved: false) or the
// ones in descriptions.json that aren't committed (approved: true).
type DescriptionsChange = {
    state: State
    approved: boolean
    committed?: Descriptions
}

// A group as the page shows it: compared as a whole (whole), or by case
// (each case's image). state: failed (a case didn't pass, or the group
// failed: failures), or its images' worst. approvable: whether its run's
// images may become references (verify.mts wouldn't seed them from a failed
// group or a --ref run).
type Group = {
    key: string
    name: string
    index: number
    state: 'failed' | State
    approvable: boolean
    failures: string[]
    detail?: string
    description?: Description
    descriptions: DescriptionsChange
    // The run's descriptions, to approve.
    runDescriptions?: Descriptions
    shot?: string
    shotSize?: Size
    whole?: Image
    cases: {
        id: string
        status: string
        description?: Description
        area?: Rect
        image?: Image
    }[]
    samples: string[]
}

const sameFile = (a: string, b: string) =>
    fs.existsSync(a) &&
    fs.existsSync(b) &&
    fs.readFileSync(a).equals(fs.readFileSync(b))

// A PNG's size, from its header (bytes 16–24).
const headerSize = (header: Buffer): Size | undefined =>
    header.length >= 24
        ? { width: header.readUInt32BE(16), height: header.readUInt32BE(20) }
        : undefined
function pngSize(file: string | undefined) {
    if (!file || !fs.existsSync(file)) return undefined
    const header = Buffer.alloc(24)
    const fd = fs.openSync(file, 'r')
    try {
        fs.readSync(fd, header, 0, 24, 0)
    } finally {
        fs.closeSync(fd)
    }
    return headerSize(header)
}

const git = (...args: string[]) =>
    execFileSync('git', args, {
        cwd: ROOT,
        maxBuffer: 1 << 28,
        timeout: 30_000,
    })

// The references git has committed (HEAD), and the ones that differ from
// them in screenshots/ (changed, added or deleted, not committed yet):
// paths in the repository.
function referenceStatus() {
    const list = (output: Buffer) =>
        output.toString().split('\0').filter(Boolean)
    return {
        committed: new Set(
            list(
                git(
                    'ls-tree',
                    '-r',
                    '--name-only',
                    '-z',
                    'HEAD',
                    '--',
                    'screenshots',
                ),
            ),
        ),
        changed: new Set(
            list(
                git(
                    'status',
                    '--porcelain=v1',
                    '-z',
                    '--no-renames',
                    '--untracked-files=all',
                    '--',
                    'screenshots',
                ),
            ).map((line) => line.slice(3)),
        ),
    }
}

// A reference (its path in the repository) as the page shows it, with a
// run's screenshot of it, if the run has one.
function imageState(
    reference: string,
    status: ReturnType<typeof referenceStatus>,
    shot?: Comparison & { file: string },
): Image {
    const file = path.join(ROOT, reference)
    const committed = status.committed.has(reference)
    const changed = status.changed.has(reference)
    const exists = fs.existsSync(file)
    // A run's screenshot that isn't the reference yet (a match within the
    // threshold isn't a change).
    if (
        shot &&
        shot.result !== 'match' &&
        fs.existsSync(shot.file) &&
        !(exists && sameFile(shot.file, file))
    )
        return {
            state: committed ? 'differs' : 'new',
            reference,
            committed,
            current: shot.file,
            approved: false,
            detail: shot.detail,
            // odiff's, against the reference as it was: the committed one.
            diff: changed ? undefined : shot.diff,
        }
    if (changed)
        return exists
            ? {
                  state: committed ? 'differs' : 'new',
                  reference,
                  committed,
                  current: file,
                  approved: true,
              }
            : { state: 'removed', reference, committed, approved: true }
    return { state: 'ok', reference, committed, approved: false }
}

// imageState with the images' sizes. The committed reference's is the one in
// screenshots/ unless that changed (then git's).
function image(
    reference: string,
    status: ReturnType<typeof referenceStatus>,
    shot?: Comparison & { file: string },
): Image {
    const found = imageState(reference, status, shot)
    const file = path.join(ROOT, reference)
    return {
        ...found,
        committedSize: !found.committed
            ? undefined
            : status.changed.has(reference)
              ? headerSize(git('cat-file', 'blob', `HEAD:${reference}`))
              : pngSize(file),
        currentSize: pngSize(found.current),
        diffSize: pngSize(found.diff),
    }
}

// An app and platform's descriptions (see verify.mts's checkDescriptions):
// in screenshots/ (current) and committed.
const descriptionsFile = (key: string) => `screenshots/${key}/descriptions.json`
function readDescriptions(
    key: string,
    refs: ReturnType<typeof referenceStatus>,
) {
    const reference = descriptionsFile(key)
    const file = path.join(ROOT, reference)
    return {
        current: fs.existsSync(file)
            ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Record<
                  string,
                  Descriptions
              >)
            : {},
        committed: refs.committed.has(reference)
            ? (JSON.parse(
                  git('show', `HEAD:${reference}`).toString(),
              ) as Record<string, Descriptions>)
            : {},
    }
}

// A group's descriptions change (see DescriptionsChange), with the run's if
// it has them.
function descriptionsChange(
    name: string,
    files: ReturnType<typeof readDescriptions>,
    run?: Descriptions,
): DescriptionsChange {
    const current = files.current[name]
    const committed = files.committed[name]
    if (run && !isDeepStrictEqual(run, current))
        return {
            state: committed ? 'differs' : 'new',
            approved: false,
            committed,
        }
    if (!isDeepStrictEqual(current, committed))
        return {
            state: !current ? 'removed' : committed ? 'differs' : 'new',
            approved: true,
            committed,
        }
    return { state: 'ok', approved: false, committed }
}

// Writes a group's descriptions into descriptions.json (none: removes them),
// in the app's order (order: its groups), as verify.mts does.
function writeDescriptions(
    key: string,
    name: string,
    descriptions: Descriptions | undefined,
    order: string[],
) {
    const file = path.join(ROOT, descriptionsFile(key))
    const all = fs.existsSync(file)
        ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Record<
              string,
              Descriptions
          >)
        : {}
    if (descriptions) all[name] = descriptions
    else delete all[name]
    const index = (group: string) =>
        order.includes(group) ? order.indexOf(group) : order.length
    fs.writeFileSync(
        file,
        JSON.stringify(
            Object.fromEntries(
                Object.keys(all)
                    .sort((a, b) => index(a) - index(b))
                    .map((group) => [group, all[group]]),
            ),
            null,
            4,
        ) + '\n',
    )
}

const ORDER: Group['state'][] = ['failed', 'new', 'differs', 'removed', 'ok']

// Every app and platform's groups (e.g. main-ios), from the references,
// committed or not, and the run, shards merged.
function load() {
    const refs = referenceStatus()
    // screenshots/<key>/<group>.png (compared whole) or
    // screenshots/<key>/<group>/<case>.png.
    const references = new Set(refs.committed)
    for (const reference of refs.changed) references.add(reference)
    const byKey = new Map<string, Group[]>()
    const files = new Map<string, ReturnType<typeof readDescriptions>>()
    const descriptionsOf = (key: string) => {
        if (!files.has(key)) files.set(key, readDescriptions(key, refs))
        return files.get(key)!
    }
    for (const file of RUN ? findResults(RUN) : []) {
        const dir = path.dirname(file)
        const key = path.basename(path.dirname(dir))
        const results = readResults(file)
        const files = fs.readdirSync(dir)
        const names = results.hello?.groups ?? []
        for (const [name, statuses] of Object.entries(results.statuses ?? {})) {
            const index = names.indexOf(name)
            const prefix = `${String(index + 1).padStart(2, '0')}-${name}`
            const info = results.screenshots?.[name]
            // A run from before the cases had crops of their own (an area
            // only) has none to compare.
            const caseInfo = Object.fromEntries(
                Object.entries(info?.cases ?? {}).filter(([, c]) => c.file),
            )
            const run = results.descriptions?.[name]
            const descriptions =
                run ??
                descriptionsOf(key).current[name] ??
                descriptionsOf(key).committed[name]
            const descriptionsState = descriptionsChange(
                name,
                descriptionsOf(key),
                run,
            )
            const wholeReference = `screenshots/${key}/${name}.png`
            const byCase = !(references.has(wholeReference) || info?.whole)
            const cases = Object.entries(statuses).map(([id, status]) => {
                const c = caseInfo[id]
                const reference = `screenshots/${key}/${name}/${id}.png`
                return {
                    id,
                    status,
                    description: descriptions?.cases?.[id],
                    area: c?.area,
                    image:
                        byCase && (c || references.has(reference))
                            ? image(
                                  reference,
                                  refs,
                                  c && {
                                      ...c,
                                      file: path.join(dir, c.file),
                                      diff: c.diff && path.join(dir, c.diff),
                                  },
                              )
                            : undefined,
                }
            })
            const whole = byCase
                ? undefined
                : image(
                      wholeReference,
                      refs,
                      info && {
                          ...info,
                          file: path.join(dir, info.file),
                          diff: info.diff && path.join(dir, info.diff),
                      },
                  )
            const shot = info
                ? path.join(dir, info.file)
                : files.includes(`${prefix}.png`)
                  ? path.join(dir, `${prefix}.png`)
                  : undefined
            const failures = info?.failures ?? []
            const failed =
                cases.some((c) => c.status !== 'OK') || failures.length > 0
            const states: Group['state'][] = [
                ...(failed ? ['failed'] : []),
                descriptionsState.state,
                ...(whole ? [whole.state] : []),
                ...cases.flatMap((c) => (c.image ? [c.image.state] : [])),
            ] as Group['state'][]
            const list = byKey.get(key) ?? []
            list.push({
                key,
                name,
                index,
                state: ORDER.find((s) => states.includes(s)) ?? 'ok',
                // Runs from before results.json said: not approvable.
                approvable: !failed && !!info?.approvable,
                failures,
                detail: info?.detail,
                description: descriptions?.description,
                descriptions: descriptionsState,
                runDescriptions: run,
                shot,
                shotSize: pngSize(shot),
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
    // The groups the run didn't show, from their references and
    // descriptions.
    const others = new Map<string, Map<string, string[]>>()
    for (const key of fs.existsSync(SCREENSHOTS)
        ? fs.readdirSync(SCREENSHOTS)
        : []) {
        const described = descriptionsOf(key)
        for (const name of new Set([
            ...Object.keys(described.committed),
            ...Object.keys(described.current),
        ])) {
            if (byKey.get(key)?.some((g) => g.name === name)) continue
            const groups = others.get(key) ?? new Map<string, string[]>()
            if (!groups.has(name)) groups.set(name, [])
            others.set(key, groups)
        }
    }
    for (const reference of references) {
        const [, key, name, id] =
            reference.match(
                /^screenshots\/([^/]+)\/([^/]+?)(?:\/([^/]+))?\.png$/,
            ) ?? []
        if (!key || byKey.get(key)?.some((g) => g.name === name)) continue
        const groups = others.get(key) ?? new Map<string, string[]>()
        const ids = groups.get(name) ?? []
        if (id) ids.push(id)
        groups.set(name, ids)
        others.set(key, groups)
    }
    for (const [key, groups] of others) {
        const list = byKey.get(key) ?? []
        const described = descriptionsOf(key)
        // The app's order, as descriptions.json has it.
        const order = Object.keys({
            ...described.committed,
            ...described.current,
        })
        for (const [name, ids] of groups) {
            const descriptions =
                described.current[name] ?? described.committed[name]
            const descriptionsState = descriptionsChange(name, described)
            const wholeReference = `screenshots/${key}/${name}.png`
            const whole = references.has(wholeReference)
                ? image(wholeReference, refs)
                : undefined
            // In the app's order, as the descriptions have them, with the
            // described cases that have no reference (the web version's, or
            // one with nothing to show).
            const caseOrder = Object.keys(descriptions?.cases ?? {})
            const position = (id: string) =>
                caseOrder.includes(id)
                    ? caseOrder.indexOf(id)
                    : caseOrder.length
            const cases = (whole ? ids : [...new Set([...ids, ...caseOrder])])
                .sort((a, b) => position(a) - position(b) || a.localeCompare(b))
                .map((id) => {
                    const reference = `screenshots/${key}/${name}/${id}.png`
                    return {
                        id,
                        status: '',
                        description: descriptions?.cases?.[id],
                        image: references.has(reference)
                            ? image(reference, refs)
                            : undefined,
                    }
                })
            const states: Group['state'][] = [
                descriptionsState.state,
                ...(whole ? [whole.state] : []),
                ...cases.flatMap((c) => (c.image ? [c.image.state] : [])),
            ]
            list.push({
                key,
                name,
                index:
                    order.indexOf(name) === -1
                        ? Number.MAX_SAFE_INTEGER
                        : order.indexOf(name),
                state: ORDER.find((s) => states.includes(s)) ?? 'ok',
                approvable: false,
                failures: [],
                description: descriptions?.description,
                descriptions: descriptionsState,
                whole,
                cases,
                samples: [],
            })
        }
        byKey.set(key, list)
    }
    return [...byKey.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, groups]) => ({
            key,
            groups: groups.sort(
                (a, b) => a.index - b.index || a.name.localeCompare(b.name),
            ),
        }))
}

// Only files in the run and the references are served.
const servable = (file: string) =>
    [RUN, SCREENSHOTS].some((root) => root && file.startsWith(root + path.sep))

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
                    run: RUN ? path.relative(ROOT, RUN) : null,
                    entries: load(),
                }),
                'application/json',
            )
        }
        if (url.pathname === '/file') {
            // An absolute path, or one in the repository.
            const file = path.resolve(ROOT, url.searchParams.get('path') ?? '')
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
        // A committed reference (git's HEAD), by its path in the
        // repository.
        if (url.pathname === '/committed') {
            const reference = url.searchParams.get('path') ?? ''
            if (
                !/^screenshots\/[^/]+(\/[^/]+)*\.png$/.test(reference) ||
                reference.split('/').includes('..')
            )
                return send(404, 'not a reference')
            let png: Buffer
            try {
                png = git('show', `HEAD:${reference}`)
            } catch {
                return send(404, 'not committed')
            }
            response.writeHead(200, {
                'content-type': 'image/png',
                'cache-control': 'no-store',
            })
            return response.end(png)
        }
        // JSON only: another site's page can't send that without the
        // browser asking first (CORS), which this server doesn't answer.
        const action = { '/api/approve': approve, '/api/undo': undo }[
            url.pathname
        ]
        if (
            action &&
            request.method === 'POST' &&
            request.headers['content-type'] === 'application/json'
        ) {
            let body = ''
            request.on('data', (chunk) => (body += chunk))
            request.on('end', () => guard(() => action(body, send)))
            return
        }
        send(404, 'not found')
    })
})

// The images a request is for: a group's (whole, and its cases'), or one
// case's (id); body: { key, name, id? }.
function requested(body: string, send: Send) {
    let parsed: { key?: unknown; name?: unknown; id?: unknown } | null
    try {
        parsed = JSON.parse(body)
    } catch {
        send(400, 'not JSON')
        return undefined
    }
    const key = parsed?.key
    const name = parsed?.name
    const id = parsed?.id
    if (
        typeof key !== 'string' ||
        typeof name !== 'string' ||
        (id !== undefined && typeof id !== 'string')
    ) {
        send(400, 'needs a key and a name')
        return undefined
    }
    const entry = load().find((e) => e.key === key)
    const group = entry?.groups.find((g) => g.name === name)
    if (!entry || !group) {
        send(404, 'no such group')
        return undefined
    }
    // The app's order, for descriptions.json.
    const order = entry.groups.map((g) => g.name)
    const images = [
        ...(group.whole && !id ? [group.whole] : []),
        ...group.cases.flatMap((c) =>
            c.image && (!id || c.id === id) ? [c.image] : [],
        ),
    ]
    // Only a run's files over references, in screenshots/ (a --pr run's
    // results.json comes from the PR).
    const inScreenshots = (file: string) =>
        path.resolve(ROOT, file).startsWith(SCREENSHOTS + path.sep)
    if (
        !/^[\w.-]+$/.test(key) ||
        key === '..' ||
        images.some(
            (image) =>
                !inScreenshots(image.reference) ||
                !image.reference.endsWith('.png') ||
                (image.current !== undefined &&
                    !servable(path.resolve(image.current))),
        )
    ) {
        send(400, 'not a reference')
        return undefined
    }
    // A group's descriptions go with the whole group, not one case.
    return { group, images, order, whole: id === undefined }
}

// Copies a run's screenshots that aren't references yet over them, in
// screenshots/ (to commit).
function approve(body: string, send: Send) {
    const request = requested(body, send)
    if (!request) return
    const { group } = request
    if (!group.approvable) return send(409, "can't be approved")
    const images = request.images.filter(
        (image): image is Image & { current: string } =>
            !image.approved && !!image.current,
    )
    const descriptions =
        request.whole &&
        group.runDescriptions &&
        !group.descriptions.approved &&
        group.descriptions.state !== 'ok'
    if (images.length === 0 && !descriptions)
        return send(404, 'nothing to approve')
    if (descriptions) {
        writeDescriptions(
            group.key,
            group.name,
            group.runDescriptions,
            request.order,
        )
        console.log(`approved ${group.key}/${group.name}'s descriptions`)
    }
    for (const image of images) {
        const reference = path.join(ROOT, image.reference)
        fs.mkdirSync(path.dirname(reference), { recursive: true })
        fs.copyFileSync(image.current, reference)
        console.log(`approved ${image.reference}`)
    }
    send(200, 'ok')
}

// Puts the committed references back in screenshots/ (or removes ones that
// aren't committed): undoes approvals that aren't committed.
function undo(body: string, send: Send) {
    const request = requested(body, send)
    if (!request) return
    const { group } = request
    const images = request.images.filter((image) => image.approved)
    const descriptions = request.whole && group.descriptions.approved
    if (images.length === 0 && !descriptions)
        return send(404, 'nothing to undo')
    if (descriptions) {
        writeDescriptions(
            group.key,
            group.name,
            group.descriptions.committed,
            request.order,
        )
        console.log(`undid ${group.key}/${group.name}'s descriptions`)
    }
    for (const image of images) {
        if (image.committed) git('checkout', 'HEAD', '--', image.reference)
        else fs.rmSync(path.join(ROOT, image.reference), { force: true })
        console.log(`undid ${image.reference}`)
    }
    send(200, 'ok')
}

server.listen(port, '127.0.0.1', () => {
    console.log(
        `Regression viewer for ${RUN ? path.relative(ROOT, RUN) || RUN : options.references ? 'the references' : 'the references (no run with comparisons in verify-output/)'}: http://localhost:${port} (Ctrl-C to stop)`,
    )
})
