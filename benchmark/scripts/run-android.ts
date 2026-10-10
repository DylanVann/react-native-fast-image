// Runs the benchmark on Android (see ../README.md): on a connected device or
// emulator (adb), or on Firebase Test Lab's physical devices (--firebase).
//
//   bun benchmark/scripts/run-android.ts [--subjects fast-image,image] [--scenarios grid,large]
//                                        [--tests time-to-image,scroll,large-memory,burst]
//                                        [--burst plain,fade,placeholder,fade+placeholder]
//                                        [--iterations 5] [--latency 40] [--mbps 0]
//                                        [--no-build | --apks <results folder>] [--out <results folder>]
//                                        [--firebase --device model=…,version=…] [--project <id>]
//                                        [--paired [--phones 5] [--both-orders]] [--no-run]
//
// For each subject: builds the app with only that library (app/subjects.js)
// and the Macrobenchmark test APK (android/macrobenchmark), in release
// (keeping both in the results folder's apks/), then runs the tests, on
// Firebase Test Lab all subjects at once: time-to-image records the screen
// while each scenario runs and saves the recordings and the app's results,
// which are analyzed here as on iOS (analyze.ts); scroll, large-memory and
// burst (frame timing as the grid's images load at once, with the variants in
// --burst: see BurstTest in BenchmarkTest.kt) are Macrobenchmark metrics.
// --no-build uses the APKs kept in --out's apks/, --apks those of another
// results folder. Writes
// android-<subject>-<scenario>-<n>.json and metrics-android-<subject>.json to
// the results folder, and prints a summary.
//
// --paired compares the subjects on the same phone (e.g. fast-image-9 and
// fast-image-local, this checkout's FastImage), with time-to-image (the
// default) or any of the tests: every subject's app is installed on each
// phone, which runs them in turns (BenchmarkTest.kt), on --phones phones at
// once on Test Lab (one locally). Phones of the same model differ by hundreds of ms, more
// than many changes do; run by run on one phone, the subjects' differences
// show. With --both-orders, every other phone runs the subjects in the
// opposite order, for the tests that run one subject's iterations in a row
// (scroll, large-memory, burst; time-to-image alternates on each phone).
// Writes android-<subject>-<scenario>-<phone>-<n>.json,
// metrics-android-phone-<phone>.json, and a paired comparison in the
// summary.
//
// --no-run analyzes the outputs already in --out (e.g. after a change to the
// analysis), without building or running anything.

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { analyze } from './analyze'
import { summarize } from './summarize'

const BENCHMARK = path.join(import.meta.dir, '..')
const APP = path.join(BENCHMARK, 'app')
const ANDROID = path.join(APP, 'android')
const ADB = path.join(os.homedir(), 'Library/Android/sdk/platform-tools/adb')
const TEST_PACKAGE = 'com.dylanvann.rnfibenchmark.macrobenchmark'
const RUNNER = `${TEST_PACKAGE}/androidx.test.runner.AndroidJUnitRunner`
// Where the tests write their outputs (Macrobenchmark's output folder).
const DEVICE_OUTPUT = `/sdcard/Android/media/${TEST_PACKAGE}`
// The parameterized tests by class: a method filter doesn't match their
// names (e.g. burst[<variant>,<package>]).
const TESTS: Record<string, string> = {
    'time-to-image': 'BenchmarkTest#timeToImage',
    scroll: 'ScrollTest',
    'large-memory': 'LargeMemoryTest',
    burst: 'BurstTest',
}
const ENV = {
    JAVA_HOME: '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
    ANDROID_HOME: path.join(os.homedir(), 'Library/Android/sdk'),
}

const subjects: Record<string, { name: string }> = JSON.parse(
    fs.readFileSync(path.join(APP, 'subjects.json'), 'utf8'),
)
const argv = process.argv.slice(2)
const option = (name: string, fallback: string) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : fallback
}
const flag = (name: string) => argv.includes(`--${name}`)
const list = (value: string) => value.split(',').filter(Boolean)
const chosenSubjects = list(option('subjects', Object.keys(subjects).join(',')))
const scenarios = list(option('scenarios', 'grid,large'))
const paired = flag('paired')
const tests = list(
    option('tests', paired ? 'time-to-image' : Object.keys(TESTS).join(',')),
)
const burst = option('burst', '')
const iterations = Number(option('iterations', '5'))
const firebase = flag('firebase')
const phones = paired && firebase ? Number(option('phones', '5')) : 1
const bothOrders = flag('both-orders')
// The network of the image server the tests run on the phone: latency before
// each response, and bandwidth shared by all of them (0, the default: no
// limit, so the times are the libraries' own work rather than the link's;
// e.g. 50 for a slow network).
const latencyMs = Number(option('latency', '40'))
const mbps = Number(option('mbps', '0'))
// The Pixel 8 (Android 15): the same generation as the iPhone 15 Pro Max
// the iOS runs use, and one Test Lab has many of (high capacity).
const firebaseDevice = option('device', 'model=shiba,version=35')
const firebaseProject = option('project', 'react-native-fast-image')
for (const subject of chosenSubjects) {
    if (!subjects[subject]) throw new Error(`Unknown subject ${subject}`)
}
for (const test of tests) {
    if (!TESTS[test]) throw new Error(`Unknown test ${test}`)
}
if (paired && chosenSubjects.length < 2) {
    throw new Error('--paired needs two subjects or more (--subjects)')
}

const log = (line: string) => console.log(line)

function run(
    cmd: string,
    args: string[],
    options: {
        cwd?: string
        env?: Record<string, string>
        allowFailure?: boolean
        timeoutMs?: number
    } = {},
) {
    const result = spawnSync(cmd, args, {
        cwd: options.cwd,
        env: { ...process.env, ...ENV, ...options.env },
        encoding: 'utf8',
        maxBuffer: 1 << 28,
        // Builds included; a hung adb or gcloud fails instead of waiting.
        timeout: options.timeoutMs ?? 30 * 60_000,
    })
    if (result.status !== 0 && !options.allowFailure) {
        throw new Error(
            `${cmd} ${args.join(' ')} failed:\n${(result.stdout + result.stderr).slice(-3000)}`,
        )
    }
    return result.stdout
}

const packageName = (subject: string) =>
    `com.dylanvann.rnfibenchmark.${subject.replace(/[^a-z0-9]/gi, '')}`
const appApk = path.join(
    ANDROID,
    'app/build/outputs/apk/release/app-release.apk',
)
const testApk = path.join(
    ANDROID,
    'macrobenchmark/build/outputs/apk/benchmark/macrobenchmark-benchmark.apk',
)

// The checkout's FastImage version and commit, for the fast-image-local
// subject's results.
const localVersion = () => {
    const root = path.join(BENCHMARK, '..')
    const version = JSON.parse(
        fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    ).version
    const commit = run('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: root,
    }).trim()
    const dirty = run(
        'git',
        ['status', '--porcelain', '--', 'src', 'android', 'ios'],
        {
            cwd: root,
        },
    ).trim()
    return `${version} (${commit}${dirty ? ', with changes' : ''})`
}

function build(subject: string) {
    log(`build ${subject}`)
    const env: Record<string, string> = { BENCH_SUBJECT: subject }
    if ((subjects[subject] as { local?: string }).local) {
        env.EXPO_PUBLIC_FAST_IMAGE_LOCAL = localVersion()
    }
    fs.writeFileSync(
        path.join(APP, 'src', 'subject.ts'),
        `// Written by ../../scripts/run-android.ts: the subject this build is for.\nexport { default } from '../subjects/${subject}'\n`,
    )
    run(
        'bunx',
        ['expo', 'prebuild', '-p', 'android', '--clean', '--no-install'],
        { cwd: APP, env },
    )
    // One ABI: the emulator on Apple silicon and current phones are arm64.
    run(
        './gradlew',
        [
            ':app:assembleRelease',
            ':macrobenchmark:assembleBenchmark',
            '-PreactNativeArchitectures=arm64-v8a',
            '--console=plain',
            '-q',
        ],
        { cwd: ANDROID, env },
    )
}

// The instrumentation arguments for a subject, or (paired) several.
const testArgs = (subject: string | string[]): Record<string, string> => ({
    ...(Array.isArray(subject)
        ? { benchPackages: subject.map(packageName).join(',') }
        : { benchPackage: packageName(subject) }),
    benchIterations: String(iterations),
    benchScenarios: scenarios.join(','),
    ...(burst ? { benchBurst: burst } : {}),
    benchLatencyMs: String(latencyMs),
    benchMbps: String(mbps),
    ...(firebase
        ? {}
        : {
              // Development on an emulator: Macrobenchmark refuses it
              // otherwise.
              'androidx.benchmark.suppressErrors':
                  'EMULATOR,LOW-BATTERY,UNLOCKED,DEBUGGABLE',
          }),
})

// Runs the tests on the adb device, and pulls their outputs into `into`. The
// app is installed fresh (no caches from earlier runs), and no other
// benchmark app keeps running.
function runLocal(
    subject: string | string[],
    into: string,
    apks: Apks,
    others: Apks[] = [],
) {
    const own = Array.isArray(subject) ? subject : [subject]
    const label = own.join('+')
    for (const other of Object.keys(subjects)) {
        run(ADB, ['shell', 'am', 'force-stop', packageName(other)], {
            allowFailure: true,
        })
    }
    for (const s of own) {
        run(ADB, ['uninstall', packageName(s)], { allowFailure: true })
    }
    for (const app of [apks, ...others]) run(ADB, ['install', app.app])
    run(ADB, ['install', '-r', '-t', apks.test])
    run(ADB, ['shell', `rm -rf ${DEVICE_OUTPUT}/*`], { allowFailure: true })
    const args = Object.entries(testArgs(subject)).flatMap(([k, v]) => [
        '-e',
        k,
        v,
    ])
    // One instrumentation run, so Macrobenchmark's metrics file has them all.
    log(`  ${tests.join(', ')}`)
    const output = run(
        ADB,
        [
            'shell',
            'am',
            'instrument',
            '-w',
            '-r',
            ...args,
            '-e',
            'class',
            tests.map((t) => `${TEST_PACKAGE}.${TESTS[t]}`).join(','),
            RUNNER,
        ],
        { timeoutMs: 60 * 60_000 },
    )
    if (!/\nOK \(\d+ tests?\)/.test(output)) {
        const failures = [
            ...output.matchAll(/Error in (\w+)\(.*\):\n([^\n]*)/g),
        ]
        for (const failure of failures) failed(label, failure[1], failure[2])
        // e.g. "Process crashed."
        if (!failures.length) failed(label, 'tests', output.slice(-1000))
    }
    fs.mkdirSync(into, { recursive: true })
    run(ADB, ['pull', `${DEVICE_OUTPUT}/.`, into])
}

// Runs the tests on Firebase Test Lab, and downloads their outputs into
// `into`. Several can run at once, on separate devices.
async function runFirebase(
    subject: string | string[],
    into: string,
    apks: Apks,
    others: Apks[] = [],
    phone?: number,
) {
    const label = Array.isArray(subject) ? subject.join('+') : subject
    const bucketDir = `benchmark-${path.basename(out)}-${Array.isArray(subject) ? `paired-${phone}` : subject}`
    // `^;^`: entries separated by `;`, as values have commas (gcloud topic
    // escaping).
    const env =
        '^;^' +
        Object.entries(testArgs(subject))
            .map(([k, v]) => `${k}=${v}`)
            .join(';')
    log(
        `  ${label}${phone ? ` (phone ${phone})` : ''}: firebase (${firebaseDevice})`,
    )
    const test = spawn('gcloud', [
        'firebase',
        'test',
        'android',
        'run',
        '--type',
        'instrumentation',
        '--app',
        apks.app,
        '--test',
        apks.test,
        ...(others.length > 0
            ? ['--additional-apks', others.map((o) => o.app).join(',')]
            : []),
        '--device',
        firebaseDevice,
        // Test Lab's own screen recording and sampling would run alongside
        // the measurements (and a second recorder).
        '--no-record-video',
        '--no-performance-metrics',
        '--test-targets',
        tests.map((t) => `class ${TEST_PACKAGE}.${TESTS[t]}`).join(','),
        '--environment-variables',
        env,
        '--directories-to-pull',
        DEVICE_OUTPUT,
        '--results-dir',
        bucketDir,
        '--timeout',
        '45m',
        '--format',
        'json',
        '--project',
        firebaseProject,
    ])
    let output = ''
    test.stdout.on('data', (d) => (output += d))
    test.stderr.on('data', (d) => (output += d))
    const status = await new Promise<number>((resolve) =>
        test.on('close', (code) => resolve(code ?? 1)),
    )
    // gcloud reports where the results are as a Cloud Console url:
    // …/storage/browser/<bucket>/<folder>/
    const location = output.match(/storage\/browser\/([^\s\]]+)/)?.[1]
    if (!location) {
        throw new Error(
            `firebase test didn't report its results:\n${output.slice(-2000)}`,
        )
    }
    // e.g. 10: a test failed (its other outputs are still analyzed).
    if (status !== 0) {
        failed(
            label,
            'tests',
            `gcloud exited with ${status}:\n${output.slice(-1500)}`,
        )
    }
    fs.mkdirSync(into, { recursive: true })
    run('gcloud', [
        'storage',
        'cp',
        '-r',
        `gs://${location.replace(/\/$/, '')}/*`,
        into,
        '--project',
        firebaseProject,
    ])
}

const out = path.resolve(
    option(
        'out',
        path.join(
            BENCHMARK,
            'results',
            new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19),
        ),
    ),
)
fs.mkdirSync(out, { recursive: true })

const failed = (subject: string, scenario: string, error: unknown) => {
    const file = path.join(out, 'failures.json')
    const failures = fs.existsSync(file)
        ? JSON.parse(fs.readFileSync(file, 'utf8'))
        : []
    failures.push({
        platform: 'android',
        subject,
        scenario,
        error: String(error),
    })
    fs.writeFileSync(file, JSON.stringify(failures, null, 2))
    log(`  ${subject} ${scenario}: ${error}`)
}

// Finds a file anywhere under `dir` (Firebase nests its outputs).
function findFiles(dir: string, match: RegExp): string[] {
    return (fs.readdirSync(dir, { recursive: true }) as string[])
        .filter((f) => match.test(path.basename(f)))
        .map((f) => path.join(dir, f))
}

// A folder named `name` anywhere under `dir`.
function findDir(dir: string, name: string): string | undefined {
    if (!fs.existsSync(dir)) return undefined
    const found = (fs.readdirSync(dir, { recursive: true }) as string[]).find(
        (f) =>
            path.basename(f) === name &&
            fs.statSync(path.join(dir, f)).isDirectory(),
    )
    return found && path.join(dir, found)
}

log(
    `results ${path.relative(process.cwd(), out)}; images served on the phone (${latencyMs} ms, ${mbps || 'unlimited'} Mbps)${firebase ? `; Firebase Test Lab (${firebaseDevice})` : '; adb device'}`,
)
type Apks = { app: string; test: string }

// Analyzes a subject's pulled outputs: each recording with its run's results
// (time to image), and Macrobenchmark's metrics. A paired run's outputs are in
// a folder per app, and its files are named after the phone too.
async function analyzeOutputs(subject: string, pulled: string, phone?: number) {
    // A paired run's: the phone's, for all its apps.
    const metrics = findFiles(pulled, /benchmarkData\.json$/)[0]
    if (metrics) {
        fs.copyFileSync(
            metrics,
            path.join(
                out,
                `metrics-android-${phone ? `phone-${phone}` : subject}.json`,
            ),
        )
    }
    const dir = phone ? findDir(pulled, packageName(subject)) : pulled
    if (!dir) {
        // Only time-to-image writes a paired run's app folders.
        if (tests.includes('time-to-image')) {
            failed(subject, 'tests', `phone ${phone}: no outputs`)
        }
        return
    }
    // Runs the test wrote off as failed (see BenchmarkTest.kt).
    for (const file of findFiles(dir, /^[a-z]+-\d+\.error$/)) {
        const [, scenario] = path.basename(file).match(/^(\w+)-/)!
        failed(subject, scenario, fs.readFileSync(file, 'utf8'))
    }
    for (const json of findFiles(dir, /^[a-z]+-\d+\.json$/)) {
        const [, scenario, n] = path
            .basename(json)
            .match(/^(\w+)-(\d+)\.json$/)!
        const video = json.replace(/\.json$/, '.mp4')
        try {
            const data = JSON.parse(fs.readFileSync(json, 'utf8'))
            const analysis = await analyze(data, video)
            const name = phone
                ? `android-${subject}-${scenario}-${phone}-${n}.json`
                : `android-${subject}-${scenario}-${n}.json`
            fs.writeFileSync(
                path.join(out, name),
                JSON.stringify(
                    {
                        ...data,
                        imageServer: { latencyMs, mbps },
                        ...(phone ? { phone, iteration: Number(n) } : {}),
                        analysis,
                    },
                    null,
                    2,
                ),
            )
            log(
                `  ${subject} ${scenario}${phone ? ` phone ${phone}` : ''} #${n}: first ${analysis.firstMs} ms, all ${analysis.allMs} ms (${analysis.timed} timed), ${data.imageRequests ?? '?'} requests, network ${Math.round(data.network?.mbps)} Mbps${analysis.error ? `: ${analysis.error}` : ''}`,
            )
        } catch (error) {
            failed(subject, scenario, error)
        }
    }
}

if (flag('no-run')) {
    // A paired run's phones: the folders it downloaded.
    const pairedPhones = paired
        ? fs
              .readdirSync(out)
              .map((name) => name.match(/^android-paired-(\d+)-outputs$/)?.[1])
              .filter((phone) => phone !== undefined)
              .map(Number)
              .sort((a, b) => a - b)
        : []
    for (const phone of pairedPhones) {
        const pulled = path.join(out, `android-paired-${phone}-outputs`)
        for (const subject of chosenSubjects) {
            await analyzeOutputs(subject, pulled, phone)
        }
    }
    for (const subject of paired ? [] : chosenSubjects) {
        await analyzeOutputs(
            subject,
            path.join(out, `android-${subject}-outputs`),
        )
    }
    log('')
    log(summarize(out))
    process.exit(0)
}

// Builds every subject first (they share the generated project), keeping
// each one's APKs.
const apks = new Map<string, Apks>()
// --apks: an earlier results folder's APKs, without building (as --no-build
// with that folder as --out, but writing to a new one).
const apksFrom = option('apks', '')
const apkDir = apksFrom
    ? path.join(path.resolve(apksFrom), 'apks')
    : path.join(out, 'apks')
fs.mkdirSync(apkDir, { recursive: true })
for (const subject of chosenSubjects) {
    const kept = {
        app: path.join(apkDir, `${subject}-app.apk`),
        test: path.join(apkDir, `${subject}-test.apk`),
    }
    if (flag('no-build') || apksFrom) {
        if (!fs.existsSync(kept.app) || !fs.existsSync(kept.test)) {
            throw new Error(
                `--no-build: no APKs for ${subject} in ${path.relative(process.cwd(), apkDir)} (pass --out with an earlier results folder)`,
            )
        }
        apks.set(subject, kept)
        continue
    }
    try {
        build(subject)
        fs.copyFileSync(appApk, kept.app)
        fs.copyFileSync(testApk, kept.test)
        apks.set(subject, kept)
    } catch (error) {
        failed(subject, 'build', String(error).slice(0, 2000))
    }
}

const runSubject = async (subject: string, subjectApks: Apks) => {
    const pulled = path.join(out, `android-${subject}-outputs`)
    fs.rmSync(pulled, { recursive: true, force: true })
    try {
        if (firebase) await runFirebase(subject, pulled, subjectApks)
        else runLocal(subject, pulled, subjectApks)
    } catch (error) {
        failed(subject, 'tests', error)
        return
    }
    await analyzeOutputs(subject, pulled)
}
// Paired: every subject's app on each phone, the first one's test APK (they're
// the same test).
const runPhone = async (phone: number) => {
    const built = chosenSubjects.filter((s) => apks.has(s))
    const order = bothOrders && phone % 2 === 0 ? [...built].reverse() : built
    const pulled = path.join(out, `android-paired-${phone}-outputs`)
    fs.rmSync(pulled, { recursive: true, force: true })
    const [first, ...rest] = order.map((s) => apks.get(s)!)
    try {
        if (firebase) await runFirebase(order, pulled, first, rest, phone)
        else runLocal(order, pulled, first, rest)
    } catch (error) {
        failed(built.join('+'), 'tests', error)
        return
    }
    for (const subject of built) await analyzeOutputs(subject, pulled, phone)
}
if (paired) {
    await Promise.all(Array.from({ length: phones }, (_, i) => runPhone(i + 1)))
} else if (firebase) {
    await Promise.all(
        [...apks].map(([subject, subjectApks]) =>
            runSubject(subject, subjectApks),
        ),
    )
} else {
    for (const [subject, subjectApks] of apks)
        await runSubject(subject, subjectApks)
}

log('')
log(summarize(out))
