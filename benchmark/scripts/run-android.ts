// Runs the benchmark on Android (see ../README.md): on a connected device or
// emulator (adb), or on Firebase Test Lab's physical devices (--firebase).
//
//   bun benchmark/scripts/run-android.ts [--subjects fast-image,image] [--scenarios grid,large]
//                                        [--tests time-to-image,scroll,large-memory]
//                                        [--iterations 5] [--no-build] [--out <results folder>]
//                                        [--firebase --device model=…,version=…]
//
// For each subject: builds the app with only that library (app/subjects.js)
// and the Macrobenchmark test APK (android/macrobenchmark), in release
// (keeping both in the results folder's apks/), then runs the tests, on
// Firebase Test Lab all subjects at once: time-to-image records the screen while each scenario runs
// and saves the recordings and the app's results, which are analyzed here as
// on iOS (analyze.ts); scroll and large-memory are Macrobenchmark metrics.
// Writes android-<subject>-<scenario>-<n>.json and
// metrics-android-<subject>.json to the results folder, and prints a summary.

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
const TESTS: Record<string, string> = {
    'time-to-image': 'timeToImage',
    scroll: 'scroll',
    'large-memory': 'largeMemory',
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
const tests = list(option('tests', Object.keys(TESTS).join(',')))
const iterations = Number(option('iterations', '5'))
const firebase = flag('firebase')
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

const log = (line: string) => console.log(line)

function run(
    cmd: string,
    args: string[],
    options: {
        cwd?: string
        env?: Record<string, string>
        allowFailure?: boolean
    } = {},
) {
    const result = spawnSync(cmd, args, {
        cwd: options.cwd,
        env: { ...process.env, ...ENV, ...options.env },
        encoding: 'utf8',
        maxBuffer: 1 << 28,
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

function build(subject: string) {
    log(`build ${subject}`)
    const env = { BENCH_SUBJECT: subject }
    fs.writeFileSync(
        path.join(APP, 'src', 'subject.ts'),
        `// Written by ../../scripts/run.ts: the subject this build is for.\nexport { default } from '../subjects/${subject}'\n`,
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

// The instrumentation arguments for a subject.
const testArgs = (subject: string): Record<string, string> => ({
    benchPackage: packageName(subject),
    benchIterations: String(iterations),
    benchScenarios: scenarios.join(','),
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

// Runs the tests on the adb device, and pulls their outputs into `into`.
function runLocal(subject: string, into: string, apks: Apks) {
    run(ADB, ['install', '-r', apks.app])
    run(ADB, ['install', '-r', '-t', apks.test])
    run(ADB, ['shell', `rm -rf ${DEVICE_OUTPUT}/*`], { allowFailure: true })
    const args = Object.entries(testArgs(subject)).flatMap(([k, v]) => [
        '-e',
        k,
        v,
    ])
    // One instrumentation run, so Macrobenchmark's metrics file has them all.
    log(`  ${tests.join(', ')}`)
    const output = run(ADB, [
        'shell',
        'am',
        'instrument',
        '-w',
        '-r',
        ...args,
        '-e',
        'class',
        tests.map((t) => `${TEST_PACKAGE}.BenchmarkTest#${TESTS[t]}`).join(','),
        RUNNER,
    ])
    if (!/\nOK \(\d+ tests?\)/.test(output)) {
        for (const failure of output.matchAll(
            /Error in (\w+)\(.*\):\n([^\n]*)/g,
        )) {
            failed(subject, failure[1], failure[2])
        }
    }
    fs.mkdirSync(into, { recursive: true })
    run(ADB, ['pull', `${DEVICE_OUTPUT}/.`, into])
}

// Runs the tests on Firebase Test Lab, and downloads their outputs into
// `into`. Several can run at once, on separate devices.
async function runFirebase(subject: string, into: string, apks: Apks) {
    const bucketDir = `benchmark-${path.basename(out)}-${subject}`
    // `^;^`: entries separated by `;`, as values have commas (gcloud topic
    // escaping).
    const env =
        '^;^' +
        Object.entries(testArgs(subject))
            .map(([k, v]) => `${k}=${v}`)
            .join(';')
    log(`  ${subject}: firebase (${firebaseDevice})`)
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
        '--device',
        firebaseDevice,
        '--test-targets',
        tests
            .map((t) => `class ${TEST_PACKAGE}.BenchmarkTest#${TESTS[t]}`)
            .join(','),
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
    if (status !== 0)
        log(
            `  ${subject}: gcloud exited with ${status}:\n${output.slice(-1500)}`,
        )
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

log(
    `results ${path.relative(process.cwd(), out)}; images served on the phone (${latencyMs} ms, ${mbps || 'unlimited'} Mbps)${firebase ? `; Firebase Test Lab (${firebaseDevice})` : '; adb device'}`,
)
type Apks = { app: string; test: string }

// Analyzes a subject's pulled outputs: each recording with its run's results
// (time to image), and Macrobenchmark's metrics.
async function analyzeOutputs(subject: string, pulled: string) {
    for (const json of findFiles(pulled, /^(grid|large|scroll)-\d+\.json$/)) {
        const [, scenario, n] = path
            .basename(json)
            .match(/^(\w+)-(\d+)\.json$/)!
        const video = json.replace(/\.json$/, '.mp4')
        try {
            const data = JSON.parse(fs.readFileSync(json, 'utf8'))
            const analysis = await analyze(data, video)
            fs.writeFileSync(
                path.join(out, `android-${subject}-${scenario}-${n}.json`),
                JSON.stringify(
                    { ...data, imageServer: { latencyMs, mbps }, analysis },
                    null,
                    2,
                ),
            )
            log(
                `  ${subject} ${scenario} #${n}: first ${analysis.firstMs} ms, all ${analysis.allMs} ms (${analysis.timed} timed), network ${Math.round(data.network?.before?.mbps)} / ${Math.round(data.network?.after?.mbps)} Mbps${analysis.error ? `: ${analysis.error}` : ''}`,
            )
        } catch (error) {
            failed(subject, scenario, error)
        }
    }
    const metrics = findFiles(pulled, /benchmarkData\.json$/)[0]
    if (metrics) {
        fs.copyFileSync(
            metrics,
            path.join(out, `metrics-android-${subject}.json`),
        )
    }
}

// Builds every subject first (they share the generated project), keeping
// each one's APKs.
const apks = new Map<string, Apks>()
const apkDir = path.join(out, 'apks')
fs.mkdirSync(apkDir, { recursive: true })
for (const subject of chosenSubjects) {
    const kept = {
        app: path.join(apkDir, `${subject}-app.apk`),
        test: path.join(apkDir, `${subject}-test.apk`),
    }
    if (flag('no-build')) {
        // The last build's APKs (for the one subject it was).
        apks.set(
            subject,
            fs.existsSync(kept.app) ? kept : { app: appApk, test: testApk },
        )
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
if (firebase) {
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
