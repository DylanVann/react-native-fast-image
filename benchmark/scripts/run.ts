// Runs the benchmark on a connected iPhone (see ../README.md).
//
//   bun benchmark/scripts/run.ts [--subjects fast-image,image] [--scenarios grid,large]
//                                [--metrics scroll,large-memory] [--iterations 5]
//                                [--latency 40] [--mbps 0]
//                                [--no-build] [--keep-videos] [--out <results folder>]
//
// Needs BENCH_APPLE_TEAM_ID (your team, for signing). Builds the XCUITest
// runner (../ios), which serves the images on the phone (ImageServer.swift).
// Then for each subject: builds the app with only that library
// (app/subjects.js), in Release, installs it, starts the runner's image
// server (testServe), and runs the app once unmeasured (a newly installed
// app's first launch is slower). Then for each scenario, `iterations` times:
// stops every benchmark app, records the phone's screen (ios/capture/),
// launches the app with a new run id (so nothing comes from an earlier run's
// caches; the process is new too), waits for the app's results file (copied
// from the device over USB), stops the recording, and finds when each image
// showed in it (analyze.ts); a run that fails counts as a failure, and the
// next one goes on. Then stops the server and runs the XCTest metrics
// (hitches while scrolling, memory), `iterations` measurements each. Writes
// results/<time>/<subject>-<scenario>-<n>.json and metrics-<subject>.xcresult,
// and prints a summary (also in summary.md).

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { analyze, type Results } from './analyze'
import { summarize } from './summarize'

const BENCHMARK = path.join(import.meta.dir, '..')
const APP = path.join(BENCHMARK, 'app')
const IOS = path.join(BENCHMARK, 'ios')
const CAPTURE = path.join(IOS, 'capture')
// --metrics names, and their tests in ../ios/UITests.
const METRIC_TESTS: Record<string, string> = {
    scroll: 'testScroll',
    'large-memory': 'testLargeMemory',
}
// How long a run may take: the app's longest wait (30 s, for a subject that
// doesn't send every load event) and launch.
const RUN_TIMEOUT = 60_000
// How long a devicectl command may take.
const DEVICECTL_TIMEOUT = 60_000
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
// The image server's network, as on Android (see run-android.ts): latency
// before each response, and bandwidth shared by all of them (0 for none).
const latencyMs = Number(option('latency', '40'))
const mbps = Number(option('mbps', '0'))
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

// The child processes that outlive a command (the recorder, the image
// server's test), stopped if this script exits early.
const children = new Set<ReturnType<typeof spawn>>()
process.on('exit', () => {
    for (const child of children) child.kill('SIGKILL')
})
process.on('SIGINT', () => process.exit(130))
process.on('SIGTERM', () => process.exit(143))

function run(
    cmd: string,
    args: string[],
    options: {
        cwd?: string
        env?: Record<string, string>
        timeoutMs?: number
    } = {},
) {
    const result = spawnSync(cmd, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        encoding: 'utf8',
        maxBuffer: 1 << 28,
        // Builds included; a hung devicectl fails instead of waiting.
        timeout:
            options.timeoutMs ??
            (cmd === 'xcrun' && args[0] === 'devicectl'
                ? DEVICECTL_TIMEOUT
                : 30 * 60_000),
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

// The phone's screen recorder (../ios/capture): one process for the whole
// run, recording each movie on a command (see main.swift).
async function recorder(binary: string, deviceName: string) {
    const child = spawn(binary, [deviceName], {
        stdio: ['pipe', 'pipe', 'pipe'],
    })
    children.add(child)
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    const exited = new Promise<void>((resolve) =>
        child.on('exit', () => resolve()),
    )
    // Its output, a line at a time.
    const lines: string[] = []
    let waiting: (() => void) | undefined
    let pending = ''
    child.stdout.on('data', (d) => {
        pending += d
        const parts = pending.split('\n')
        pending = parts.pop()!
        lines.push(...parts)
        waiting?.()
    })
    const next = async (timeoutMs: number) => {
        const deadline = Date.now() + timeoutMs
        while (!lines.length) {
            if (child.exitCode !== null) {
                throw new Error(`capture exited: ${stderr}`)
            }
            if (Date.now() > deadline) {
                throw new Error(`capture didn't answer: ${stderr}`)
            }
            await Promise.race([
                new Promise<void>((resolve) => (waiting = resolve)),
                exited,
                new Promise((resolve) => setTimeout(resolve, 1000)),
            ])
        }
        return lines.shift()!
    }
    if ((await next(20_000)) !== 'ready') {
        throw new Error(`capture didn't start: ${stderr}`)
    }
    // Sends "stop" and waits for its answer ("stopped", or "stopped <error>"),
    // skipping a late "recording".
    const stop = async (command: string) => {
        child.stdin.write(command)
        for (;;) {
            const line = await next(30_000)
            if (line.startsWith('stopped')) return line
        }
    }
    return {
        // Records to `file` until stop() resolves: at once, or once a frame
        // has arrived with the point `until` (fractions of the screen's size)
        // blue (the run's end).
        record: async (file: string) => {
            child.stdin.write(`start ${file}\n`)
            const line = await next(20_000).catch(async (error) => {
                // So it isn't left recording.
                await stop('stop\n').catch(() => undefined)
                throw error
            })
            if (line !== 'recording') {
                throw new Error(`capture didn't record: ${line} ${stderr}`)
            }
            return {
                stop: async (until?: { x: number; y: number }) => {
                    const line = await stop(
                        until ? `stop ${until.x} ${until.y}\n` : 'stop\n',
                    )
                    // e.g. frames it couldn't write in time.
                    if (line !== 'stopped') log(`  capture: ${line.slice(8)}`)
                },
            }
        },
        close: () => child.stdin.end(),
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
    children.add(child)
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
            const timer = setTimeout(() => child.kill('SIGKILL'), 30_000)
            await exited
            clearTimeout(timer)
            children.delete(child)
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
            timeout: 45 * 60_000,
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
        const copy = spawnSync(
            'xcrun',
            [
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
            ],
            { timeout: DEVICECTL_TIMEOUT },
        )
        if (copy.status === 0 && fs.existsSync(file)) {
            // Copied while the app was still writing it: try again.
            try {
                const data = JSON.parse(fs.readFileSync(file, 'utf8'))
                fs.rmSync(file)
                return data
            } catch {}
        }
    }
    throw new Error(`no results for ${runId}`)
}

// The benchmark apps running on the phone (any subject's, e.g. suspended
// after an earlier run): Bench<subject>.app, not the UI tests' runner
// (BenchmarkUITests-Runner.app), which serves the images.
function benchProcesses(udid: string) {
    const file = path.join(os.tmpdir(), `bench-processes-${process.pid}.json`)
    run('xcrun', [
        'devicectl',
        'device',
        'info',
        'processes',
        '--device',
        udid,
        '--json-output',
        file,
    ])
    const processes = JSON.parse(fs.readFileSync(file, 'utf8')).result
        .runningProcesses as {
        executable?: string
        processIdentifier: number
    }[]
    fs.rmSync(file, { force: true })
    return processes.filter(
        (p) =>
            /\/Bench[a-z0-9]+\.app\//.test(p.executable ?? '') &&
            !p.executable!.includes('/BenchmarkUITests-Runner.app/'),
    )
}

// Stops every benchmark app and waits until they've exited, so none is in
// memory during a measurement. (devicectl's --terminate-existing stopped the
// subject and launched it again at once, and sometimes the new process didn't
// start, after the old one had decoded the large photos.)
async function stopApps(udid: string) {
    for (let i = 0; i < 20; i++) {
        const running = benchProcesses(udid)
        if (!running.length) return
        for (const p of running) {
            spawnSync(
                'xcrun',
                [
                    'devicectl',
                    'device',
                    'process',
                    'terminate',
                    '--device',
                    udid,
                    '--pid',
                    String(p.processIdentifier),
                ],
                { timeout: DEVICECTL_TIMEOUT },
            )
        }
        await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error("the benchmark apps on the phone didn't exit")
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
const capture = await recorder(buildCapture(), device.name)
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

// One timed run: records it, and writes its results and analysis.
async function measure(subject: string, scenario: string, i: number) {
    const runId = `${stamp}-${subject}-${scenario}-${i}`
    const video = path.join(out, `${subject}-${scenario}-${i}.mov`)
    await stopApps(device.udid)
    const recording = await capture.record(video)
    let data: Results & Record<string, unknown>
    try {
        launch(device.udid, subject, scenario, runId)
        data = await results(device.udid, subject, runId)
    } catch (error) {
        await recording.stop()
        throw error
    }
    // The marker's middle, as fractions of the screen's size.
    const marker = data.marker!
    await recording.stop({
        x: (marker.x + marker.width / 2) / data.window.width,
        y: (marker.y + marker.height / 2) / data.window.height,
    })
    const analysis = await analyze(data, video)
    fs.writeFileSync(
        path.join(out, `${subject}-${scenario}-${i}.json`),
        JSON.stringify(
            { device, ...data, imageServer: { latencyMs, mbps }, analysis },
            null,
            2,
        ),
    )
    // A run whose analysis failed keeps its recording, to look into.
    if (!flag('keep-videos') && !analysis.error) fs.rmSync(video)
    log(
        `  ${subject} ${scenario} #${i}: first ${analysis.firstMs} ms, all ${analysis.allMs} ms (${analysis.timed} timed${analysis.notShown ? `, ${analysis.notShown} not shown` : ''}), event gap ${median(analysis.images.flatMap((x) => (x.eventGapMs === undefined ? [] : [x.eventGapMs])))} ms${analysis.error ? `: ${analysis.error}` : ''}`,
    )
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
    try {
        // An unmeasured first run.
        const firstRun = `${stamp}-${subject}-first`
        try {
            await stopApps(device.udid)
            launch(device.udid, subject, scenarios[0] ?? 'grid', firstRun)
            await results(device.udid, subject, firstRun)
        } catch (error) {
            log(`  first run: ${error}`)
        }
        for (const scenario of scenarios) {
            for (let i = 1; i <= iterations; i++) {
                try {
                    await measure(subject, scenario, i)
                } catch (error) {
                    failed(subject, scenario, error)
                }
            }
        }
    } finally {
        await server.stop()
    }
    try {
        await stopApps(device.udid)
        runMetrics(subject, device.udid, out)
    } catch (error) {
        failed(subject, 'metrics', error)
    }
}

capture.close()
log('')
log(summarize(out))
