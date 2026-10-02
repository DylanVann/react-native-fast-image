// Runs the benchmark on a connected iPhone (see ../README.md).
//
//   bun benchmark/scripts/run.ts [--subjects fast-image,image] [--scenarios grid,large]
//                                [--metrics scroll,large-memory] [--iterations 5]
//                                [--latency 40] [--mbps 50]
//                                [--no-build] [--keep-videos] [--out <results folder>]
//
// Needs BENCH_APPLE_TEAM_ID (your team, for signing). Builds the XCUITest
// runner (../ios), which serves the images on the phone (ImageServer.swift).
// Then for each subject: builds the app with only that library
// (app/subjects.js), in Release, installs it, starts the runner's image
// server (testServe), and runs the app once unmeasured (a newly installed
// app's first launch is slower). Then for each scenario, `iterations` times:
// records the phone's screen (capture/), launches the app with a new run id
// (so nothing comes from an earlier run's caches; the process is new too),
// waits for the app's results file (copied from the device over USB), stops
// the recording, and finds when each image showed in it (analyze.ts). Then
// stops the server and runs the XCTest metrics (hitches while scrolling,
// memory), `iterations` measurements each. Writes
// results/<time>/<subject>-<scenario>-<n>.json and metrics-<subject>.xcresult,
// and prints a summary (also in summary.md).

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { analyze, type Analysis, type Results } from './analyze'
import { summarize } from './summarize'

const BENCHMARK = path.join(import.meta.dir, '..')
const APP = path.join(BENCHMARK, 'app')
const CAPTURE = path.join(BENCHMARK, 'capture')
const IOS = path.join(BENCHMARK, 'ios')
// --metrics names, and their tests in ../ios/UITests.
const METRIC_TESTS: Record<string, string> = {
    scroll: 'testScroll',
    'large-memory': 'testLargeMemory',
}
// How long a run may take: the app's longest wait (the large scenario's) and
// launch.
const RUN_TIMEOUT = 60_000
// The port the runner's image server listens on, on the phone.
const PORT = 8099
const SERVER = `http://127.0.0.1:${PORT}`

const subjects: Record<string, { name: string }> = JSON.parse(
    fs.readFileSync(path.join(APP, 'subjects.json'), 'utf8'),
)

const argv = process.argv.slice(2)
const option = (name: string, fallback: string) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : fallback
}
const flag = (name: string) => argv.includes(`--${name}`)
const chosenSubjects = option('subjects', Object.keys(subjects).join(','))
    .split(',')
    .filter(Boolean)
const scenarios = option('scenarios', 'grid,large').split(',').filter(Boolean)
const metricNames = option('metrics', Object.keys(METRIC_TESTS).join(','))
    .split(',')
    .filter(Boolean)
const iterations = Number(option('iterations', '5'))
// The image server's network: latency before each response, and bandwidth
// shared by all of them (0 for none), as on Android.
const latencyMs = Number(option('latency', '40'))
const mbps = Number(option('mbps', '50'))
if (!process.env.BENCH_APPLE_TEAM_ID) {
    throw new Error('Set BENCH_APPLE_TEAM_ID (your Apple team id, for signing)')
}
for (const name of metricNames) {
    if (!METRIC_TESTS[name]) throw new Error(`Unknown metrics ${name}`)
}
for (const subject of chosenSubjects) {
    if (!subjects[subject]) throw new Error(`Unknown subject ${subject}`)
}

const log = (line: string) => console.log(line)

function run(
    cmd: string,
    args: string[],
    options: { cwd?: string; env?: Record<string, string> } = {},
) {
    const result = spawnSync(cmd, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        encoding: 'utf8',
        maxBuffer: 1 << 28,
    })
    if (result.status !== 0) {
        throw new Error(
            `${cmd} ${args.join(' ')} failed:\n${(result.stdout + result.stderr).slice(-3000)}`,
        )
    }
    return result.stdout
}

// The connected iPhone.
function findDevice() {
    const file = path.join(os.tmpdir(), `bench-devices-${process.pid}.json`)
    run('xcrun', ['devicectl', 'list', 'devices', '--json-output', file])
    const devices = JSON.parse(fs.readFileSync(file, 'utf8')).result
        .devices as {
        hardwareProperties: {
            udid: string
            platform: string
            reality: string
            marketingName?: string
        }
        connectionProperties: { tunnelState?: string; pairingState?: string }
        deviceProperties: { name: string; osVersionNumber?: string }
    }[]
    fs.rmSync(file, { force: true })
    const device = devices.find(
        (d) =>
            d.hardwareProperties.platform === 'iOS' &&
            d.hardwareProperties.reality === 'physical' &&
            d.connectionProperties.pairingState === 'paired' &&
            d.connectionProperties.tunnelState !== 'unavailable',
    )
    if (!device)
        throw new Error('No connected iPhone (paired, unlocked, over USB)')
    return {
        udid: device.hardwareProperties.udid,
        name: device.deviceProperties.name,
        model: device.hardwareProperties.marketingName ?? '',
        os: device.deviceProperties.osVersionNumber ?? '',
    }
}

const bundleId = (subject: string) =>
    `com.dylanvann.rnfibenchmark.${subject.replace(/[^a-z0-9]/gi, '')}`

function build(subject: string, udid: string) {
    log(`build ${subject}`)
    const env = { BENCH_SUBJECT: subject }
    fs.writeFileSync(
        path.join(APP, 'src', 'subject.ts'),
        `// Written by ../../scripts/run.ts: the subject this build is for.\nexport { default } from '../subjects/${subject}'\n`,
    )
    run('bunx', ['expo', 'prebuild', '-p', 'ios', '--clean', '--no-install'], {
        cwd: APP,
        env,
    })
    run('pod', ['install'], { cwd: path.join(APP, 'ios'), env })
    const workspace = fs
        .readdirSync(path.join(APP, 'ios'))
        .find((f) => f.endsWith('.xcworkspace'))
    if (!workspace) throw new Error('No workspace')
    const scheme = workspace.replace('.xcworkspace', '')
    run(
        'xcodebuild',
        [
            '-workspace',
            workspace,
            '-scheme',
            scheme,
            '-configuration',
            'Release',
            '-destination',
            `id=${udid}`,
            '-derivedDataPath',
            '../build',
            '-allowProvisioningUpdates',
            '-quiet',
            'build',
        ],
        { cwd: path.join(APP, 'ios'), env },
    )
    const product = path.join(
        APP,
        'build',
        'Build',
        'Products',
        'Release-iphoneos',
        `${scheme}.app`,
    )
    run('xcrun', [
        'devicectl',
        'device',
        'install',
        'app',
        '--device',
        udid,
        product,
    ])
}

function buildCapture() {
    run('swift', ['build', '-c', 'release'], { cwd: CAPTURE })
    return path.join(CAPTURE, '.build', 'release', 'capture')
}

// Records the device's screen until stop() resolves.
function record(binary: string, deviceName: string, file: string) {
    const child = spawn(binary, [deviceName, file], {
        stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    const exited = new Promise<number>((resolve) =>
        child.on('exit', (code) => resolve(code ?? 1)),
    )
    const started = new Promise<void>((resolve, reject) => {
        child.stdout.on('data', (d) => {
            if (String(d).includes('recording')) resolve()
        })
        exited.then(() => reject(new Error(`capture exited: ${stderr}`)))
        setTimeout(
            () => reject(new Error(`capture didn't start: ${stderr}`)),
            20_000,
        )
    })
    return {
        started,
        stop: async () => {
            child.stdin.end()
            const code = await exited
            if (code !== 0) throw new Error(`capture failed: ${stderr}`)
        },
    }
}

type MetricTest = {
    testIdentifier: string
    testRuns: {
        metrics: {
            displayName: string
            unitOfMeasurement: string
            measurements: number[]
        }[]
    }[]
}

// xcodebuild's arguments for the runner (../ios), built once.
const runnerArgs = (udid: string) => [
    '-project',
    'BenchmarkRunner.xcodeproj',
    '-scheme',
    'Benchmark',
    '-destination',
    `id=${udid}`,
    '-derivedDataPath',
    'build',
    '-allowProvisioningUpdates',
]

// The runner's environment (TEST_RUNNER_ variables reach the tests).
const runnerEnv = (subject: string) => ({
    ...process.env,
    TEST_RUNNER_BENCH_BUNDLE_ID: bundleId(subject),
    TEST_RUNNER_BENCH_ITERATIONS: String(iterations),
    TEST_RUNNER_BENCH_PORT: String(PORT),
    TEST_RUNNER_BENCH_LATENCY_MS: String(latencyMs),
    TEST_RUNNER_BENCH_MBPS: String(mbps),
})

function buildRunner(udid: string) {
    log('build runner')
    run('xcodegen', [], { cwd: IOS })
    run('xcodebuild', [...runnerArgs(udid), '-quiet', 'build-for-testing'], {
        cwd: IOS,
    })
}

// Starts the runner's image server on the phone (testServe), until stop().
async function serve(udid: string, subject: string) {
    const child = spawn(
        'xcodebuild',
        [
            ...runnerArgs(udid),
            'test-without-building',
            '-only-testing:BenchmarkUITests/BenchmarkTests/testServe',
        ],
        {
            cwd: IOS,
            env: runnerEnv(subject),
            stdio: ['ignore', 'pipe', 'pipe'],
        },
    )
    let output = ''
    const exited = new Promise<void>((resolve) =>
        child.on('exit', () => resolve()),
    )
    await new Promise<void>((resolve, reject) => {
        child.stdout.on('data', (d) => {
            output += d
            if (output.includes('BENCH_SERVER_READY')) resolve()
        })
        child.stderr.on('data', (d) => (output += d))
        exited.then(() =>
            reject(new Error(`testServe exited:\n${output.slice(-3000)}`)),
        )
        setTimeout(
            () =>
                reject(
                    new Error(
                        `testServe didn't start:\n${output.slice(-3000)}`,
                    ),
                ),
            120_000,
        )
    }).catch((error) => {
        child.kill('SIGINT')
        throw error
    })
    return {
        stop: async () => {
            child.kill('SIGINT')
            await exited
        },
    }
}

// Runs the XCTest metrics for the installed subject, and reads them from the
// result bundle (a failed test still leaves its other measurements).
function runMetrics(subject: string, udid: string, out: string): MetricTest[] {
    if (metricNames.length === 0) return []
    log(`  metrics ${metricNames.join(', ')}`)
    const bundle = path.join(out, `metrics-${subject}.xcresult`)
    // xcodebuild won't write over a result bundle.
    fs.rmSync(bundle, { recursive: true, force: true })
    const test = spawnSync(
        'xcodebuild',
        [
            ...runnerArgs(udid),
            'test-without-building',
            '-resultBundlePath',
            bundle,
            ...metricNames.map(
                (name) =>
                    `-only-testing:BenchmarkUITests/BenchmarkTests/${METRIC_TESTS[name]}`,
            ),
        ],
        {
            cwd: IOS,
            encoding: 'utf8',
            maxBuffer: 1 << 28,
            env: runnerEnv(subject),
        },
    )
    if (!fs.existsSync(bundle)) {
        throw new Error(
            `xcodebuild test failed:\n${(test.stdout + test.stderr).slice(-3000)}`,
        )
    }
    if (test.status !== 0)
        log(
            `  xcodebuild test exited with ${test.status} (see ${path.relative(process.cwd(), bundle)})`,
        )
    return JSON.parse(
        run('xcrun', [
            'xcresulttool',
            'get',
            'test-results',
            'metrics',
            '--path',
            bundle,
            '--compact',
        ]),
    ) as MetricTest[]
}

// Waits for the app's results file (Documents/results-<run>.json), copying
// it from the device until it's there.
async function results(udid: string, subject: string, runId: string) {
    const file = path.join(os.tmpdir(), `bench-${runId}.json`)
    const deadline = Date.now() + RUN_TIMEOUT
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1000))
        const copy = spawnSync('xcrun', [
            'devicectl',
            'device',
            'copy',
            'from',
            '--device',
            udid,
            '--domain-type',
            'appDataContainer',
            '--domain-identifier',
            bundleId(subject),
            '--source',
            `Documents/results-${runId}.json`,
            '--destination',
            file,
        ])
        if (copy.status === 0 && fs.existsSync(file)) {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'))
            fs.rmSync(file)
            return data
        }
    }
    throw new Error(`no results for ${runId}`)
}

const launch = (
    udid: string,
    subject: string,
    scenario: string,
    runId: string,
) =>
    run('xcrun', [
        'devicectl',
        'device',
        'process',
        'launch',
        '--device',
        udid,
        '--terminate-existing',
        bundleId(subject),
        '--',
        '-scenario',
        scenario,
        '-run',
        runId,
        '-server',
        SERVER,
    ])

const median = (values: number[]) => {
    if (!values.length) return undefined
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor((sorted.length - 1) / 2)]
}

const device = findDevice()
// A new results folder, or --out to add to one (e.g. after a failed subject).
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
const stamp = `${path.basename(out)}-${Date.now().toString(36)}`
fs.mkdirSync(out, { recursive: true })
log(
    `device: ${device.name} (${device.model}, iOS ${device.os}); results ${path.relative(process.cwd(), out)}`,
)
const captureBinary = buildCapture()
buildRunner(device.udid)

const failed = (subject: string, scenario: string, error: unknown) => {
    const file = path.join(out, 'failures.json')
    const failures = fs.existsSync(file)
        ? JSON.parse(fs.readFileSync(file, 'utf8'))
        : []
    failures.push({ subject, scenario, error: String(error) })
    fs.writeFileSync(file, JSON.stringify(failures, null, 2))
    log(`  ${subject} ${scenario}: ${error}`)
}

for (const subject of chosenSubjects) {
    if (!flag('no-build')) {
        try {
            build(subject, device.udid)
        } catch (error) {
            failed(subject, 'build', String(error).slice(0, 2000))
            continue
        }
    }
    let server: Awaited<ReturnType<typeof serve>>
    try {
        server = await serve(device.udid, subject)
    } catch (error) {
        failed(subject, 'server', error)
        continue
    }
    // An unmeasured first run.
    const firstRun = `${stamp}-${subject}-first`
    launch(device.udid, subject, scenarios[0] ?? 'grid', firstRun)
    await results(device.udid, subject, firstRun).catch((error) =>
        log(`  first run: ${error}`),
    )
    for (const scenario of scenarios) {
        for (let i = 1, attempt = 1; i <= iterations; attempt++) {
            const runId = `${stamp}-${subject}-${scenario}-${i}-${attempt}`
            const video = path.join(out, `${subject}-${scenario}-${i}.mov`)
            const recording = record(captureBinary, device.name, video)
            await recording.started
            launch(device.udid, subject, scenario, runId)
            let data: Results & Record<string, unknown>
            try {
                data = await results(device.udid, subject, runId)
            } catch (error) {
                await recording.stop()
                failed(subject, scenario, error)
                i++
                attempt = 0
                continue
            }
            await new Promise((r) => setTimeout(r, 500))
            await recording.stop()
            let analysis: Analysis
            try {
                analysis = await analyze(data, video)
            } catch (error) {
                failed(subject, scenario, error)
                i++
                attempt = 0
                continue
            }
            // The phone's screen recording can stall (seen while large
            // images decode): run the iteration again, up to twice.
            if (analysis.error && attempt < 3) {
                log(`  ${subject} ${scenario} #${i}: ${analysis.error}; again`)
                fs.rmSync(video, { force: true })
                continue
            }
            fs.writeFileSync(
                path.join(out, `${subject}-${scenario}-${i}.json`),
                JSON.stringify(
                    {
                        device,
                        ...data,
                        imageServer: { latencyMs, mbps },
                        analysis,
                    },
                    null,
                    2,
                ),
            )
            if (!flag('keep-videos')) fs.rmSync(video)
            log(
                `  ${subject} ${scenario} #${i}: first ${analysis.firstMs} ms, all ${analysis.allMs} ms (${analysis.timed} timed${analysis.notShown ? `, ${analysis.notShown} not shown` : ''}), event gap ${median(analysis.images.flatMap((x) => (x.eventGapMs === undefined ? [] : [x.eventGapMs])))} ms${analysis.error ? `: ${analysis.error}` : ''}`,
            )
            i++
            attempt = 0
        }
    }
    await server.stop()
    try {
        runMetrics(subject, device.udid, out)
    } catch (error) {
        failed(subject, 'metrics', error)
    }
}

log('')
log(summarize(out))
