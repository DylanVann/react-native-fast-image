// Checks the library and runs the example apps on iOS and Android. Run it with
// Node 26 (the repo's .node-version), which runs TypeScript directly:
//
//   node scripts/verify.mts [options]

import {
    type ChildProcess,
    execFile,
    execFileSync,
    spawn,
    spawnSync,
} from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import http2 from 'node:http2'
import os from 'node:os'
import path from 'node:path'
import { parseArgs, promisify } from 'node:util'
import { compare } from 'odiff-bin'

const HELP = `Checks the library and runs the example apps on iOS and Android.

  node scripts/verify.mts [options]

Steps:
  1. JS: build, tests, typechecks, lint (oxlint) and formatting (oxfmt).
  2. Build every example app for iOS and Android (the platforms in
     parallel), then for each app: start the packager, run the regression
     cases and the example screens through the app's runner (driven over a
     WebSocket; a screenshot of each group is compared with its reference in
     screenshots/; the touch cases are tapped with maestro/touch.yaml), then,
     with --background, the Maestro flows in maestro/ with maestro-runner,
     both platforms at once. A failed case, a screenshot that differs, a flow
     failure or a crash fails the run.

Options:
  --app main|minimum|expo|tv
                      Only this example app (default: main and minimum, the
                      oldest React Native FastImage supports:
                      ReactNativeFastImageExampleMinimum, the regression
                      cases only). The Expo example
                      (ReactNativeFastImageExampleExpo) runs only
                      when asked for: a few smoke cases on iOS and Android
                      (its native projects made by \`expo prebuild\`, with
                      FastImage's config plugin) and on the web (its web
                      version in headless Chrome, statuses only, no
                      screenshots). So does the tvOS example
                      (ReactNativeFastImageExampleTV): the regression cases
                      but the touch ones, on an Apple TV simulator.
  --ios, --android, --web
                      Only this platform (default: iOS and Android, and the
                      web for the Expo example; --web is for the Expo
                      example).
  --js-only           Only the JS checks.
  --no-js             Skip the JS checks.
  --pods              Run \`pod install\` even if Pods are current (they're
                      reinstalled when the Podfile or node_modules changed).
  --package           Test the package as published: build it, \`npm pack\` it,
                      and install the tarball into each app's node_modules
                      (instead of using src/, ios/ and android/ directly).
  --release           Build the apps' Release configuration (Android minified
                      with R8) and run them without the packager.
  --ref <git-ref>     Test the library code (src/, ios/, android/, package.json
                      and the podspec) from this ref instead of the working
                      tree, e.g. \`--ref main\` for a "before" run. The working
                      tree is restored afterwards.
  --shard <i>/<n>     Run the i-th of n ranges of each app's regression groups
                      (e.g. 1/3), to split a run between machines; the first
                      range starts with \`start\`.
  --background        Also run the flows tagged \`background\`
                      (maestro/background.yaml and
                      background-no-activity.yaml), which send the app to the
                      background for 20 s and 10 s (the second one finishes
                      its Android Activity, so the app restarts its UI). Slow,
                      so they're skipped by default; run them for changes to
                      loading or lifecycle.
  --update-screenshots
                      Replace the reference screenshots in screenshots/ with
                      this run's; a missing reference is always seeded from
                      the run, except with --ref. Look at them, then commit
                      them with the change.
  --record            Record the screen while the flows run. Each flow's
                      recording is saved in its report, and a copy sized for
                      a GitHub comment (needs ffmpeg) is written to
                      recordings/<branch>/<app>-<platform>-<flow>.mp4, named
                      after the current branch (or the --ref).

Environment:
  CHROME_BIN      Chrome for the Expo example's web version (default:
                  /Applications/Google Chrome.app).
  IOS_SIMULATOR   Simulator name to use (default: "RNFI iPhone", a simulator
                  of the script's own so screenshots and recordings don't
                  show other apps; created on first use as an iPhone 17 Pro,
                  the references' device, with the newest runtime). For the
                  tvOS example, TVOS_SIMULATOR (default: "RNFI Apple TV", an
                  Apple TV 4K (3rd generation)).
  ANDROID_AVD     Emulator to start if no device is connected (default: the
                  first AVD named rnfi*, else the first AVD). Use a plain
                  AOSP image ("default", no Google apps) with 4 GB+ RAM; it's
                  started with -gpu host, no window and its gRPC API on port
                  8554 (the video samples are recorded through it; an
                  emulator started otherwise records with screenrecord).
  ANDROID_EMULATOR_GPU  The emulator's -gpu mode (default: host; e.g.
                  swiftshader_indirect without a GPU).
  VERIFY_IDB_COMPANION
                  The path of idb_companion: the iOS screenshots come from it
                  (about 80 ms each, where simctl's take about 450).
  VERIFY_SAMPLE_LEAD_MS
                  How long a video sample records before its case makes the
                  change (default 500); longer where recordings start late.
  VERIFY_SPARSE_RECORDINGS
                  Set when the screen recorder captures only a few frames a
                  second (an emulator without a GPU): a video sample whose
                  recording is too sparse to show its change isn't checked.
  VERIFY_FLOWS_TIMEOUT, VERIFY_BUILD_TIMEOUT, VERIFY_HELLO_TIMEOUT
                  Time limits in seconds for each app and platform's flows
                  (default 240, plus 180 with --background) and builds
                  (default 900), and for the app to connect after it
                  launches (default 90).
  MAESTRO_RUNNER_BIN
                  maestro-runner binary (default: the dev dependency).
  MAESTRO_RUNNER_ANDROID_DRIVER
                  maestro-runner's Android driver (default devicelab).

Needs Xcode with CocoaPods via Bundler, JDK 17+, and the Android SDK with an
emulator. Output (logs, screenshots, crash reports, recordings) goes to
verify-output/<timestamp>/.`

type App = 'main' | 'minimum' | 'expo' | 'tv'
type Platform = 'ios' | 'android' | 'web'

const ROOT = path.resolve(import.meta.dirname, '..')
const IMAGE_SERVER = path.join(ROOT, 'ReactNativeFastImageExampleServer')
const IMAGE_SERVER_PORT = 8090
const PACKAGE_NAME = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
).name as string

// --- Options -------------------------------------------------------------

function parseOptions() {
    try {
        return parseArgs({
            options: {
                app: { type: 'string' },
                ios: { type: 'boolean', default: false },
                android: { type: 'boolean', default: false },
                web: { type: 'boolean', default: false },
                'js-only': { type: 'boolean', default: false },
                'no-js': { type: 'boolean', default: false },
                pods: { type: 'boolean', default: false },
                package: { type: 'boolean', default: false },
                release: { type: 'boolean', default: false },
                ref: { type: 'string' },
                shard: { type: 'string' },
                background: { type: 'boolean', default: false },
                record: { type: 'boolean', default: false },
                'update-screenshots': { type: 'boolean', default: false },
                help: { type: 'boolean', short: 'h', default: false },
            },
        }).values
    } catch (error) {
        console.error(
            `${(error as Error).message}\n\nRun with --help for options.`,
        )
        process.exit(2)
    }
}
const options = parseOptions()
if (options.help) {
    console.log(HELP)
    process.exit(0)
}
if (
    options.app !== undefined &&
    options.app !== 'main' &&
    options.app !== 'minimum' &&
    options.app !== 'expo' &&
    options.app !== 'tv'
) {
    console.error(`Unknown app: ${options.app} (use main, minimum, expo or tv)`)
    process.exit(2)
}
// --shard i/n: the i-th of n ranges of each app's regression groups.
const SHARD = (() => {
    if (options.shard === undefined) return undefined
    const [index, count] = options.shard.split('/').map(Number)
    if (!(count >= 1 && index >= 1 && index <= count)) {
        console.error(`Invalid --shard ${options.shard} (use i/n, e.g. 1/3)`)
        process.exit(2)
    }
    return { index, count }
})()
// Each regression group's usual time in seconds, by <app>-<platform>, from the
// JSON file VERIFY_GROUP_TIMES names (the e2e workflow's, from
// scripts/group-times.ts): with --shard, the ranges are split so they take
// about as long as each other. Without it, each group counts the same.
const GROUP_TIMES: Record<string, Record<string, number>> = (() => {
    const file = process.env.VERIFY_GROUP_TIMES
    if (!file) return {}
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
        return {}
    }
})()

// The range [first, end) of the groups for --shard: contiguous ranges whose
// times add up to about the same (a group without a time counts as the median
// one).
function shardRange(groups: string[], times: Record<string, number> = {}) {
    if (!SHARD) return [0, groups.length]
    const known = groups
        .map((group) => times[group])
        .filter((seconds) => seconds > 0)
        .sort((a, b) => a - b)
    const usual = known[Math.floor(known.length / 2)] ?? 1
    // The time before each group (and after the last).
    const before = [0]
    for (const group of groups)
        before.push(before.at(-1)! + (times[group] > 0 ? times[group] : usual))
    const { index, count } = SHARD
    // The first group whose time before it is closest to j/n of the total.
    const boundary = (j: number) => {
        const target = (before.at(-1)! * j) / count
        let best = 0
        for (let i = 1; i < before.length; i++)
            if (Math.abs(before[i] - target) < Math.abs(before[best] - target))
                best = i
        return best
    }
    return [boundary(index - 1), boundary(index)]
}
// The Expo and tvOS examples only run when asked for (--app expo, --app tv).
const APPS: App[] = options.app ? [options.app as App] : ['main', 'minimum']
if (options.web && !APPS.includes('expo')) {
    console.error('--web is for the Expo example: use it with --app expo')
    process.exit(2)
}
// tvOS is the iOS platform (React Native's Platform.OS is 'ios' there too).
const TV = APPS.includes('tv')
if (TV && options.android) {
    console.error('The tvOS example has no Android app')
    process.exit(2)
}
// Both are for the Maestro flows, which the tvOS example doesn't run.
if (TV && (options.background || options.record)) {
    console.error(
        "--background and --record are for the Maestro flows, which the tvOS example doesn't run",
    )
    process.exit(2)
}
const PLATFORMS: Platform[] =
    options.ios || TV
        ? ['ios']
        : options.android
          ? ['android']
          : options.web
            ? ['web']
            : APPS.includes('expo')
              ? ['ios', 'android', 'web']
              : ['ios', 'android']
const RUN_JS = !options['no-js']
const RUN_APPS = !options['js-only']
const REF = options.ref
const FROM_PACKAGE = options.package
const RELEASE = options.release
const CONFIGURATION = RELEASE ? 'Release' : 'Debug'
const RECORD = options.record
const UPDATE_SCREENSHOTS = options['update-screenshots']

const env = process.env
// The example apps' metro.config.js and react-native.config.js use the
// installed package instead of the repo's source when this is set.
if (FROM_PACKAGE) env.FAST_IMAGE_FROM_PACKAGE = '1'
else delete env.FAST_IMAGE_FROM_PACKAGE
const SOURCE = FROM_PACKAGE ? 'package' : 'source'
const seconds = (name: string, fallback: number) =>
    Number(env[name]) || fallback
// Time limits so a hung build or flow fails the run instead of blocking it;
// raise them if one is hit. An app and platform's flows take up to about 90
// seconds, plus a minute or two the first time maestro-runner builds
// WebDriverAgent for iOS.
const FLOWS_TIMEOUT = seconds('VERIFY_FLOWS_TIMEOUT', 240)
// Enough for a clean iOS build (~10 minutes); incremental builds take seconds.
const BUILD_TIMEOUT = seconds('VERIFY_BUILD_TIMEOUT', 900)

const ANDROID_HOME =
    env.ANDROID_HOME ?? path.join(os.homedir(), 'Library/Android/sdk')
const ADB = path.join(ANDROID_HOME, 'platform-tools/adb')
// Child processes use this Node (not a version manager's shim, which may pick
// an older one from .node-version), and tools like maestro-runner look for adb
// on the PATH.
env.PATH = [
    path.dirname(process.execPath),
    path.join(ANDROID_HOME, 'platform-tools'),
    env.PATH,
].join(':')

const MAESTRO_RUNNER =
    env.MAESTRO_RUNNER_BIN ??
    path.join(ROOT, 'node_modules/.bin/maestro-runner')
// The Expo example's web version runs in the installed Chrome, headless.
const CHROME =
    env.CHROME_BIN ??
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const now = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
)}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
const OUT = path.join(
    ROOT,
    'verify-output',
    stamp + (REF ? `-${REF.replace(/\//g, '-')}` : ''),
)
fs.mkdirSync(OUT, { recursive: true })
// Recordings go under recordings/<branch>/ (ignored by git), so the ones for a
// branch are easy to find when writing up its PR, and a "before" run with
// --ref main lands next to them under recordings/main/.
function currentBranch() {
    const git = (...args: string[]) =>
        execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim()
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
    // A detached HEAD has no branch name; use the commit.
    return branch === 'HEAD' ? git('rev-parse', '--short', 'HEAD') : branch
}
const RECORDINGS = path.join(
    ROOT,
    'recordings',
    (REF ?? currentBranch()).replace(/\//g, '-'),
)

// --- Helpers -------------------------------------------------------------

// Durations as m:ss, and the time since the run started, so the log shows
// where a run's time goes.
const RUN_START = Date.now()
const duration = (ms: number) => {
    const seconds = Math.round(ms / 1000)
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
const elapsed = () => `[+${duration(Date.now() - RUN_START)}]`
const say = (message: string) => console.log(`==> ${elapsed()} ${message}`)
const rel = (file: string) => path.relative(ROOT, file)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Result = { status: 'PASS' | 'FAIL'; name: string; detail?: string }
const results: Result[] = []
function record(status: Result['status'], name: string, detail?: string) {
    results.push({ status, name, detail })
    const line = `${status.padEnd(4)}  ${name}${detail ? `  (${detail})` : ''}`
    // Written as it goes, so a run that's stopped early keeps its results.
    fs.appendFileSync(path.join(OUT, 'results.txt'), line + '\n')
    console.log(
        `    ${elapsed()} ${status}: ${name}${detail ? ` (${detail})` : ''}`,
    )
}

// Runs a short command and returns its output, or undefined if it fails.
function capture(
    cmd: string,
    args: string[],
    { cwd = ROOT, timeout = 30 } = {},
) {
    try {
        return execFileSync(cmd, args, {
            cwd,
            encoding: 'utf8',
            timeout: timeout * 1000,
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()
    } catch {
        return undefined
    }
}

// Every long-running child runs in its own process group, so it can be stopped
// with everything it started: bunx, the maestro-runner wrapper and xcodebuild
// all start children that outlive them otherwise. Groups are tracked by id
// rather than by child, because a group can outlive the process that started
// it (the maestro-runner wrapper exits on SIGTERM; its binary doesn't).
const groups = new Set<number>()

function groupAlive(pgid: number) {
    try {
        process.kill(-pgid, 0)
        return true
    } catch {
        return false
    }
}

function killGroup(pgid: number, signal: NodeJS.Signals = 'SIGTERM') {
    try {
        process.kill(-pgid, signal)
    } catch {
        // Already gone.
    }
}

function stop(pgid: number) {
    killGroup(pgid)
    // Some tools shut down slowly or ignore SIGTERM.
    setTimeout(
        () => groupAlive(pgid) && killGroup(pgid, 'SIGKILL'),
        10_000,
    ).unref()
}

function sleepSync(ms: number) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

type StartOptions = {
    cwd?: string
    log: string
    extraEnv?: Record<string, string>
}

function start(
    cmd: string,
    args: string[],
    { cwd = ROOT, log, extraEnv }: StartOptions,
) {
    const fd = fs.openSync(log, 'a')
    const child = spawn(cmd, args, {
        cwd,
        env: { ...env, ...extraEnv },
        stdio: ['ignore', fd, fd],
        detached: true,
    })
    fs.closeSync(fd)
    child.on('error', (error) => fs.appendFileSync(log, `\n${error.message}\n`))
    return child
}

type RunResult = { ok: boolean; timedOut: boolean }

// Runs a command with its output in `log`, stopping it after `timeout` seconds.
function run(
    cmd: string,
    args: string[],
    options: StartOptions & { timeout: number },
): Promise<RunResult> {
    const { log, timeout } = options
    const child = start(cmd, args, options)
    const pgid = child.pid
    if (pgid !== undefined) groups.add(pgid)
    let timedOut = false
    const timer = setTimeout(() => {
        timedOut = true
        fs.appendFileSync(
            log,
            `\nverify: stopped after the ${timeout}s time limit\n`,
        )
        if (pgid !== undefined) stop(pgid)
    }, timeout * 1000)
    return new Promise((resolve) => {
        child.on('close', (code) => {
            clearTimeout(timer)
            // Keep the group if something in it is still running, so cleanup
            // stops it.
            if (pgid !== undefined && !groupAlive(pgid)) groups.delete(pgid)
            resolve({ ok: code === 0 && !timedOut, timedOut })
        })
    })
}

function portInUse(port: number) {
    return !!capture('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'])
}

// --- Setup ---------------------------------------------------------------

if (RUN_APPS && !RELEASE && portInUse(8081)) {
    console.error(
        'Port 8081 is in use. Stop your packager before running this script.',
    )
    process.exit(1)
}
if (RUN_APPS && portInUse(IMAGE_SERVER_PORT)) {
    console.error(
        `Port ${IMAGE_SERVER_PORT} is in use. Stop the example image server before running this script.`,
    )
    process.exit(1)
}
if (RUN_APPS && !fs.existsSync(MAESTRO_RUNNER)) {
    console.error(
        'maestro-runner not found; run `bun install` in the repo root (or set MAESTRO_RUNNER_BIN).',
    )
    process.exit(1)
}

// With --ref, swap in the library code from that ref and restore it on exit.
const LIB_PATHS = [
    'src',
    'ios',
    'android',
    'package.json',
    'RNFastImage.podspec',
]
let backup = ''
function restoreLibrary() {
    if (!backup) return
    say("Restoring the working tree's library code")
    for (const p of LIB_PATHS) {
        fs.rmSync(path.join(ROOT, p), { recursive: true, force: true })
        fs.cpSync(path.join(backup, p), path.join(ROOT, p), { recursive: true })
    }
    // Unstages the ref's files. Another git process (an editor's) can hold
    // .git/index.lock for a moment: try again, then say how to finish.
    for (let attempt = 1; ; attempt++) {
        try {
            execFileSync(
                'git',
                ['-C', ROOT, 'reset', '-q', '--', ...LIB_PATHS],
                {
                    stdio: 'pipe',
                },
            )
            break
        } catch (error) {
            if (attempt < 5) {
                sleepSync(1000)
                continue
            }
            console.error(
                `The library code is restored, but unstaging it failed (${String(error).split('\n')[0]}): run \`git reset -- ${LIB_PATHS.join(' ')}\`.`,
            )
            break
        }
    }
    fs.rmSync(backup, { recursive: true, force: true })
    backup = ''
}

let metro: number | undefined
// The bundles Metro was asked for while the current app built (warmBundles).
let bundleWarm: Promise<void> = Promise.resolve()
// Screen recordings in progress (recordScreen), stopped on exit: a simulator
// whose recording isn't stopped refuses to start another.
const recorders = new Set<ChildProcess>()
let cleanedUp = false
function cleanup() {
    if (cleanedUp) return
    cleanedUp = true
    for (const child of recorders) child.kill('SIGINT')
    // Ask everything still running to stop, give it a moment, then force what's
    // left (this runs on exit, so it can't wait asynchronously).
    for (const pgid of groups) killGroup(pgid)
    const deadline = Date.now() + 3000
    while ([...groups].some(groupAlive) && Date.now() < deadline) sleepSync(100)
    for (const pgid of groups) {
        if (groupAlive(pgid)) killGroup(pgid, 'SIGKILL')
    }
    restoreLibrary()
    // Remove the installed package, so a later run from source can't pick it up.
    if (FROM_PACKAGE) {
        for (const app of APPS) {
            fs.rmSync(path.join(appDir(app), 'node_modules', PACKAGE_NAME), {
                recursive: true,
                force: true,
            })
        }
    }
}
process.on('exit', cleanup)
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
        console.log(`\nStopping (${signal})`)
        process.exit(130)
    })
}

if (REF) {
    if (
        capture('git', [
            '-C',
            ROOT,
            'rev-parse',
            '--verify',
            '-q',
            `${REF}^{commit}`,
        ]) === undefined
    ) {
        console.error(`Unknown ref: ${REF}`)
        process.exit(1)
    }
    backup = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-library-'))
    for (const p of LIB_PATHS) {
        fs.cpSync(path.join(ROOT, p), path.join(backup, p), { recursive: true })
        fs.rmSync(path.join(ROOT, p), { recursive: true, force: true })
    }
    execFileSync('git', ['-C', ROOT, 'checkout', '-q', REF, '--', ...LIB_PATHS])
    say(
        `Testing library code from ${REF} (${capture('git', [
            '-C',
            ROOT,
            'rev-parse',
            '--short',
            REF,
        ])}); backup of the working tree's code: ${backup}`,
    )
}

const appDir = (app: App) =>
    path.join(
        ROOT,
        {
            main: 'ReactNativeFastImageExample',
            expo: 'ReactNativeFastImageExampleExpo',
            minimum: 'ReactNativeFastImageExampleMinimum',
            tv: 'ReactNativeFastImageExampleTV',
        }[app],
    )
const appName = (app: App) => path.basename(appDir(app))
const iosBundleId = (app: App) => `org.reactjs.native.example.${appName(app)}`
// com.<the app's directory, lowercased>: com.reactnativefastimageexample,
// …minimum, …expo, …tv.
const androidPackage = (app: App) => `com.${appName(app).toLowerCase()}`

async function ensureNodeModules(dir: string) {
    if (fs.existsSync(path.join(dir, 'node_modules'))) return true
    say(`Installing dependencies in ${rel(dir) || '.'}`)
    const log = path.join(OUT, `install-${path.basename(dir)}.log`)
    const result = await run('bun', ['install', '--frozen-lockfile'], {
        cwd: dir,
        log,
        timeout: 600,
    })
    if (!result.ok)
        record('FAIL', `bun install (${rel(dir) || '.'})`, `see ${rel(log)}`)
    return result.ok
}

// Asks Metro for each platform's bundle, as the app will, so it's built while
// the native builds run rather than when the app launches (5 to 10 s).
function warmBundles(app: App, platforms: Platform[]) {
    return Promise.all(
        platforms.map(async (platform) => {
            if (platform === 'web') return
            const appId =
                platform === 'ios' ? iosBundleId(app) : androidPackage(app)
            const url = `http://localhost:8081/index.bundle?platform=${platform}&dev=true&lazy=true&minify=false&app=${appId}&modulesOnly=false&runModule=true`
            try {
                await (await fetch(url)).arrayBuffer()
            } catch {
                // The app will ask again.
            }
        }),
    ).then(() => {})
}

// The Expo CLI's commands (its dev server, prebuild) without prompts or
// network requests.
const EXPO_ENV = { CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_OFFLINE: '1' }

async function startMetro(app: App) {
    say(`Starting Metro for ${app}`)
    // The Expo example's dev server also serves its web version.
    const [cmd, ...args] =
        app === 'expo'
            ? ['bunx', 'expo', 'start', '--port', '8081', '--localhost']
            : ['bunx', 'react-native', 'start', '--port', '8081']
    metro = start(cmd, args, {
        cwd: appDir(app),
        log: path.join(OUT, `metro-${app}.log`),
        extraEnv: app === 'expo' ? EXPO_ENV : undefined,
    }).pid
    if (metro !== undefined) groups.add(metro)
    const metroStart = Date.now()
    // Up to 5 minutes: it starts while the apps build, which can leave it
    // little CPU on a small machine.
    for (let i = 0; i < 300; i++) {
        try {
            const response = await fetch('http://localhost:8081/status')
            if ((await response.text()).includes('running')) {
                say(
                    `Metro for ${app} ready after ${duration(Date.now() - metroStart)}`,
                )
                return true
            }
        } catch {
            // Not up yet.
        }
        await sleep(1000)
    }
    return false
}

// The example app loads its remote images from this server
// (ReactNativeFastImageExampleServer). It runs for the whole run and is stopped
// with everything else on exit.
async function startImageServer() {
    const log = path.join(OUT, 'image-server.log')
    const pid = start('bun', [path.join(IMAGE_SERVER, 'server.ts')], {
        log,
    }).pid
    if (pid !== undefined) groups.add(pid)
    // Up to 30 s: slower when a simulator or emulator is starting.
    for (let i = 0; i < 60; i++) {
        try {
            const url = `http://localhost:${IMAGE_SERVER_PORT}/logo.png`
            if ((await fetch(url)).ok) return true
        } catch {
            // Not up yet.
        }
        await sleep(500)
    }
    record('FAIL', 'image server', `see ${rel(log)}`)
    return false
}

// Builds and packs the library as npm would publish it, and installs the
// tarball into each app's node_modules (the package has no dependencies, only
// peers, so extracting it is installing it).
async function installPackage() {
    say('Packing the library')
    const log = path.join(OUT, 'package.log')
    if (
        !(await run('bun', ['run', 'build:package'], { log, timeout: 120 })).ok
    ) {
        record('FAIL', 'package', `build failed; see ${rel(log)}`)
        return false
    }
    const packed = capture(
        'npm',
        ['pack', '--json', '--pack-destination', OUT],
        { timeout: 120 },
    )
    const tarball = packed && JSON.parse(packed)[0]?.filename
    if (!tarball) {
        record('FAIL', 'package', 'npm pack failed')
        return false
    }
    for (const app of APPS) {
        // Install the app's own dependencies first, so that can't remove it.
        if (!(await ensureNodeModules(appDir(app)))) return false
        const dest = path.join(appDir(app), 'node_modules', PACKAGE_NAME)
        fs.rmSync(dest, { recursive: true, force: true })
        fs.mkdirSync(dest, { recursive: true })
        const extracted = await run(
            'tar',
            [
                '-xzf',
                path.join(OUT, tarball),
                '-C',
                dest,
                '--strip-components=1',
            ],
            { log, timeout: 60 },
        )
        if (!extracted.ok) {
            record('FAIL', 'package', `installing into ${app} failed`)
            return false
        }
    }
    say(`Installed ${tarball} into ${APPS.join(' and ')}`)
    return true
}

async function stopMetro() {
    if (metro === undefined) return
    const pgid = metro
    killGroup(pgid)
    metro = undefined
    // The next app's Metro needs the port.
    for (let i = 0; i < 20 && portInUse(8081); i++) await sleep(500)
    if (!groupAlive(pgid)) groups.delete(pgid)
}

// --- Regression runner ---------------------------------------------------

// Runs the regression cases through the app's runner
// (ReactNativeFastImageExample/src/RegressionRunner.tsx) instead of a flow:
// the app is launched while this script is connected to the image server's
// relay, so it shows the runner, which shows one group of cases at a time and
// reports each case's status over the WebSocket the server relays. Once a
// group is all OK (or GROUP_TIMEOUT has passed) a screenshot
// of it is saved with simctl or adb, and the next group is asked for. Nothing
// goes through the accessibility tree, so a group takes about as long as its
// slowest case. Output: <out>/<app>-<platform>/regression/.
// How long the app has to connect after launching (its first bundle can take
// minutes on a slow machine without Metro's cache).
const HELLO_TIMEOUT = seconds('VERIFY_HELLO_TIMEOUT', 90) * 1000
// How long the app may be disconnected before a group fails with "the app
// went away": the emulator's network drops for a few seconds now and then,
// and the runner reconnects and shows the group again.
const RECONNECT_GRACE_MS = 10_000
const GROUP_TIMEOUT = 30_000

type RunnerMessage = { type: string } & Record<string, unknown>

function screenshot(platform: Platform, device: string, file: string) {
    if (platform === 'ios') {
        capture('xcrun', ['simctl', 'io', device, 'screenshot', file])
        return
    }
    try {
        fs.writeFileSync(
            file,
            execFileSync(ADB, ['-s', device, 'exec-out', 'screencap', '-p'], {
                maxBuffer: 64 * 1024 * 1024,
                timeout: 30_000,
            }),
        )
    } catch {
        // No screenshot, then.
    }
}

// With VERIFY_IDB_COMPANION (the path of idb_companion), the regression groups'
// screenshots on iOS come from a companion connected to the simulator, over
// its gRPC API: about 80 ms each, where `simctl io screenshot` takes about 450
// (it starts and connects each time). Its images match simctl's within the
// comparison's threshold, the device's mask aside, which the crop leaves out.
// Without it (or if it fails), simctl.
const IDB_COMPANION_PORT = 10882
let idb: http2.ClientHttp2Session | undefined
let idbCompanion: number | undefined

async function startIdbCompanion(udid: string) {
    const binary = env.VERIFY_IDB_COMPANION
    if (!binary || idb || portInUse(IDB_COMPANION_PORT)) return
    const log = path.join(OUT, 'idb-companion.log')
    idbCompanion = start(
        binary,
        ['--udid', udid, '--grpc-port', String(IDB_COMPANION_PORT)],
        { log },
    ).pid
    if (idbCompanion !== undefined) groups.add(idbCompanion)
    // It prints its port once it listens.
    for (let i = 0; i < 60; i++) {
        if (fs.readFileSync(log, 'utf8').includes('"grpc_port"')) break
        await sleep(500)
    }
    const session = http2.connect(`http://127.0.0.1:${IDB_COMPANION_PORT}`)
    session.on('error', () => (idb = undefined))
    idb = session
}

function stopIdbCompanion() {
    idb?.close()
    idb = undefined
    if (idbCompanion !== undefined) stop(idbCompanion)
    idbCompanion = undefined
}

// The bytes of a protobuf message's first length-delimited field `field` (a
// ScreenshotResponse's image_data is 1).
function protobufField(message: Buffer, field: number) {
    let i = 0
    const varint = () => {
        let value = 0
        let shift = 0
        let byte
        do {
            byte = message[i++]
            value += (byte & 0x7f) * 2 ** shift
            shift += 7
        } while (byte & 0x80)
        return value
    }
    while (i < message.length) {
        const key = varint()
        const type = key & 7
        if (type === 2) {
            const length = varint()
            if (key >> 3 === field) return message.subarray(i, i + length)
            i += length
        } else if (type === 0) varint()
        else if (type === 1) i += 8
        else if (type === 5) i += 4
        else return undefined
    }
    return undefined
}

// A screenshot from the companion (PNG), or undefined.
function idbScreenshot() {
    const session = idb
    if (!session) return Promise.resolve(undefined)
    return new Promise<Buffer | undefined>((resolve) => {
        // An empty ScreenshotRequest (a PNG of the whole screen), in a gRPC
        // frame.
        const stream = session.request({
            ':method': 'POST',
            ':path': '/idb.CompanionService/screenshot',
            'content-type': 'application/grpc',
            te: 'trailers',
        })
        const chunks: Buffer[] = []
        const timer = setTimeout(() => stream.close(), 10_000)
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('end', () => {
            clearTimeout(timer)
            const body = Buffer.concat(chunks)
            resolve(
                body.length > 5
                    ? protobufField(
                          body.subarray(5, 5 + body.readUInt32BE(1)),
                          1,
                      )
                    : undefined,
            )
        })
        stream.on('error', () => {
            clearTimeout(timer)
            resolve(undefined)
        })
        stream.end(Buffer.alloc(5))
    })
}

// Calls `onMessage` with each message of a gRPC response stream. The chunks
// are joined once a message is complete (an emulator frame is about 8 MB, in
// 16 KB chunks).
function onGrpcMessages(
    stream: http2.ClientHttp2Stream,
    onMessage: (message: Buffer) => void,
) {
    let chunks: Buffer[] = []
    let length = 0
    stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        length += chunk.length
        while (length >= 5) {
            if (chunks[0].length < 5) chunks = [Buffer.concat(chunks)]
            const size = 5 + chunks[0].readUInt32BE(1)
            if (length < size) break
            const all = Buffer.concat(chunks, length)
            onMessage(all.subarray(5, size))
            chunks = length > size ? [all.subarray(size)] : []
            length -= size
        }
    })
}

// A gRPC frame of a protobuf message given as bytes.
function grpcFrame(message: number[]) {
    const frame = Buffer.alloc(5 + message.length)
    frame.writeUInt32BE(message.length, 1)
    Buffer.from(message).copy(frame, 5)
    return frame
}

// A video stream written to `file` (mp4) by ffmpeg, each frame timed by when
// it arrives, so the video starts at its first frame: `write` takes the
// stream's next bytes, `started` resolves with the time (wall clock) the first
// came (undefined if none did), and `finish` completes the file. Raw H.264 by
// default (copied), or `input`'s format (encoded).
function streamRecording(file: string, input = ['-f', 'h264']) {
    const raw = input[1] !== 'h264'
    const ffmpeg = spawn(
        'ffmpeg',
        [
            '-v',
            'error',
            '-y',
            ...input,
            '-use_wallclock_as_timestamps',
            '1',
            '-i',
            'pipe:0',
            ...(raw
                ? ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '10']
                : ['-c', 'copy']),
            file,
        ],
        { stdio: ['pipe', 'ignore', 'ignore'] },
    )
    recorders.add(ffmpeg)
    const exited = new Promise<void>((resolve) =>
        ffmpeg.on('close', () => {
            recorders.delete(ffmpeg)
            resolve()
        }),
    )
    ffmpeg.stdin?.on('error', () => {})
    let settle: (at: number | undefined) => void = () => {}
    const started = new Promise<number | undefined>((resolve) => {
        const timer = setTimeout(() => resolve(undefined), 10_000)
        settle = (at) => {
            clearTimeout(timer)
            resolve(at)
        }
    })
    return {
        started,
        write(data: Buffer) {
            settle(Date.now())
            ffmpeg.stdin?.write(data)
        },
        // The recorder stopped (before its first frame, if none came).
        ended: () => settle(undefined),
        async finish() {
            ffmpeg.stdin?.end()
            await Promise.race([exited, sleep(15_000)])
            ffmpeg.kill('SIGKILL')
            return fs.existsSync(file) && fs.statSync(file).size > 0
        },
    }
}

// A screen recording from the companion (see recordScreen), or undefined
// without one. Its video_stream sends the screen as H.264, 60 frames a second
// whether it changes or not, from about 100 ms after it's asked (the first
// stream of a companion takes about 600).
function idbRecordScreen(file: string) {
    const session = idb
    if (!session) return undefined
    const video = streamRecording(file)
    // A VideoStreamRequest's start: { fps: 60 } (H.264 is the default format).
    const stream = session.request({
        ':method': 'POST',
        ':path': '/idb.CompanionService/video_stream',
        'content-type': 'application/grpc',
        te: 'trailers',
    })
    stream.write(grpcFrame([0x0a, 0x02, 0x10, 60]))
    const ended = new Promise<void>((resolve) => stream.on('close', resolve))
    ended.then(video.ended)
    // VideoStreamResponses, each with a Payload (2) whose data (2) is the
    // next part of the video.
    onGrpcMessages(stream, (message) => {
        const payload = protobufField(message, 2)
        const data = payload && protobufField(payload, 2)
        if (data) video.write(data)
    })
    stream.on('error', () => {})
    const stop = async () => {
        // A VideoStreamRequest's stop: {}.
        if (!stream.closed) stream.end(grpcFrame([0x12, 0x00]))
        await Promise.race([ended, sleep(5000)])
        stream.close()
        return video.finish()
    }
    return { started: video.started, stop, busy: () => false }
}

// A regression group's screenshot: from the companion when there is one,
// once the screen has settled. A case's last status can reach the script
// before the simulator has drawn it (simctl's slower start hid that), so it
// takes screenshots until two in a row are the same outside `masks` (pixels;
// animated images), for up to a second.
async function captureScreenshot(
    platform: Platform,
    device: string,
    file: string,
    masks: PixelRect[],
) {
    let png = platform === 'ios' ? await idbScreenshot() : undefined
    if (png) {
        const until = Date.now() + 1000
        while (Date.now() < until) {
            const next = await idbScreenshot()
            if (!next) break
            const settled =
                next.equals(png) || (await sameOutside(png, next, masks, file))
            png = next
            if (settled) break
        }
        fs.writeFileSync(file, png)
        return
    }
    screenshot(platform, device, file)
}

// Whether two screenshots are the same outside `masks` (pixels), with odiff
// (see compareScreenshot); `file` names the temporary files.
async function sameOutside(
    a: Buffer,
    b: Buffer,
    masks: PixelRect[],
    file: string,
) {
    const ignoreRegions = odiffRegions(masks)
    if (ignoreRegions.length === 0) return false
    const [fileA, fileB] = ['a', 'b'].map((n) =>
        file.replace(/\.png$/, `-settle-${n}.png`),
    )
    fs.writeFileSync(fileA, a)
    fs.writeFileSync(fileB, b)
    try {
        const result = await compare(fileA, fileB, fileA, {
            antialiasing: true,
            failOnLayoutDiff: true,
            noFailOnFsErrors: true,
            ignoreRegions,
        })
        return result.match
    } catch {
        return false
    } finally {
        fs.rmSync(fileA, { force: true })
        fs.rmSync(fileB, { force: true })
    }
}

// Crops a screenshot (pixels) in place. Asynchronous: the app can go on to
// the next group meanwhile.
async function cropScreenshot(file: string, crop: PixelRect) {
    const cropped = file.replace(/\.png$/, '-cropped.png')
    try {
        await promisify(execFile)(
            'ffmpeg',
            [
                '-v',
                'error',
                '-y',
                '-i',
                file,
                '-vf',
                `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`,
                cropped,
            ],
            { timeout: 30_000 },
        )
    } catch {
        // Compared uncropped, then (and failing: the size differs).
    }
    if (fs.existsSync(cropped)) fs.renameSync(cropped, file)
}

// Each group's screenshot (and the ones a case asks for while it runs) is
// compared with a reference, screenshots/<app>-<platform>/<name>.png (in the
// repository, so a change to how something renders comes with new references
// in the same PR), with odiff (the odiff-bin dev dependency; anti-aliasing is
// ignored), leaving out the areas the app masks (animated images, timings).
// Up to SCREENSHOT_MAX_DIFF percent of the pixels may differ. A missing
// reference is seeded from the run (look at it before committing it);
// --update-screenshots replaces them all. On a mismatch the diff is written
// next to the screenshot in verify-output/.
const SCREENSHOTS = path.join(ROOT, 'screenshots')
const SCREENSHOT_MAX_DIFF = 0.1

type PixelRect = { x: number; y: number; width: number; height: number }

// Masks (pixels) as odiff's ignoreRegions.
const odiffRegions = (masks: PixelRect[]) =>
    masks
        .map((m) => ({
            x1: Math.max(0, Math.floor(m.x)),
            y1: Math.max(0, Math.floor(m.y)),
            x2: Math.ceil(m.x + m.width),
            y2: Math.ceil(m.y + m.height),
        }))
        // odiff hangs on an inverted region, and rejects an empty list.
        .filter(
            (r) =>
                [r.x1, r.y1, r.x2, r.y2].every(Number.isFinite) &&
                r.x2 > r.x1 &&
                r.y2 > r.y1,
        )

async function compareScreenshot(
    app: App,
    platform: Platform,
    name: string,
    file: string,
    masks: PixelRect[],
    // false for a group that failed, or a screenshot that couldn't be cropped
    // to the safe area: it may show an error screen, a case that didn't
    // finish, or the status bar, so it doesn't become (or replace) a
    // reference.
    canSeed: boolean,
): Promise<{
    result: 'match' | 'seeded' | 'none' | 'unseeded' | 'differs'
    detail?: string
}> {
    const dir = path.join(SCREENSHOTS, `${app}-${platform}`)
    const reference = path.join(dir, `${name}.png`)
    if (!fs.existsSync(reference) || UPDATE_SCREENSHOTS) {
        // Not from a --ref run: it shows the library as it was.
        if (REF) return { result: 'none' }
        if (!canSeed) return { result: 'unseeded' }
        fs.mkdirSync(dir, { recursive: true })
        fs.copyFileSync(file, reference)
        return { result: 'seeded' }
    }
    const diffFile = file.replace(/\.png$/, '-diff.png')
    const ignoreRegions = odiffRegions(masks)
    let result: Awaited<ReturnType<typeof compare>>
    try {
        result = await compare(reference, file, diffFile, {
            antialiasing: true,
            failOnLayoutDiff: true,
            noFailOnFsErrors: true,
            ...(ignoreRegions.length > 0 ? { ignoreRegions } : {}),
        })
    } catch (error) {
        return {
            result: 'differs',
            detail: `odiff failed: ${(error as Error).message}`,
        }
    }
    if (result.match) return { result: 'match' }
    if (result.reason === 'layout-diff') {
        return {
            result: 'differs',
            detail: `its size differs from ${rel(reference)}`,
        }
    }
    if (result.reason === 'pixel-diff') {
        if (result.diffPercentage <= SCREENSHOT_MAX_DIFF) {
            fs.rmSync(diffFile, { force: true })
            return { result: 'match' }
        }
        return {
            result: 'differs',
            detail: `${result.diffPercentage.toFixed(2)}% of the pixels (${result.diffCount}) differ from ${rel(reference)}; see ${rel(diffFile)}`,
        }
    }
    return { result: 'differs', detail: `${result.reason}: ${result.file}` }
}

// A case can check how an area of the screen changes over time, which a
// screenshot catches at one moment only (and not at a reliable one): e.g. an
// image fading in, or a source change that must never show a blank view. It
// sends { type: 'sample', group, name, area (dp), durationMs, expect,
// palette? }; the screen is recorded (recordScreen), { type: 'recording',
// group, name } tells the case to make the change, and the case sends
// { type: 'sampleDone', group, name } once it's done (durationMs is the most
// it's given). A group's samples share a recording, which starts with the
// first and stops once they're all done, so they can run at the same time;
// each is checked in its own part of it, from the last frame before its
// change. Each frame's color in the middle of the area is matched to the
// nearest of `expect` and `palette` (hex colors), or to none if it's far from
// all of them or about as near to two (e.g. halfway through a fade that
// doesn't list a color for it). Colors are compared perceptually (CIE Lab),
// with some tolerance for video compression. A color `expect` lists halfway
// between its neighbors (e.g. half cyan between black and cyan) stands for
// the fade between them: any frame on the way from one to the other counts as
// it (see SAMPLE_FADE_MIN), and the fade must only go one way. Then repeats
// are collapsed, and the sample passes if what's left is `expect`, in order.
// How many frames each color lasted doesn't matter. `palette` lists colors
// that mustn't appear (so they're matched rather than left out). The result
// goes back as { type: 'sampled', group, name, ok, seen, detail? }, which the
// case shows as its status. The recording is kept in verify-output/.
type Rgb = [number, number, number]
// ΔE (CIE76): a frame is a color if it's within this of it, and at most
// SAMPLE_MAX_RATIO times as far from it as from the next nearest color.
const SAMPLE_MAX_DISTANCE = 40
const SAMPLE_MAX_RATIO = 0.6
// A frame is part of a fade (see above) if it's this far (a fraction) or more
// from both of its ends, along the line between them (alpha blending mixes
// sRGB colors), and at most SAMPLE_FADE_DISTANCE (sRGB, 0-255) off that line.
// Within a fade, a frame may be up to SAMPLE_FADE_BACK behind the one before
// it (compression), no more.
const SAMPLE_FADE_MIN = 0.15
const SAMPLE_FADE_DISTANCE = 30
const SAMPLE_FADE_BACK = 0.1
// A sample's recording goes on this long after the case is done, for the
// frames that were still being drawn, and the case makes its change at least
// this long after it asked.
const SAMPLE_TAIL_MS = 500
// (VERIFY_SAMPLE_LEAD_MS: longer where a recording's first frames come late,
// e.g. simctl's on a busy machine, without the companion.)
const SAMPLE_LEAD_MS = Number(env.VERIFY_SAMPLE_LEAD_MS) || 500
// With VERIFY_SPARSE_RECORDINGS (a recorder that captures a few frames a
// second, e.g. an emulator without a GPU), a sample that saw its first and
// last colors more than this far apart, and nothing between them, isn't
// checked (see stopSession). Not by default: these recorders only add a
// frame when the screen changes, so a gap is also how long a color stayed,
// and an image that cut to the next instead of fading looks the same.
const SAMPLE_MAX_GAP_MS = 100
const SPARSE_RECORDINGS = !!env.VERIFY_SPARSE_RECORDINGS

// sRGB to CIE Lab (D65).
function toLab([r, g, b]: Rgb): Rgb {
    const linear = (c: number) => {
        const v = c / 255
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }
    const [lr, lg, lb] = [linear(r), linear(g), linear(b)]
    const x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047
    const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722
    const z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883
    const f = (t: number) =>
        t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t) / 116 + 16 / 116
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

const hexToRgb = (hex: string): Rgb => {
    const value = parseInt(hex.replace('#', ''), 16)
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

// Starts recording the screen to `file`. `started` resolves once frames are
// being recorded, with the time (wall clock) of the video's start (undefined
// if the recorder didn't start); `stop` ends the recording and resolves once
// the file is complete. The emulator's and the companion's recordings start
// at their first frame; without the companion, simctl's.
function recordScreen(platform: Platform, device: string, file: string) {
    if (platform === 'android')
        return (
            emulatorRecordScreen(device, file) ?? adbRecordScreen(device, file)
        )
    return idbRecordScreen(file) ?? simctlRecordScreen(device, file)
}

// The emulator's screen from the emulator itself, over its gRPC API, when the
// script started it (with -grpc): screenrecord runs in the emulated device,
// whose encoder stalls after a few frames without a GPU (CI), while
// streamScreenshot copies each frame the emulator draws, when the screen
// changes. At full size (a sample's area can be 4 pixels wide), RGB: about
// 8 MB a frame, so the connection's flow control windows are as large as
// they go (with the default 64 KB it got about 4 frames a second, about 45
// with these). undefined otherwise.
function emulatorRecordScreen(device: string, file: string) {
    if (!emulatorGrpc) return undefined
    // ffmpeg starts before the first frame comes, so it's timed when it came
    // (as the first one ffmpeg reads): it needs the size up front.
    const size = /(\d+)x(\d+)\s*$/.exec(
        capture(ADB, ['-s', device, 'shell', 'wm', 'size']) ?? '',
    )
    if (!size) return undefined
    const video = streamRecording(file, [
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        '-s',
        `${size[1]}x${size[2]}`,
    ])
    const session = http2.connect(`http://127.0.0.1:${EMULATOR_GRPC_PORT}`, {
        settings: { initialWindowSize: 2 ** 31 - 1 },
    })
    session.on('connect', () => session.setLocalWindowSize(2 ** 31 - 1))
    session.on('error', () => {})
    // An ImageFormat: { format: RGB888 (2) }, at the device's size.
    const stream = session.request({
        ':method': 'POST',
        ':path':
            '/android.emulation.control.EmulatorController/streamScreenshot',
        'content-type': 'application/grpc',
        te: 'trailers',
    })
    stream.end(grpcFrame([0x08, 2]))
    const ended = new Promise<void>((resolve) => stream.on('close', resolve))
    ended.then(video.ended)
    // Images: the pixels are field 4 (empty while the display is off).
    onGrpcMessages(stream, (message) => {
        const pixels = protobufField(message, 4)
        if (pixels?.length) video.write(pixels)
    })
    stream.on('error', () => {})
    const stop = async () => {
        stream.close()
        session.close()
        await Promise.race([ended, sleep(5000)])
        return video.finish()
    }
    return { started: video.started, stop, busy: () => false }
}

// The emulator's screen: screenrecord's raw H.264 through adb (see
// streamRecording). It only adds a frame when the screen changes.
function adbRecordScreen(device: string, file: string) {
    const video = streamRecording(file)
    const child = spawn(
        ADB,
        [
            '-s',
            device,
            'exec-out',
            'screenrecord',
            '--output-format=h264',
            '--time-limit',
            '60',
            '-',
        ],
        { stdio: ['ignore', 'pipe', 'ignore'] },
    )
    recorders.add(child)
    const exited = new Promise<void>((resolve) =>
        child.on('close', () => {
            recorders.delete(child)
            resolve()
        }),
    )
    exited.then(video.ended)
    child.stdout?.on('data', (data: Buffer) => video.write(data))
    const stop = async () => {
        capture(ADB, ['-s', device, 'shell', 'pkill', '-2', 'screenrecord'])
        await Promise.race([exited, sleep(15_000)])
        child.kill('SIGKILL')
        return video.finish()
    }
    return { started: video.started, stop, busy: () => false }
}

// The simulator's screen without the companion. simctl only writes its file
// once it stops, so the video's start is when it was launched: its first frame
// can come later (up to a second after it says "Recording started" on a busy
// CI machine), which the sample's lead has to cover.
function simctlRecordScreen(device: string, file: string) {
    const launchedAt = Date.now()
    const child = spawn(
        'xcrun',
        [
            'simctl',
            'io',
            device,
            'recordVideo',
            '--codec=h264',
            '--force',
            file,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    recorders.add(child)
    const exited = new Promise<void>((resolve) =>
        child.on('close', () => {
            recorders.delete(child)
            resolve()
        }),
    )
    // A simulator whose recording wasn't stopped (a run that was killed)
    // refuses to start another until it restarts.
    let busy = false
    const started = new Promise<number | undefined>((resolve) => {
        const timer = setTimeout(() => resolve(undefined), 10_000)
        const look = (data: Buffer) => {
            if (/already in progress/i.test(String(data))) busy = true
            if (/Recording started/.test(String(data))) {
                clearTimeout(timer)
                resolve(launchedAt)
            }
        }
        child.stdout?.on('data', look)
        child.stderr?.on('data', look)
        exited.then(() => resolve(undefined))
    })
    const stop = async () => {
        child.kill('SIGINT')
        await Promise.race([exited, sleep(15_000)])
        child.kill('SIGKILL')
        return fs.existsSync(file)
    }
    return { started, stop, busy: () => busy }
}

// The average color of the middle half of `area` (dp) in each frame of the
// video, with the frame's time (seconds from the start), in order.
function frameColors(
    video: string,
    area: PixelRect,
    windowWidthDp: number,
): { time: number; color: Rgb }[] {
    const size = capture('ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=p=0',
        video,
    ])
    const [width, height] = (size ?? '').split(',').map(Number)
    if (!width || !height)
        throw new Error("ffprobe couldn't read the recording")
    if (!windowWidthDp) throw new Error("the app didn't send its window size")
    const px = width / windowWidthDp
    const w = Math.max(2, Math.round((area.width / 2) * px))
    const h = Math.max(2, Math.round((area.height / 2) * px))
    const x = Math.min(
        width - w,
        Math.max(0, Math.round((area.x + area.width / 4) * px)),
    )
    const y = Math.min(
        height - h,
        Math.max(0, Math.round((area.y + area.height / 4) * px)),
    )
    const result = spawnSync(
        'ffmpeg',
        [
            '-v',
            'error',
            '-i',
            video,
            '-vf',
            `crop=${w}:${h}:${x}:${y},scale=1:1:flags=area`,
            '-fps_mode',
            'passthrough',
            '-f',
            'rawvideo',
            '-pix_fmt',
            'rgb24',
            '-',
        ],
        { maxBuffer: 64 * 1024 * 1024, timeout: 60_000 },
    )
    if (result.error || result.status !== 0) {
        throw new Error(
            `ffmpeg failed: ${result.error?.message ?? String(result.stderr).trim()}`,
        )
    }
    const data = result.stdout
    const times = (
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
        ]) ?? ''
    )
        .split('\n')
        .map((line) => parseFloat(line))
        .filter((time) => !Number.isNaN(time))
    if (times.length * 3 !== data.length) {
        throw new Error(
            `ffprobe found ${times.length} frames, ffmpeg ${data.length / 3}`,
        )
    }
    return times.map((time, i) => ({
        time,
        color: [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]],
    }))
}

// The frames a sample saw: the last one before `start` (what the area showed
// when the change was asked for), then those up to `end` (seconds).
function framesBetween(
    frames: { time: number; color: Rgb }[],
    start: number,
    end: number,
) {
    const first = frames.findLastIndex((frame) => frame.time <= start)
    return frames.slice(Math.max(0, first)).filter((frame) => frame.time <= end)
}

// The sample's colors (expected and palette), for sampleColor.
const sampleColors = (expect: string[], palette: string[]) =>
    [...new Set([...expect, ...palette])].map((hex) => ({
        hex,
        lab: toLab(hexToRgb(hex)),
    }))

// The color a frame clearly shows, if any.
function sampleColor(
    frame: Rgb,
    colors: { hex: string; lab: [number, number, number] }[],
) {
    const lab = toLab(frame)
    const [best, next] = colors
        .map(({ hex, lab: c }) => ({
            hex,
            distance: Math.hypot(lab[0] - c[0], lab[1] - c[1], lab[2] - c[2]),
        }))
        .sort((a, b) => a.distance - b.distance)
    return best !== undefined &&
        best.distance <= SAMPLE_MAX_DISTANCE &&
        (!next || best.distance <= SAMPLE_MAX_RATIO * next.distance)
        ? best.hex
        : undefined
}

// Where `frame` is on the way from `from` to `to` (0 to 1), if it's on the
// line between them (see SAMPLE_FADE_DISTANCE).
function fadePosition(frame: Rgb, from: Rgb, to: Rgb) {
    const d = to.map((c, i) => c - from[i])
    const f = frame.map((c, i) => c - from[i])
    const length2 = d.reduce((sum, c) => sum + c * c, 0)
    if (length2 === 0) return undefined
    const t = f.reduce((sum, c, i) => sum + c * d[i], 0) / length2
    const off = Math.hypot(...f.map((c, i) => c - t * d[i]))
    return t >= 0 && t <= 1 && off <= SAMPLE_FADE_DISTANCE ? t : undefined
}

// The colors seen (see above) and whether they're `expect`.
function matchSample(frames: Rgb[], expect: string[], palette: string[]) {
    const colors = sampleColors(expect, palette)
    // The fades: the colors `expect` lists halfway between their neighbors.
    const fades = new Map<string, { from: Rgb; to: Rgb }>()
    for (let i = 1; i < expect.length - 1; i++) {
        const [from, mid, to] = expect.slice(i - 1, i + 2).map(hexToRgb)
        if (mid.every((c, j) => Math.abs(c - (from[j] + to[j]) / 2) <= 2))
            fades.set(expect[i], { from, to })
    }
    const seen: string[] = []
    // Where the fade being seen has got to, and whether it went back.
    let position = 0
    let back = false
    for (const frame of frames) {
        let hex = sampleColor(frame, colors)
        let at: number | undefined
        for (const [mid, { from, to }] of fades) {
            if (hex !== undefined && hex !== mid) continue
            const t = fadePosition(frame, from, to)
            if (
                t !== undefined &&
                t >= SAMPLE_FADE_MIN &&
                t <= 1 - SAMPLE_FADE_MIN
            ) {
                hex = mid
                at = t
            }
        }
        if (!hex) continue
        if (at !== undefined) {
            if (seen.at(-1) !== hex) position = at
            else if (at < position - SAMPLE_FADE_BACK) back = true
            else position = Math.max(position, at)
        }
        if (seen.at(-1) !== hex) seen.push(hex)
    }
    const ok =
        !back &&
        seen.length === expect.length &&
        seen.every((color, i) => color === expect[i])
    return {
        ok,
        seen,
        ...(back ? { detail: `a fade went back (saw ${seen.join(' ')})` } : {}),
    }
}

async function runRegression(
    app: App,
    platform: Platform,
    device: string,
    appId: string,
) {
    const name = `${app} ${platform} regression`
    const dir = path.join(OUT, `${app}-${platform}`, 'regression')
    fs.mkdirSync(dir, { recursive: true })
    const log = path.join(dir, 'regression.log')
    const logLine = (line: string) =>
        fs.appendFileSync(
            log,
            `${new Date().toISOString().slice(11, 23)} ${line}\n`,
        )
    const startedAt = Date.now()

    // Messages from the app, and a way to wait for one.
    const messages: RunnerMessage[] = []
    const waiters = new Set<() => void>()
    const notify = () => waiters.forEach((waiter) => waiter())
    let appConnected = false
    // When the app disconnected, if it hasn't reconnected since.
    let disconnectedAt: number | undefined
    let socketError: string | undefined
    // Whether the app is gone: disconnected for longer than the grace period
    // (or never connected), or the relay's socket failed.
    const appGone = () =>
        !!socketError ||
        (!appConnected &&
            (disconnectedAt === undefined ||
                Date.now() - disconnectedAt >= RECONNECT_GRACE_MS))
    // From hello.
    let groups: string[] = []
    let scale = 1
    let windowWidth = 0
    const failures: string[] = []
    // Each group's failures, by index: a group that failed runs once more at
    // the end, and its second try's replace them.
    const groupFailures = new Map<number, string[]>()
    const failuresOf = (index: number) => {
        let list = groupFailures.get(index)
        if (!list) groupFailures.set(index, (list = []))
        return list
    }
    const seeded: string[] = []
    const noReference: string[] = []
    const unseeded: string[] = []
    // Video samples a stalled recording couldn't check (see stopSession).
    const unchecked: string[] = []
    // A screenshot of the group on screen (index), once it's all OK (or timed
    // out), compared with its reference. Comparisons (and video samples) run
    // in the background; `shots` is awaited at the end.
    const shots: Promise<void>[] = []
    // masks: the areas the app measured just before (dp), to leave out.
    // area: the part of the screen to keep (dp), the safe area: not the
    // status bar or the system's bars at the bottom.
    // Takes a group's screenshot, and resolves once it's taken with its
    // comparison (which goes on while the app shows the next group).
    const takeShot = async (
        index: number,
        masksDp: unknown,
        area: PixelRect | undefined,
        groupOk: boolean,
    ): Promise<{ shot: Promise<void> }> => {
        // The web version's cases are checked by their statuses only.
        if (platform === 'web') return { shot: Promise.resolve() }
        const name = groups[index]
        const file = path.join(
            dir,
            `${String(index + 1).padStart(2, '0')}-${name}.png`,
        )
        const screenMasks = (
            Array.isArray(masksDp) ? (masksDp as PixelRect[]) : []
        ).map((m) => ({
            x: m.x * scale,
            y: m.y * scale,
            width: m.width * scale,
            height: m.height * scale,
        }))
        await captureScreenshot(platform, device, file, screenMasks)
        const crop = area && {
            x: Math.round(area.x * scale),
            y: Math.round(area.y * scale),
            width: Math.round(area.width * scale),
            height: Math.round(area.height * scale),
        }
        const masks = screenMasks.map((m) => ({
            ...m,
            x: m.x - (crop?.x ?? 0),
            y: m.y - (crop?.y ?? 0),
        }))
        const shot = (crop ? cropScreenshot(file, crop) : Promise.resolve())
            .then(() =>
                compareScreenshot(
                    app,
                    platform,
                    name,
                    file,
                    masks,
                    groupOk && !!crop,
                ),
            )
            .then(({ result, detail }) => {
                logLine(
                    `screenshot ${name}: ${result}${detail ? ` (${detail})` : ''}${
                        masks.length > 0 ? `, ${masks.length} masked` : ''
                    }`,
                )
                if (result === 'seeded') seeded.push(name)
                else if (result === 'none') noReference.push(name)
                else if (result === 'unseeded') unseeded.push(name)
                else if (result === 'differs')
                    failuresOf(index).push(`${name}: ${detail}`)
            })
        shots.push(shot)
        return { shot }
    }
    // Video samples (see matchSample), keyed by `${group}/${name}`. A group's
    // share a recording (a session), checked once it stops.
    type Sample = {
        message: RunnerMessage
        // When the case asked (its area shows what it should before the
        // change from then), and when it was done (ms from the recording's
        // start).
        start: number
        end?: number
        done?: () => void
    }
    type Session = {
        index: number
        file: string
        // When the video starts (wall time; see recordScreen), undefined if
        // the recorder didn't start.
        started: Promise<number | undefined>
        stop: Promise<() => Promise<boolean>>
        // Whether the simulator said a recording was already in progress.
        busy: Promise<() => boolean>
        samples: Sample[]
        active: number
        stopTimer?: ReturnType<typeof setTimeout>
    }
    const openSamples = new Map<string, Sample>()
    let session: Session | undefined
    // A recording starts once the previous one has stopped.
    let stopped = Promise.resolve()
    const sessionFiles = new Map<number, number>()
    const startSample = (message: RunnerMessage) => {
        const index = message.group as number
        const name = String(message.name)
        if (!session || session.index !== index) {
            const count = (sessionFiles.get(index) ?? 0) + 1
            sessionFiles.set(index, count)
            const file = path.join(
                dir,
                `${String(index + 1).padStart(2, '0')}-${groups[index]}-samples${count > 1 ? `-${count}` : ''}.mp4`,
            )
            const recording = stopped.then(() =>
                recordScreen(platform, device, file),
            )
            session = {
                index,
                file,
                started: recording.then((r) => r.started),
                stop: recording.then((r) => r.stop),
                busy: recording.then((r) => r.busy),
                samples: [],
                active: 0,
            }
        }
        const current = session
        clearTimeout(current.stopTimer)
        const requested = Date.now()
        const sample: Sample = { message, start: 0 }
        current.samples.push(sample)
        current.active++
        openSamples.set(`${index}/${name}`, sample)
        current.started.then(async (t0) => {
            // Some of the video before the change (and, from simctl, time
            // for its first frame). A case can ask once its first image has
            // loaded, before it's drawn, so its part of the video starts at
            // the change.
            const lead = requested + SAMPLE_LEAD_MS - Date.now()
            if (lead > 0) await new Promise((r) => setTimeout(r, lead))
            sample.start = t0 === undefined ? 0 : Math.max(0, Date.now() - t0)
            // The case makes its change now (even without a recording).
            send({ type: 'recording', group: index, name })
            const limit = setTimeout(
                () => sample.done?.(),
                Number(message.durationMs) || 5000,
            )
            sample.done = () => {
                if (sample.end !== undefined) return
                clearTimeout(limit)
                openSamples.delete(`${index}/${name}`)
                sample.end = t0 === undefined ? 0 : Date.now() - t0
                // Once the last is done (and the frames after it recorded),
                // unless another sample starts meanwhile.
                if (--current.active === 0) {
                    current.stopTimer = setTimeout(
                        () => stopSession(current),
                        SAMPLE_TAIL_MS,
                    )
                }
            }
        })
    }
    const stopSession = (current: Session) => {
        if (session === current) session = undefined
        const finished = (async () => {
            const t0 = await current.started
            const saved = await (await current.stop)()
            let error: string | undefined
            if (t0 === undefined)
                error = (await current.busy)()
                    ? 'the simulator says a recording is already in progress (from a run that was stopped): restart the simulator'
                    : "the recording didn't start"
            for (const sample of current.samples) {
                const { message } = sample
                const name = String(message.name)
                // Always answers, so the case doesn't wait forever.
                let result: { ok: boolean; seen: string[]; detail?: string }
                try {
                    if (error) throw new Error(error)
                    if (!saved) throw new Error('no recording was saved')
                    const area = message.area as PixelRect
                    const expect = (message.expect as string[]) ?? []
                    const palette = (message.palette as string[]) ?? []
                    const frames = framesBetween(
                        frameColors(current.file, area, windowWidth),
                        sample.start / 1000,
                        ((sample.end ?? 0) + SAMPLE_TAIL_MS) / 1000,
                    )
                    result = matchSample(
                        frames.map((frame) => frame.color),
                        expect,
                        palette,
                    )
                    // A recording that couldn't show the change doesn't fail
                    // it (the sample isn't checked; the summary lists it):
                    const colors = sampleColors(expect, palette)
                    const shown = frames.map((frame) => ({
                        time: frame.time,
                        hex: sampleColor(frame.color, colors),
                    }))
                    const [first] = expect
                    const last = expect.at(-1)
                    const end = shown.findIndex((frame) => frame.hex === last)
                    const before = shown
                        .slice(0, Math.max(0, end))
                        .findLastIndex((frame) => frame.hex === first)
                    let unseen: string | undefined
                    if (!result.ok && last && end === -1) {
                        // No frame of the last color: the recorder stalled
                        // (a CI emulator's does after a few frames), or the
                        // change wasn't made. The screen now tells them
                        // apart.
                        const shot = path.join(dir, `${name}-after.png`)
                        screenshot(platform, device, shot)
                        const [after] = frameColors(shot, area, windowWidth)
                        if (after && sampleColor(after.color, colors) === last)
                            unseen = `the recording stopped before ${last}, which the area shows now`
                    } else if (
                        SPARSE_RECORDINGS &&
                        !result.ok &&
                        before !== -1
                    ) {
                        // Too few frames between the first and last colors
                        // to see what came between them.
                        const gap = Math.round(
                            (shown[end].time - shown[before].time) * 1000,
                        )
                        if (gap > SAMPLE_MAX_GAP_MS)
                            unseen = `the recording has no frames for ${gap} ms during the change`
                    }
                    if (unseen) {
                        result = {
                            ok: true,
                            seen: result.seen,
                            detail: `not checked: ${unseen}`,
                        }
                        unchecked.push(name)
                    }
                } catch (e) {
                    result = {
                        ok: false,
                        seen: [],
                        detail: (e as Error).message,
                    }
                }
                logLine(
                    `sample ${name}: ${result.ok ? 'OK' : 'failed'}, ${result.detail ?? `saw ${result.seen.join(' ') || 'nothing'}`} (${rel(current.file)})`,
                )
                send({ type: 'sampled', group: current.index, name, ...result })
            }
        })()
        stopped = finished.catch(() => {})
        shots.push(stopped)
    }
    const ws = new WebSocket(
        `ws://127.0.0.1:${IMAGE_SERVER_PORT}/regression?role=controller&platform=${TV && platform === 'ios' ? 'tvos' : platform}`,
    )
    ws.onopen = notify
    // The group on screen. If the app starts again (maestro-runner's iOS
    // driver relaunches it for the touch group), show that group again.
    let showing: number | undefined
    ws.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as RunnerMessage
        logLine(`<- ${JSON.stringify(message)}`)
        if (message.type === 'app') {
            appConnected = message.connected === true
            disconnectedAt = appConnected ? undefined : Date.now()
            // Look again once the grace period is over.
            if (!appConnected) setTimeout(notify, RECONNECT_GRACE_MS + 100)
        } else messages.push(message)
        if (message.type === 'hello' && showing !== undefined) {
            send({ type: 'show', index: showing })
        }
        if (message.type === 'sample' && groups.length > 0) startSample(message)
        if (message.type === 'sampleDone') {
            openSamples.get(`${message.group}/${message.name}`)?.done?.()
        }
        notify()
    }
    ws.onerror = () => {
        socketError = 'WebSocket error'
        notify()
    }
    ws.onclose = () => {
        socketError ??= 'WebSocket closed'
        notify()
    }
    // Resolves with check()'s value once it isn't undefined, or with whatever
    // it is when the time is up or the socket fails.
    const waitFor = <T,>(check: () => T | undefined, timeoutMs: number) =>
        new Promise<T | undefined>((resolve) => {
            const finish = () => {
                clearTimeout(timer)
                waiters.delete(look)
                resolve(check())
            }
            const look = () => {
                if (check() !== undefined || socketError) finish()
            }
            const timer = setTimeout(finish, Math.max(0, timeoutMs))
            waiters.add(look)
            look()
        })
    const send = (message: RunnerMessage) => {
        logLine(`-> ${JSON.stringify(message)}`)
        ws.send(JSON.stringify(message))
    }
    const fail = (detail: string) => {
        record('FAIL', name, `${detail}; see ${rel(dir)}`)
        ws.close()
    }

    // Connecting took over 5 s on a busy CI runner.
    if (
        !(await waitFor(
            () => (ws.readyState === WebSocket.OPEN ? true : undefined),
            30_000,
        ))
    ) {
        fail(socketError ?? "couldn't connect to the image server's relay")
        return
    }

    // The bundle Metro was asked for while the native builds ran.
    await bundleWarm
    // A fresh start, now that this script is connected, so the app opens on
    // the runner.
    if (platform === 'web') openWeb(dir)
    else if (platform === 'ios') {
        // The same status bar in every screenshot (Apple's own values).
        capture('xcrun', [
            'simctl',
            'status_bar',
            device,
            'override',
            '--time',
            '9:41',
            '--dataNetwork',
            'wifi',
            '--wifiMode',
            'active',
            '--wifiBars',
            '3',
            '--cellularMode',
            'notSupported',
            '--batteryState',
            'charged',
            '--batteryLevel',
            '100',
        ])
        capture('xcrun', ['simctl', 'terminate', device, appId])
        // Without React Native's development banner ("Downloading 100%"),
        // which the first group's screenshot caught at the top. A default
        // rather than a launch argument, so it also applies when
        // maestro-runner relaunches the app (the touch group); removed after
        // the app's run (flowsIos).
        capture('xcrun', [
            'simctl',
            'spawn',
            device,
            'defaults',
            'write',
            appId,
            'FastImageHideDevLoadingView',
            '-bool',
            'YES',
        ])
        // A newly installed app's first launch can take minutes on a freshly
        // booted simulator (a CI machine's); a launch that's cut short still
        // happens later, after the wait for the app has started.
        for (let attempt = 1; attempt <= 2; attempt++) {
            const launchStart = Date.now()
            const launched = capture(
                'xcrun',
                ['simctl', 'launch', device, appId],
                { timeout: 300 },
            )
            logLine(
                `launch: ${launched === undefined ? 'failed' : 'OK'} after ${((Date.now() - launchStart) / 1000).toFixed(1)}s`,
            )
            if (launched !== undefined) break
        }
    } else {
        capture(ADB, ['-s', device, 'shell', 'am', 'force-stop', appId])
        capture(
            ADB,
            [
                '-s',
                device,
                'shell',
                'am',
                'start',
                '-W',
                '-n',
                `${appId}/.MainActivity`,
                // Without React Native's development banner (see iOS).
                '--ez',
                'hideDevLoadingView',
                'true',
            ],
            { timeout: 60 },
        )
    }

    // What the app shows if it's slow to connect (e.g. it started as the
    // example app, not the runner).
    const slowHello = setTimeout(() => {
        if (platform !== 'web' && !messages.some((m) => m.type === 'hello'))
            screenshot(
                platform,
                device,
                path.join(dir, 'waiting-for-hello.png'),
            )
    }, 60_000)
    const hello = await waitFor(
        () => messages.find((m) => m.type === 'hello'),
        HELLO_TIMEOUT,
    )
    clearTimeout(slowHello)
    if (!hello) {
        // What the app shows instead (e.g. an error, or a system dialog).
        if (platform !== 'web')
            screenshot(platform, device, path.join(dir, 'no-hello.png'))
        fail(
            socketError ??
                `the app didn't connect within ${HELLO_TIMEOUT / 1000}s`,
        )
        return
    }
    // tvOS zooms a launched app in for about a second, which the first
    // group's screenshot could catch.
    if (TV) await new Promise((resolve) => setTimeout(resolve, 2000))
    groups = hello.groups as string[]
    scale = Number(hello.scale) || 1
    windowWidth = Number((hello.window as { width?: number })?.width) || 0
    const timings: string[] = []
    let measureRequests = 0
    const statuses: Record<string, Record<string, string>> = {}
    // A case's latest status, from the messages from `since` on (a retry's).
    const statusOf = (index: number, id: string, since = 0) => {
        for (let i = messages.length - 1; i >= since; i--) {
            const m = messages[i]
            if (m.type === 'status' && m.group === index && m.id === id)
                return m.status as string | undefined
        }
        return undefined
    }
    // With --shard i/n, the i-th of n ranges of the groups, in order (each
    // shard is a run of its own, e.g. a CI job; the first has `start`, which
    // must come before any image has loaded).
    const [first, end] = shardRange(groups, GROUP_TIMES[`${app}-${platform}`])
    if (SHARD)
        logLine(
            `shard ${SHARD.index}/${SHARD.count}: groups ${first + 1}-${end} of ${groups.length}`,
        )
    if (first > 0) send({ type: 'show', index: first })
    // Shows a group's results once it's on screen (index): waits for its cases,
    // then takes its screenshot. since: where its messages start (a retry's
    // come after the first try's). connected: false if the app went away.
    const runGroup = async (index: number, since: number, label: string) => {
        const group = groups[index]
        showing = index
        const groupStart = Date.now()
        const own = failuresOf(index)
        const failGroup = (failure: string) => own.push(failure)
        const shown = await waitFor(
            () =>
                messages.find(
                    (m, i) =>
                        i >= since && m.type === 'group' && m.index === index,
                ),
            GROUP_TIMEOUT,
        )
        if (!shown) {
            failGroup(
                `${group}: not shown (${socketError ?? (appConnected ? 'timed out' : 'the app went away')})`,
            )
            return { connected: false }
        }
        const cases = shown.cases as string[]
        // Cases that need a real touch: tap them (maestro/touch.yaml). They
        // report their OK like the others.
        if (group === 'touch') {
            const tapped = await run(
                MAESTRO_RUNNER,
                [
                    ...maestroArgs(platform, device),
                    'test',
                    '-e',
                    `APP_ID=${appId}`,
                    '--output',
                    path.join(dir, 'touch-report'),
                    '--flatten',
                    path.join(ROOT, 'maestro/touch.yaml'),
                ],
                {
                    cwd: dir,
                    log: path.join(dir, 'touch.log'),
                    timeout: FLOWS_TIMEOUT,
                    extraEnv: MAESTRO_ENV,
                },
            )
            logLine(
                `touch flow: ${tapped.ok ? 'OK' : `failed${tapped.timedOut ? ' (timed out)' : ''}, see touch.log`}`,
            )
        }
        // The group's time limit counts from here (the taps can take a while
        // the first time maestro-runner builds WebDriverAgent).
        const waitStart = Date.now()
        // true once every case is OK, false if the app went away.
        const result = await waitFor(
            () =>
                cases.every((id) => statusOf(index, id, since) === 'OK')
                    ? true
                    : appGone()
                      ? false
                      : undefined,
            GROUP_TIMEOUT - (Date.now() - waitStart),
        )
        statuses[group] = Object.fromEntries(
            cases.map((id) => [id, statusOf(index, id, since) ?? 'no status']),
        )
        if (result === false) {
            failGroup(`${group}: the app went away`)
            return { connected: false }
        }
        if (!result) {
            for (const id of cases) {
                const status = statusOf(index, id, since)
                if (status !== 'OK')
                    failGroup(`${id}: ${status ?? 'no status'}`)
            }
        }
        // The app measures the masks once the last status's render has been
        // laid out, so they're where the screenshot will see them.
        const id = ++measureRequests
        send({ type: 'measure', group: index, id })
        const measured = await waitFor(
            () => messages.find((m) => m.type === 'masks' && m.id === id),
            5000,
        )
        if (!measured) failGroup(`${group}: the app didn't send its masks`)
        else if (!measured.safeArea)
            failGroup(
                `${group}: the app didn't send its safe area (the screenshot isn't cropped)`,
            )
        // Cases below (or beside) the visible screen would be cut off in the
        // screenshot: split the group.
        const content = measured?.content as PixelRect | undefined
        const visible = measured?.visible as PixelRect | undefined
        if (content && visible) {
            const below =
                content.y + content.height - (visible.y + visible.height)
            const beside =
                content.x + content.width - (visible.x + visible.width)
            if (below > 1 || beside > 1) {
                failGroup(
                    `${group}: cut off: its cases end ${Math.ceil(Math.max(below, beside))} dp ${below > 1 ? 'below' : 'right of'} the visible screen (split the group)`,
                )
            }
        }
        const groupOk = own.length === 0
        const { shot } = await takeShot(
            index,
            measured?.masks,
            measured?.safeArea as PixelRect | undefined,
            groupOk,
        )
        const seconds = ((Date.now() - groupStart) / 1000).toFixed(1)
        timings.push(`${group}${since > 0 ? ' (retry)' : ''} ${seconds}s`)
        // Progress in the main log, so a slow group doesn't look like a hang
        // (the details are in regression.log). The screenshot's comparison
        // finishes later.
        console.log(
            `    ${elapsed()} ${name}: ${label} ${group} ${groupOk ? 'OK' : 'failed'} (${seconds}s)`,
        )
        return { connected: true, shot }
    }
    let connected = true
    for (let index = first; index < end && connected; index++) {
        ;({ connected } = await runGroup(
            index,
            0,
            `${index + 1 - first}/${end - first}`,
        ))
        if (connected) send({ type: 'next' })
    }
    if (end === groups.length && connected)
        await waitFor(() => messages.find((m) => m.type === 'done'), 5000)
    // Once more for each group that failed (e.g. a video sample that missed
    // its change on a busy machine), unless the app went away: the second
    // try counts, and the summary names the groups that passed on it.
    await Promise.all(shots)
    const passedOnRetry: string[] = []
    const retries = [...groupFailures]
        .filter(([, list]) => list.length > 0)
        .map(([index]) => index)
        .sort((a, b) => a - b)
    for (const index of connected ? retries : []) {
        const firstTry = groupFailures.get(index) ?? []
        groupFailures.set(index, [])
        const since = messages.length
        send({ type: 'show', index })
        const retry = await runGroup(index, since, 'retry')
        await retry.shot
        if (!retry.connected) break
        if (failuresOf(index).length === 0)
            passedOnRetry.push(`${groups[index]} (${firstTry[0]})`)
    }
    ws.close()
    await Promise.all(shots)
    failures.push(...[...groupFailures.values()].flat())
    // Seeded by a retry that passed.
    const stillUnseeded = unseeded.filter((group) => !seeded.includes(group))
    const total = ((Date.now() - startedAt) / 1000).toFixed(1)
    fs.writeFileSync(
        path.join(dir, 'results.json'),
        JSON.stringify(
            {
                hello,
                statuses,
                failures,
                seeded,
                noReference,
                unseeded: stillUnseeded,
                passedOnRetry,
                unchecked,
                timings,
            },
            null,
            2,
        ) + '\n',
    )
    logLine(`done in ${total}s: ${timings.join(', ')}`)
    const seededNote =
        (seeded.length > 0
            ? `; ${seeded.length} reference screenshot${seeded.length === 1 ? '' : 's'} seeded in ${rel(SCREENSHOTS)}, look at them before committing`
            : '') +
        (noReference.length > 0
            ? `; no reference for ${noReference.join(', ')} (not seeded from a --ref run)`
            : '') +
        (stillUnseeded.length > 0
            ? `; no reference for ${stillUnseeded.join(', ')} (not seeded or updated from a failed group)`
            : '') +
        (passedOnRetry.length > 0
            ? `; passed on retry: ${passedOnRetry.join(', ')}`
            : '') +
        (unchecked.length > 0
            ? `; samples not checked (their recordings couldn't show the change): ${unchecked.join(', ')}`
            : '')
    if (failures.length > 0) {
        record(
            'FAIL',
            name,
            `${failures.join('; ')}; see ${rel(dir)}${seededNote}`,
        )
    } else {
        record(
            'PASS',
            name,
            `${end - first} groups${SHARD ? ` (shard ${SHARD.index}/${SHARD.count})` : ''} in ${total}s${seededNote}`,
        )
    }
}

// --- Flows ---------------------------------------------------------------

// Saves a copy of a flow's screen recording sized for a GitHub comment (under
// 10 MB): 1080p at most, 30 fps, real time. A GitHub-hosted mp4 plays inline
// in a PR; the original stays in the report.
function saveRecording(
    app: App,
    platform: Platform,
    flow: { name: string; assetsDir?: string },
    report: string,
) {
    const name = `${app} ${platform} ${flow.name} recording`
    const source = path.join(report, flow.assetsDir ?? '', 'recording.mp4')
    if (!flow.assetsDir || !fs.existsSync(source)) {
        record('FAIL', name, 'no recording in the report')
        return
    }
    fs.mkdirSync(RECORDINGS, { recursive: true })
    const target = path.join(RECORDINGS, `${app}-${platform}-${flow.name}.mp4`)
    const ffmpeg = spawnSync(
        'ffmpeg',
        [
            '-v',
            'error',
            '-y',
            '-i',
            source,
            '-an',
            '-vf',
            'scale=-2:2*trunc(min(1080\\,ih)/2),fps=30',
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '28',
            '-pix_fmt',
            'yuv420p',
            '-movflags',
            '+faststart',
            target,
        ],
        { encoding: 'utf8', timeout: 300_000 },
    )
    if (ffmpeg.status !== 0) {
        record(
            'FAIL',
            name,
            ffmpeg.error
                ? `ffmpeg not found (install it, or use ${rel(source)})`
                : `ffmpeg failed: ${ffmpeg.stderr.trim().split('\n').at(-1)}`,
        )
        return
    }
    record('PASS', name, rel(target))
}

// maestro-runner's arguments for a device. The Android driver usually starts
// in seconds, but can take longer right after an app install while Android
// compiles it.
function maestroArgs(platform: Platform, device: string) {
    return [
        '--platform',
        platform,
        '--device',
        device,
        ...(platform === 'android'
            ? [
                  '--driver',
                  env.MAESTRO_RUNNER_ANDROID_DRIVER ?? 'devicelab',
                  '--driver-start-timeout',
                  '90',
              ]
            : []),
    ]
}

// maestro-runner builds WebDriverAgent for iOS; see the xcconfig.
const MAESTRO_ENV = {
    XCODE_XCCONFIG_FILE:
        env.XCODE_XCCONFIG_FILE ??
        path.join(ROOT, 'scripts/maestro-runner-wda.xcconfig'),
}

// Runs the flows in maestro/ (with --background; the `runner` flow is run by
// runRegression) in one maestro-runner call (one driver session),
// then reads each flow's result from the report. Screenshots (and recordings
// with --record) go to the report's assets folder.
async function runFlows(
    app: App,
    platform: Platform,
    device: string,
    appId: string,
) {
    const dir = path.join(OUT, `${app}-${platform}`)
    fs.mkdirSync(dir, { recursive: true })
    // The background flows wait 20 s and 10 s with the app away (the second
    // one then restarts the app's UI on Android), about 2.5 minutes in all on
    // iOS (maestro-runner polls slowly on the home screen) and 1.5 on
    // Android.
    const timeout = FLOWS_TIMEOUT + (options.background ? 180 : 0)
    const log = path.join(dir, 'flows.log')
    const result = await run(
        MAESTRO_RUNNER,
        [
            ...maestroArgs(platform, device),
            'test',
            '-e',
            `APP_ID=${appId}`,
            '--output',
            path.join(dir, 'report'),
            '--flatten',
            '--exclude-tags',
            'runner',
            ...(RECORD ? ['--video', 'always'] : []),
            path.join(ROOT, 'maestro'),
        ],
        {
            cwd: dir,
            log,
            timeout,
            extraEnv: MAESTRO_ENV,
        },
    )
    let flows: { name: string; status: string; assetsDir?: string }[] = []
    try {
        flows = JSON.parse(
            fs.readFileSync(path.join(dir, 'report/report.json'), 'utf8'),
        ).flows
    } catch {
        // No report.
    }
    if (flows.length === 0) {
        record(
            'FAIL',
            `${app} ${platform} flows`,
            `${
                result.timedOut ? `timed out after ${timeout}s` : 'no report'
            }; see ${rel(log)}`,
        )
        return
    }
    for (const flow of flows) {
        if (flow.status === 'passed')
            record('PASS', `${app} ${platform} ${flow.name}`)
        else
            record(
                'FAIL',
                `${app} ${platform} ${flow.name}`,
                `${flow.status}${
                    result.timedOut ? ', timed out' : ''
                }; see ${rel(path.join(dir, 'report/report.html'))}`,
            )
        if (RECORD) saveRecording(app, platform, flow, path.join(dir, 'report'))
    }
}

// --- Web -----------------------------------------------------------------

// The Expo example's web version, served by its dev server with the native
// bundles, in headless Chrome (window about the size of an iPhone's), which
// runs until the run ends. Its runner talks to this script through the image
// server's relay, as the apps do.
let chrome: number | undefined
function openWeb(dir: string) {
    chrome = start(
        CHROME,
        [
            '--headless=new',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            `--user-data-dir=${path.join(OUT, 'chrome-profile')}`,
            '--window-size=402,874',
            'http://localhost:8081',
        ],
        { log: path.join(dir, 'chrome.log') },
    ).pid
    if (chrome !== undefined) groups.add(chrome)
}

async function flowsWeb(app: App) {
    await runRegression(app, 'web', 'chrome', '')
    if (chrome !== undefined) {
        stop(chrome)
        groups.delete(chrome)
        chrome = undefined
    }
}

// --- iOS -----------------------------------------------------------------

let iosUdid = ''
// Resolves once the simulator has booted: it boots while the apps install
// their pods and build (a first boot takes a minute or two), and buildIos
// waits for it before installing.
let iosBooted: Promise<unknown> = Promise.resolve()

// The flows run on a simulator of their own by default, so screenshots and
// recordings don't show other apps installed on a shared simulator. It's
// created on first use, like the emulator is started when none is running.
const IOS_SIMULATOR = TV
    ? (env.TVOS_SIMULATOR ?? 'RNFI Apple TV')
    : (env.IOS_SIMULATOR ?? 'RNFI iPhone')
const SIMULATOR_OS = TV ? 'tvOS' : 'iOS'
const SIMULATOR_SDK = TV ? 'appletvsimulator' : 'iphonesimulator'
// The device type the reference screenshots were taken on.
const SIMULATOR_TYPE = TV
    ? 'com.apple.CoreSimulator.SimDeviceType.Apple-TV-4K-3rd-generation-4K'
    : 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro'

function iosDevice() {
    const list = capture('xcrun', [
        'simctl',
        'list',
        'devices',
        'available',
        '-j',
    ])
    if (!list) return false
    type Device = {
        udid: string
        name: string
        isAvailable: boolean
        deviceTypeIdentifier: string
    }
    const version = (runtime: string) =>
        (runtime.match(new RegExp(`${SIMULATOR_OS}-(\\d+)-(\\d+)`)) ?? [])
            .slice(1)
            .map(Number)
    const devices = Object.entries(
        JSON.parse(list).devices as Record<string, Device[]>,
    )
        .filter(([runtime]) => runtime.includes(`SimRuntime.${SIMULATOR_OS}-`))
        // Newest first.
        .sort(([a], [b]) => {
            const [am = 0, an = 0] = version(a)
            const [bm = 0, bn = 0] = version(b)
            return bm - am || bn - an
        })
        .flatMap(([runtime, list]) => list.map((d) => ({ ...d, runtime })))
        .filter((d) => d.isAvailable)
    let pick = devices.find((d) => d.name === IOS_SIMULATOR)
    if (!pick && !env[TV ? 'TVOS_SIMULATOR' : 'IOS_SIMULATOR']) {
        // Create it with the newest runtime, and the device type the reference
        // screenshots were taken on (the newest iPhone's if Xcode doesn't
        // have it).
        const template = devices.find((d) =>
            d.name.startsWith(TV ? 'Apple TV' : 'iPhone'),
        )
        if (!template) return false
        say(`Creating simulator "${IOS_SIMULATOR}" (${SIMULATOR_TYPE})`)
        const udid =
            capture('xcrun', [
                'simctl',
                'create',
                IOS_SIMULATOR,
                SIMULATOR_TYPE,
                template.runtime,
            ]) ??
            capture('xcrun', [
                'simctl',
                'create',
                IOS_SIMULATOR,
                template.deviceTypeIdentifier,
                template.runtime,
            ])
        if (!udid) return false
        pick = { ...template, udid, name: IOS_SIMULATOR }
    }
    if (!pick) return false
    iosUdid = pick.udid
    // simctl boot itself waits a minute or two on a first boot.
    const log = path.join(OUT, 'simulator-boot.log')
    iosBooted = run('xcrun', ['simctl', 'boot', iosUdid], {
        log,
        timeout: 300,
    }).then(() =>
        run('xcrun', ['simctl', 'bootstatus', iosUdid, '-b'], {
            log,
            timeout: 300,
        }),
    )
    return true
}

// Which library code (the repo's source or the installed package) native
// builds were last set up for. Switching needs a new pod install and new
// Gradle autolinking, since both point at the library's directory.
const sourceMarker = (dir: string) => path.join(dir, '.fastimage-source')
const builtFrom = (dir: string) => {
    try {
        return fs.readFileSync(sourceMarker(dir), 'utf8').trim()
    } catch {
        return undefined
    }
}

// The Expo example's native projects (ios/, android/) are generated by
// `expo prebuild` (and ignored by git): again when its config or dependencies
// are newer than the last prebuild.
async function expoPrebuild(platform: 'ios' | 'android') {
    const dir = appDir('expo')
    const marker = path.join(dir, platform, '.fastimage-prebuild')
    const mtime = (file: string) => fs.statSync(file).mtimeMs
    const current =
        fs.existsSync(marker) &&
        ['app.config.js', 'package.json'].every(
            (file) => mtime(path.join(dir, file)) <= mtime(marker),
        )
    if (current) return true
    say(`expo prebuild (${platform})`)
    const log = path.join(OUT, `prebuild-expo-${platform}.log`)
    const result = await run(
        'bunx',
        ['expo', 'prebuild', '--platform', platform, '--no-install'],
        { cwd: dir, log, timeout: 300, extraEnv: EXPO_ENV },
    )
    if (!result.ok) {
        record('FAIL', `expo ${platform} prebuild`, `see ${rel(log)}`)
        return false
    }
    fs.writeFileSync(marker, '')
    return true
}

// Pods need reinstalling after node_modules is: `pod install` also generates
// files inside node_modules/react-native (and runs Codegen). And
// after the Podfile changed (e.g. another branch's): the installed Pods record
// the Podfile's SHA-1 they were installed for. And after FastImage's podspec
// changed (e.g. a dependency added), or a file was added to or removed from
// its ios folder (the podspec's `ios/**/*.{h,m,mm}` is resolved by `pod
// install`), or its package.json or Codegen specs (src/specs) changed (`pod
// install` runs Codegen from them): the source marker keeps the SHA-1 of all
// four, and the app's React Native version (see reactNativeChanged).
const libraryDir = (dir: string) =>
    FROM_PACKAGE ? path.join(dir, 'node_modules', PACKAGE_NAME) : ROOT
const packageJsonSha = (dir: string) =>
    createHash('sha1')
        .update(fs.readFileSync(path.join(libraryDir(dir), 'package.json')))
        .digest('hex')
const podspecSha = (dir: string) => {
    const lib = libraryDir(dir)
    const files = fs
        .readdirSync(path.join(lib, 'ios'), { recursive: true })
        .map(String)
        .sort()
    const hash = createHash('sha1')
        .update(fs.readFileSync(path.join(lib, 'RNFastImage.podspec')))
        .update(files.join('\n'))
        .update(packageJsonSha(dir))
    const specs = path.join(lib, 'src/specs')
    for (const file of fs.readdirSync(specs).sort())
        hash.update(fs.readFileSync(path.join(specs, file)))
    return hash.digest('hex')
}
const reactNativeVersion = (dir: string) =>
    String(
        JSON.parse(
            fs.readFileSync(
                path.join(dir, 'node_modules/react-native/package.json'),
                'utf8',
            ),
        ).version,
    )
const podsSource = (dir: string) =>
    `${SOURCE} ${podspecSha(dir)} react-native@${reactNativeVersion(dir)}`
// Whether the app's Podfile.lock or iOS build is for another React Native
// version than node_modules' (e.g. a copy of a checkout on another branch):
// pod install then fails on the lock's React-Core-prebuilt, and the build's
// prebuilt React Native shows "React Native version mismatch". Both are
// untracked, so they're removed and made again.
function reactNativeChanged(dir: string) {
    const version = reactNativeVersion(dir)
    const lock = path.join(dir, 'ios/Podfile.lock')
    const locked = fs.existsSync(lock)
        ? /^ {2}- React-Core \(([^)]+)\)/m.exec(
              fs.readFileSync(lock, 'utf8'),
          )?.[1]
        : undefined
    const built = builtFrom(path.join(dir, 'ios/build'))
    const stale = [
        locked && locked !== version && `Podfile.lock (${locked})`,
        built && built !== version && `ios/build (${built})`,
    ].filter(Boolean)
    if (stale.length === 0) return false
    say(
        `${stale.join(' and ')} for another React Native version than node_modules' (${version}): removing them`,
    )
    fs.rmSync(lock, { force: true })
    fs.rmSync(path.join(dir, 'ios/build'), { recursive: true, force: true })
    return true
}
// Why the Pods need installing, or undefined if they're current.
function podsOutdated(dir: string) {
    try {
        const pods = fs.statSync(path.join(dir, 'ios/Pods')).mtimeMs
        const rn = fs.statSync(path.join(dir, 'node_modules/react-native'))
        const podfile = createHash('sha1')
            .update(fs.readFileSync(path.join(dir, 'ios/Podfile')))
            .digest('hex')
        const manifest = fs.readFileSync(
            path.join(dir, 'ios/Pods/Manifest.lock'),
            'utf8',
        )
        if (pods < rn.mtimeMs) return 'node_modules is newer'
        if (builtFrom(path.join(dir, 'ios/Pods')) !== podsSource(dir))
            return 'the library, its specs or React Native changed'
        // pod install's Codegen output, which the build needs (gone if
        // ios/build was removed).
        if (!fs.existsSync(path.join(dir, 'ios/build/generated/ios')))
            return 'no Codegen output in ios/build'
        if (!manifest.includes(`PODFILE CHECKSUM: ${podfile}`))
            return 'the Podfile changed'
        return undefined
    } catch {
        return 'not installed'
    }
}

async function iosPods(app: App) {
    const dir = appDir(app)
    if (app === 'expo' && !(await expoPrebuild('ios'))) return false
    const outdated = reactNativeChanged(dir)
        ? 'React Native changed'
        : options['pods']
          ? '--pods'
          : podsOutdated(dir)
    if (!outdated) return true
    say(`pod install (${app}: ${outdated})`)
    const log = path.join(OUT, `pods-${app}.log`)
    const podInstall = (cmd: string, args: string[]) =>
        run(cmd, args, { cwd: path.join(dir, 'ios'), log, timeout: 600 })
    // The Expo example has no Gemfile: the installed CocoaPods, as Expo
    // uses.
    const ok =
        app === 'expo'
            ? (await podInstall('pod', ['install'])).ok
            : // Minutes the first time: it compiles the gems' native
              // extensions.
              (
                  await run('bundle', ['install'], {
                      cwd: dir,
                      log,
                      timeout: 900,
                  })
              ).ok &&
              (await podInstall('bundle', ['exec', 'pod', 'install'])).ok
    if (!ok) record('FAIL', `${app} ios pod install`, `see ${rel(log)}`)
    else {
        const now = new Date()
        fs.utimesSync(path.join(dir, 'ios/Pods'), now, now)
        fs.writeFileSync(
            sourceMarker(path.join(dir, 'ios/Pods')),
            podsSource(dir),
        )
    }
    return ok
}

// Xcode's compilation cache, shared by the apps and checkouts: a clean build
// (e.g. after pod install) reuses what was compiled before. Emptied when it
// grows past 2 GB.
const COMPILATION_CACHE = path.join(
    os.homedir(),
    'Library/Caches/react-native-fast-image/compilation-cache',
)

function trimCompilationCache() {
    const kb = Number(capture('du', ['-sk', COMPILATION_CACHE])?.split(/\s/)[0])
    if (kb > 2 * 1024 * 1024) {
        fs.rmSync(COMPILATION_CACHE, { recursive: true, force: true })
    }
}

// React Native's prebuilt iOS frameworks (its core on recent versions, and
// Hermes) come in a Debug and a Release build, swapped by a build phase that
// compares the configuration with a marker file in Pods (no marker counts as
// Debug). `pod install` can leave a framework from the other configuration
// with a marker that says otherwise: after a --release run, Debug builds then
// failed to link (react-native-screens) or crashed at launch (Hermes'
// debugger). So before each build the markers say which build is on disk, read
// from a symbol only the Debug one has, and the build phase swaps when needed.
// The marker's path is the app's React Native's own (LAST_BUILD_FILENAME).
function syncPrebuiltMarkers(dir: string, log: string) {
    const pods = path.join(dir, 'ios/Pods')
    const rn = path.join(dir, 'node_modules/react-native')
    const slice = `${TV ? 'tvos' : 'ios'}-arm64_x86_64-simulator`
    const frameworks = [
        {
            script: 'scripts/replace-rncore-version.js',
            binary: `React-Core-prebuilt/React.xcframework/${slice}/React.framework/React`,
        },
        ...['hermesvm', 'hermes'].map((name) => ({
            script: 'sdks/hermes-engine/utils/replace_hermes_version.js',
            binary: `hermes-engine/destroot/Library/Frameworks/universal/${name}.xcframework/${slice}/${name}.framework/${name}`,
        })),
    ]
    for (const { script, binary } of frameworks) {
        const file = path.join(pods, binary)
        const source = path.join(rn, script)
        if (!fs.existsSync(file) || !fs.existsSync(source)) continue
        const marker = fs
            .readFileSync(source, 'utf8')
            .match(/LAST_BUILD_FILENAME\s*=\s*'([^']+)'/)?.[1]
        if (!marker) continue
        // Hermes' debugger (CDPDebugAPI) is only in the Debug builds of both:
        // read from the file's bytes (nm hung on React's framework on CI).
        const built = fs.readFileSync(file).includes('CDPDebugAPI')
            ? 'Debug'
            : 'Release'
        const markerFile = path.join(pods, marker)
        const current = fs.existsSync(markerFile)
            ? fs.readFileSync(markerFile, 'utf8')
            : 'Debug'
        fs.appendFileSync(
            log,
            `verify: ${path.basename(file)}: ${built} on disk, marker ${current}\n`,
        )
        if (current !== built) fs.writeFileSync(markerFile, built)
    }
}

async function buildIos(app: App) {
    const dir = appDir(app)
    const name = appName(app)
    const log = path.join(OUT, `ios-build-${app}.log`)
    const prepareStart = Date.now()
    trimCompilationCache()
    fs.writeFileSync(log, '')
    syncPrebuiltMarkers(dir, log)
    const buildStart = Date.now()
    const result = await run(
        'xcodebuild',
        [
            '-workspace',
            `${name}.xcworkspace`,
            '-scheme',
            name,
            '-configuration',
            CONFIGURATION,
            '-sdk',
            SIMULATOR_SDK,
            '-destination',
            `platform=${SIMULATOR_OS} Simulator,id=${iosUdid}`,
            '-derivedDataPath',
            'build',
            // Where a build's time goes, at the end of the log.
            '-showBuildTimingSummary',
            // Nothing here uses the index or debug symbol files.
            'COMPILER_INDEX_STORE_ENABLE=NO',
            'DEBUG_INFORMATION_FORMAT=dwarf',
            'COMPILATION_CACHE_ENABLE_CACHING=YES',
            `COMPILATION_CACHE_CAS_PATH=${COMPILATION_CACHE}`,
        ],
        { cwd: path.join(dir, 'ios'), log, timeout: BUILD_TIMEOUT },
    )
    if (!result.ok) {
        const error = fs
            .readFileSync(log, 'utf8')
            .split('\n')
            .find((line) => line.includes(': error:'))
        record(
            'FAIL',
            `${app} ios build`,
            result.timedOut
                ? `timed out after ${BUILD_TIMEOUT}s`
                : (error?.slice(0, 160) ?? `see ${rel(log)}`),
        )
        return false
    }
    // The React Native version it was built with (see reactNativeChanged).
    fs.writeFileSync(
        sourceMarker(path.join(dir, 'ios/build')),
        reactNativeVersion(dir),
    )
    const product = path.join(
        dir,
        `ios/build/Build/Products/${CONFIGURATION}-${SIMULATOR_SDK}/${name}.app`,
    )
    const bootStart = Date.now()
    await iosBooted
    const installStart = Date.now()
    const install = await run(
        'xcrun',
        ['simctl', 'install', iosUdid, product],
        {
            log,
            timeout: 180,
        },
    )
    if (!install.ok) {
        record(
            'FAIL',
            `${app} ios install`,
            install.timedOut ? 'timed out after 180s' : `see ${rel(log)}`,
        )
        return false
    }
    // Access to the simulator's photo library, for the photo library (ph://)
    // cases, without the permission prompt.
    capture('xcrun', [
        'simctl',
        'privacy',
        iosUdid,
        'grant',
        'photos',
        iosBundleId(app),
    ])
    addLibraryMedia()
    record(
        'PASS',
        `${app} ios build`,
        `prepare ${duration(buildStart - prepareStart)}, xcodebuild ${duration(bootStart - buildStart)}, waiting for the simulator ${duration(installStart - bootStart)}, install ${duration(Date.now() - installStart)}`,
    )
    return true
}

// A GIF in the simulator's photo library (its sample photos have none), for
// the photo library GIF case, and on tvOS a JPEG and a HEIC photo too (an
// Apple TV simulator has no sample photos): each added once, as its files
// show.
function addLibraryMedia() {
    const dcim = path.join(
        os.homedir(),
        'Library/Developer/CoreSimulator/Devices',
        iosUdid,
        'data/Media/DCIM',
    )
    const has = (dir: string, extension: string): boolean =>
        fs.existsSync(dir) &&
        fs
            .readdirSync(dir, { withFileTypes: true })
            .some((entry) =>
                entry.isDirectory()
                    ? has(path.join(dir, entry.name), extension)
                    : entry.name.toLowerCase().endsWith(extension),
            )
    const media = [
        'loop-forever.gif',
        ...(TV ? ['formats/quadrants.jpg', 'formats/quadrants.heic'] : []),
    ]
    for (const file of media) {
        if (has(dcim, path.extname(file))) continue
        capture('xcrun', [
            'simctl',
            'addmedia',
            iosUdid,
            path.join(IMAGE_SERVER, 'images', file),
        ])
    }
}

// The app's log while its cases and flows run (<app>-<platform>/app.log): the
// errors, warnings and native log lines a screenshot doesn't show. Returns a
// function that stops it.
function recordAppLog(app: App, platform: 'ios' | 'android', device: string) {
    const log = path.join(OUT, `${app}-${platform}`, 'app.log')
    fs.mkdirSync(path.dirname(log), { recursive: true })
    let args: [string, string[]]
    if (platform === 'ios') {
        args = [
            'xcrun',
            [
                'simctl',
                'spawn',
                device,
                'log',
                'stream',
                '--style',
                'compact',
                '--level',
                'info',
                // The app's own code (the app and its frameworks), and errors
                // from anything in it: Apple's frameworks log thousands of
                // lines a minute otherwise.
                '--predicate',
                `process == "${appName(app)}" AND (messageType == error OR messageType == fault OR senderImagePath CONTAINS "/${appName(app)}.app/")`,
            ],
        ]
    } else {
        // Only the app's lines (its user ID), from now on.
        const uid = capture(ADB, [
            '-s',
            device,
            'shell',
            'cmd',
            'package',
            'list',
            'packages',
            '-U',
            androidPackage(app),
        ])?.match(/uid:(\d+)/)?.[1]
        args = [
            ADB,
            [
                '-s',
                device,
                'logcat',
                '-T',
                '1',
                '-v',
                'threadtime',
                ...(uid ? [`--uid=${uid}`] : []),
                // Info and above (the codecs' debug lines are most of it).
                '*:I',
            ],
        ]
    }
    const pgid = start(...args, { log }).pid
    if (pgid === undefined) return () => {}
    groups.add(pgid)
    return () => stop(pgid)
}

async function flowsIos(app: App) {
    const startedAt = Date.now()
    const stopAppLog = recordAppLog(app, 'ios', iosUdid)
    await startIdbCompanion(iosUdid)
    await runRegression(app, 'ios', iosUdid, iosBundleId(app))
    stopIdbCompanion()
    if (options.background && app !== 'expo' && app !== 'tv')
        await runFlows(app, 'ios', iosUdid, iosBundleId(app))
    stopAppLog()
    // The banner again when the app is used by hand (see runRegression).
    capture('xcrun', [
        'simctl',
        'spawn',
        iosUdid,
        'defaults',
        'delete',
        iosBundleId(app),
        'FastImageHideDevLoadingView',
    ])
    // Stopped, as on Android: its runner would otherwise connect to a later
    // run's relay (e.g. the tvOS example's, on another simulator).
    capture('xcrun', ['simctl', 'terminate', iosUdid, iosBundleId(app)])
    const reports = path.join(os.homedir(), 'Library/Logs/DiagnosticReports')
    for (const file of fs.existsSync(reports) ? fs.readdirSync(reports) : []) {
        if (!file.startsWith(`${appName(app)}-`) || !file.endsWith('.ips'))
            continue
        const crash = path.join(reports, file)
        if (fs.statSync(crash).mtimeMs < startedAt) continue
        fs.copyFileSync(crash, path.join(OUT, file))
        record('FAIL', `${app} ios crash`, file)
    }
}

// --- Android -------------------------------------------------------------

let androidSerial = ''
// Resolves once the device has booted: an emulator boots while the apps
// build, and buildAndroid waits for it before installing.
let androidBooted: Promise<void> = Promise.resolve()
// Whether the emulator has the gRPC API without authentication (started with
// -grpc), for its screen recordings (emulatorRecordScreen).
const EMULATOR_GRPC_PORT = 8554
let emulatorGrpc = false

function ensureJava() {
    const version =
        spawnSync('java', ['-version'], { encoding: 'utf8' }).stderr ?? ''
    const major = Number(version.match(/version "(\d+)/)?.[1] ?? 0)
    if (major >= 17 && major <= 21) return
    // Prefer JDK 17 for Gradle.
    let jdk = capture('/usr/libexec/java_home', ['-v', '17'])
    const brew =
        '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home'
    if (!jdk && fs.existsSync(brew)) jdk = brew
    if (jdk) env.JAVA_HOME = jdk
}

const connectedDevice = () =>
    capture(ADB, ['devices'])
        ?.split('\n')
        .slice(1)
        .map((line) => line.split('\t'))
        .find(([, state]) => state === 'device')?.[0] ?? ''

async function androidDevice() {
    androidSerial = connectedDevice()
    if (!androidSerial) {
        const emulator = path.join(ANDROID_HOME, 'emulator/emulator')
        // An AVD of the script's own (see the iOS simulator above) when
        // there is one; the docs say how to create it.
        const avds = capture(emulator, ['-list-avds'])?.split('\n') ?? []
        const avd =
            env.ANDROID_AVD ??
            avds.find((name) => name.toLowerCase().startsWith('rnfi')) ??
            avds[0]
        if (!avd) return false
        say(`Starting emulator ${avd}`)
        // Detached, so it keeps running after this script exits.
        // -gpu host: software rendering makes the example too slow for the
        // flows (ANDROID_EMULATOR_GPU for machines without a GPU, e.g. CI).
        // -no-window: macOS throttles the emulator's rendering while its window
        // is hidden or in the background (e.g. behind the iOS Simulator), and
        // the app stalls until the window is brought forward.
        start(
            emulator,
            [
                '-avd',
                avd,
                '-no-window',
                '-gpu',
                env.ANDROID_EMULATOR_GPU ?? 'host',
                '-no-snapshot-save',
                '-no-boot-anim',
                '-grpc',
                String(EMULATOR_GRPC_PORT),
            ],
            {
                log: path.join(OUT, 'emulator.log'),
            },
        ).unref()
        // Until adb sees it; it finishes booting while the apps build
        // (androidBooted).
        const deadline = Date.now() + 180_000
        while (Date.now() < deadline) {
            androidSerial = connectedDevice()
            if (androidSerial) break
            await sleep(2000)
        }
        if (!androidSerial) return false
        emulatorGrpc = true
    } else if (
        capture('pgrep', ['-f', 'qemu-system']) &&
        !capture('pgrep', ['-f', 'qemu-system.*-no-window'])
    ) {
        console.log(
            '    Note: the emulator has a window. Keep it visible while the flows run, or quit it and let this script start one without a window.',
        )
    }
    emulatorGrpc ||= !!capture('pgrep', [
        '-f',
        `qemu-system.*-grpc ${EMULATOR_GRPC_PORT}`,
    ])
    androidBooted = (async () => {
        const deadline = Date.now() + 300_000
        while (
            Date.now() < deadline &&
            capture(ADB, [
                '-s',
                androidSerial,
                'shell',
                'getprop',
                'sys.boot_completed',
            ]) !== '1'
        )
            await sleep(2000)
        // On emulators, don't let "isn't responding" dialogs from background
        // apps cover the app under test (the runners can't see through them),
        // and close one that's already showing (e.g. the system UI's, from a
        // slow boot).
        if (androidSerial.startsWith('emulator-')) {
            capture(ADB, [
                '-s',
                androidSerial,
                'shell',
                'settings',
                'put',
                'global',
                'hide_error_dialogs',
                '1',
            ])
            capture(ADB, [
                '-s',
                androidSerial,
                'shell',
                'am',
                'broadcast',
                '-a',
                'android.intent.action.CLOSE_SYSTEM_DIALOGS',
            ])
        }
    })()
    return true
}

async function buildAndroid(app: App) {
    const dir = appDir(app)
    const log = path.join(OUT, `android-build-${app}.log`)
    if (app === 'expo' && !(await expoPrebuild('android'))) return false
    // React Native caches autolinking (the library's directory, and its
    // Codegen library from package.json's codegenConfig) here, and only works
    // it out again when the app's own files change: again after switching
    // between the source and the package, or when the library's package.json
    // changed (e.g. another branch's).
    const androidBuild = path.join(dir, 'android/build')
    const autolinkedFrom = `${SOURCE} ${packageJsonSha(dir)}`
    if (builtFrom(androidBuild) !== autolinkedFrom) {
        fs.rmSync(path.join(androidBuild, 'generated/autolinking'), {
            recursive: true,
            force: true,
        })
        fs.mkdirSync(androidBuild, { recursive: true })
        fs.writeFileSync(sourceMarker(androidBuild), autolinkedFrom)
    }
    // The library's classes as bundled for the app (both apps' builds share
    // android/build): Gradle can fail to update them after the library's
    // source changed under it (another branch, or the other app's Android
    // Gradle plugin version): "already exists, it cannot be overwritten", or
    // "Error while dexing". Rebuilt from the compiled classes in seconds,
    // instead of deleting android/build, which recompiles everything.
    for (const output of [
        'runtime_library_classes_dir',
        'runtime_library_classes_jar',
    ])
        fs.rmSync(path.join(ROOT, 'android/build/intermediates', output), {
            recursive: true,
            force: true,
        })
    // Native code (C++) for the emulator's CPU architecture only, rather than
    // all four.
    const abi = capture(ADB, [
        '-s',
        androidSerial,
        'shell',
        'getprop',
        'ro.product.cpu.abi',
    ])?.trim()
    const buildStart = Date.now()
    const result = await run(
        './gradlew',
        [
            `app:assemble${CONFIGURATION}`,
            ...(abi ? [`-PreactNativeArchitectures=${abi}`] : []),
            // React Native's bundle task only tracks the JS in the app's own
            // folder, not the library's src/, so it would keep a stale bundle.
            ...(RELEASE
                ? ['app:createBundleReleaseJsAndAssets', '--rerun']
                : []),
            '--console=plain',
            '-q',
        ],
        {
            cwd: path.join(dir, 'android'),
            log,
            timeout: BUILD_TIMEOUT,
            // The Expo example's .env, which expo run:android would load:
            // expo-constants' fingerprint task reads only the environment.
            extraEnv:
                app === 'expo'
                    ? { EXPO_SKIP_FINGERPRINT_EMBED: '1' }
                    : undefined,
        },
    )
    if (!result.ok) {
        record(
            'FAIL',
            `${app} android build`,
            result.timedOut
                ? `timed out after ${BUILD_TIMEOUT}s`
                : `see ${rel(log)}`,
        )
        return false
    }
    // Only reinstall a changed APK: installing makes Android compile the app in
    // the background, which slows the emulator for a while afterwards. Compare
    // with the APK on the emulator itself: other checkouts and sessions share
    // it, and may have installed their own build of the app since this one's.
    const apk = path.join(
        dir,
        RELEASE
            ? 'android/app/build/outputs/apk/release/app-release.apk'
            : 'android/app/build/outputs/apk/debug/app-debug.apk',
    )
    const hash = createHash('sha1').update(fs.readFileSync(apk)).digest('hex')
    const bootStart = Date.now()
    await androidBooted
    const installStart = Date.now()
    const installedApk = capture(ADB, [
        '-s',
        androidSerial,
        'shell',
        'pm',
        'path',
        androidPackage(app),
    ])
        ?.split('\n')
        .map((line) => line.trim().replace(/^package:/, ''))
        .find((line) => line.endsWith('/base.apk'))
    const installedHash =
        installedApk &&
        capture(ADB, [
            '-s',
            androidSerial,
            'shell',
            'sha1sum',
            installedApk,
        ])?.split(/\s+/)[0]
    if (installedHash !== hash) {
        const install = await run(
            ADB,
            ['-s', androidSerial, 'install', '-r', apk],
            { log, timeout: 180 },
        )
        if (!install.ok) {
            record('FAIL', `${app} android install`, `see ${rel(log)}`)
            return false
        }
    }
    capture(ADB, ['-s', androidSerial, 'reverse', 'tcp:8081', 'tcp:8081'])
    record(
        'PASS',
        `${app} android build`,
        `gradle ${duration(bootStart - buildStart)}, waiting for the emulator ${duration(installStart - bootStart)}, install ${duration(Date.now() - installStart)}`,
    )
    // Once per run (in the first shard of a sharded one).
    if (
        app === 'main' &&
        !RELEASE &&
        !FROM_PACKAGE &&
        (!SHARD || SHARD.index === 1)
    )
        await androidUnitTests(dir)
    return true
}

// The library's unit tests (android/src/test, with Robolectric), with the
// main example's Gradle project, which has just built the library.
async function androidUnitTests(dir: string) {
    const log = path.join(OUT, 'android-unit-tests.log')
    const result = await run(
        './gradlew',
        [':react-native-fast-image:testDebugUnitTest', '--console=plain', '-q'],
        { cwd: path.join(dir, 'android'), log, timeout: 600 },
    )
    // The library's android/build, where Gradle writes the reports, is
    // removed when --ref restores android/: keep a copy in the output.
    const reports = path.join(OUT, 'android-unit-tests')
    for (const sub of ['test-results', 'reports/tests']) {
        const from = path.join(ROOT, 'android/build', sub)
        if (fs.existsSync(from))
            fs.cpSync(from, path.join(reports, sub), { recursive: true })
    }
    record(
        result.ok ? 'PASS' : 'FAIL',
        'android unit tests',
        result.ok ? undefined : `see ${rel(log)} and ${rel(reports)}`,
    )
}

async function flowsAndroid(app: App) {
    const pkg = androidPackage(app)
    capture(ADB, ['-s', androidSerial, 'logcat', '-b', 'crash', '-c'])
    const stopAppLog = recordAppLog(app, 'android', androidSerial)
    await runRegression(app, 'android', androidSerial, pkg)
    if (options.background && app !== 'expo')
        await runFlows(app, 'android', androidSerial, pkg)
    stopAppLog()
    const crashes =
        capture(ADB, ['-s', androidSerial, 'logcat', '-b', 'crash', '-d']) ?? ''
    if (crashes.includes(pkg)) {
        const log = path.join(OUT, `android-crash-${app}.log`)
        fs.writeFileSync(log, crashes)
        record('FAIL', `${app} android crash`, `see ${rel(log)}`)
    }
    // The example's animated images keep the emulator busy while the app stays
    // in the foreground, which slows everything after it. Stop it.
    capture(ADB, ['-s', androidSerial, 'shell', 'am', 'force-stop', pkg])
}

// --- Run -----------------------------------------------------------------

async function jsCheck(
    name: string,
    cmd: string,
    args: string[],
    cwd: string,
    extraEnv?: Record<string, string>,
) {
    const log = path.join(OUT, `js-${name.replace(/ /g, '-')}.log`)
    const result = await run(cmd, args, { cwd, log, timeout: 300, extraEnv })
    record(
        result.ok ? 'PASS' : 'FAIL',
        name,
        result.ok ? undefined : `see ${rel(log)}`,
    )
}

// The web version is bundled by the dev server when Chrome asks for it.
const build = { ios: buildIos, android: buildAndroid, web: async () => true }
const flows = { ios: flowsIos, android: flowsAndroid, web: flowsWeb }

async function main() {
    if (RUN_JS) {
        say('JS checks')
        const example = appDir('main')
        if (
            (await ensureNodeModules(ROOT)) &&
            (await ensureNodeModules(example))
        ) {
            await jsCheck(
                'library build',
                'bun',
                ['run', '--silent', 'build:package'],
                ROOT,
            )
            await jsCheck(
                'library tests',
                'bun',
                ['run', '--silent', 'test'],
                ROOT,
                {
                    CI: 'true',
                },
            )
            await jsCheck(
                'example typecheck',
                'bun',
                ['run', '--silent', 'typecheck'],
                example,
            )
            if (
                APPS.includes('minimum') &&
                (await ensureNodeModules(appDir('minimum')))
            )
                await jsCheck(
                    'minimum example typecheck',
                    'bun',
                    ['run', '--silent', 'typecheck'],
                    appDir('minimum'),
                )
            if (
                APPS.includes('expo') &&
                (await ensureNodeModules(appDir('expo')))
            )
                await jsCheck(
                    'expo example typecheck',
                    'bun',
                    ['run', '--silent', 'typecheck'],
                    appDir('expo'),
                )
            if (TV && (await ensureNodeModules(appDir('tv'))))
                await jsCheck(
                    'tv example typecheck',
                    'bun',
                    ['run', '--silent', 'typecheck'],
                    appDir('tv'),
                )
            await jsCheck(
                'verify script typecheck',
                path.join(example, 'node_modules/.bin/tsc'),
                ['-p', 'scripts'],
                ROOT,
            )
            await jsCheck(
                'image server typecheck',
                path.join(example, 'node_modules/.bin/tsc'),
                ['-p', path.relative(ROOT, IMAGE_SERVER)],
                ROOT,
            )
            await jsCheck('lint', 'bun', ['run', '--silent', 'lint'], ROOT)
            await jsCheck(
                'format',
                'bun',
                ['run', '--silent', 'format:check'],
                ROOT,
            )
        }
    }

    if (RUN_APPS) {
        // Pick devices up front; each app's platforms then build in parallel.
        const ready: Platform[] = []
        for (const platform of PLATFORMS) {
            if (platform === 'web') {
                if (fs.existsSync(CHROME)) ready.push('web')
                else
                    record('FAIL', 'web', `no Chrome at ${CHROME} (CHROME_BIN)`)
            } else if (platform === 'ios') {
                if (iosDevice()) ready.push('ios')
                else
                    record(
                        'FAIL',
                        'ios',
                        `no ${TV ? 'Apple TV' : 'iPhone'} simulator found`,
                    )
            } else {
                ensureJava()
                if (await androidDevice()) ready.push('android')
                else record('FAIL', 'android', 'no device or emulator')
            }
        }

        if (ready.length > 0 && !(await startImageServer())) ready.length = 0
        if (ready.length > 0 && FROM_PACKAGE && !(await installPackage()))
            ready.length = 0
        const plans: { app: App; platforms: Platform[] }[] = []
        for (const app of APPS) {
            if (ready.length === 0) break
            if (!(await ensureNodeModules(appDir(app)))) continue
            // Only the Expo example has a web version.
            const own = ready.filter((p) => p !== 'web' || app === 'expo')
            const platforms =
                own.includes('ios') && !(await iosPods(app))
                    ? own.filter((p) => p !== 'ios')
                    : own
            // Not when its only platform's setup failed (e.g. pod install).
            if (platforms.length > 0) plans.push({ app, platforms })
        }
        // Every app is built before any runs, so builds don't slow the
        // devices while cases are timed. Each platform builds the apps one
        // after the other (both apps' Android builds compile the library into
        // android/build), the platforms in parallel. Metro serves one app at a
        // time (port 8081): the first app's starts now and builds its bundles
        // meanwhile. Release builds have their bundles built in.
        const startApp = async (app: App, platforms: Platform[]) => {
            if (RELEASE) return true
            if (!(await startMetro(app))) {
                record(
                    'FAIL',
                    `${app} metro`,
                    `see ${rel(path.join(OUT, `metro-${app}.log`))}`,
                )
                await stopMetro()
                return false
            }
            bundleWarm = warmBundles(app, platforms)
            return true
        }
        // The first app's Metro starts while the apps build (crawling
        // node_modules takes longer without Watchman, or on a busy machine);
        // its run waits for it.
        const first = plans[0]
        const firstStarted = first
            ? startApp(first.app, first.platforms)
            : Promise.resolve(false)
        if (plans.length > 0) {
            say(
                `Building ${plans.map(({ app, platforms }) => `${app} (${platforms.join(' ')})`).join(', ')}`,
            )
        }
        const built = new Map<App, Platform[]>()
        await Promise.all(
            ready.map(async (platform) => {
                for (const { app, platforms } of plans) {
                    if (!platforms.includes(platform)) continue
                    if (await build[platform](app)) {
                        built.set(app, [...(built.get(app) ?? []), platform])
                    }
                }
            }),
        )
        for (const { app } of plans) {
            const toRun = ready.filter((p) => built.get(app)?.includes(p))
            if (app === first?.app) {
                if (!(await firstStarted)) continue
            } else if (toRun.length === 0 || !(await startApp(app, toRun))) {
                continue
            }
            if (toRun.length > 0) {
                say(
                    `Running the regression runner and flows for ${app} (${toRun.join(' ')})`,
                )
                await Promise.all(toRun.map((p) => flows[p](app)))
            }
            await stopMetro()
        }
    }

    const lines = results.map(
        (r) =>
            `${r.status.padEnd(4)}  ${r.name}${
                r.detail ? `  (${r.detail})` : ''
            }`,
    )
    fs.writeFileSync(path.join(OUT, 'results.txt'), lines.join('\n') + '\n')
    console.log(`\nSummary${REF ? ` (library from ${REF})` : ''}:`)
    for (const line of lines) console.log(`  ${line}`)
    console.log(`Output: ${rel(OUT)}`)
    if (!APPS.includes('tv')) {
        const stale = tvReferencesBehind()
        if (stale.length > 0) {
            console.log(
                `The main or minimum references of ${stale.join(', ')} changed on this branch, but not tvOS's (which this run didn't check): run with --app tv.`,
            )
        }
    }
    if (
        results.some(
            (r) =>
                r.status === 'FAIL' &&
                / android (touch|regression|flows)$/.test(r.name),
        )
    ) {
        console.log(
            "If Android flows fail on screens that look fine, the emulator is probably overloaded: use a plain AOSP image (not Google APIs) with 4 GB+ RAM and hardware graphics (hw.ramSize, hw.gpu.mode = host in the AVD's config.ini).",
        )
    }
    process.exitCode = results.some((r) => r.status === 'FAIL') ? 1 : 0
}

// Groups whose main or minimum app reference screenshot changed on this branch
// (against origin/main, or uncommitted) while the tvOS app's didn't. The tvOS
// app runs the same cases, but only with --app tv, so its references can be
// left behind (e.g. a case moved to another group).
function tvReferencesBehind() {
    const changed = (args: string[]) =>
        capture('git', ['-C', ROOT, ...args])
            ?.split('\n')
            .filter(Boolean) ?? []
    const base = capture('git', [
        '-C',
        ROOT,
        'merge-base',
        'HEAD',
        'origin/main',
    ])
    if (!base) return []
    const files = [
        ...changed(['diff', '--name-only', base.trim(), '--', 'screenshots']),
        ...changed(['ls-files', '--others', '--', 'screenshots']),
    ]
    const groupsChanged = (dirs: RegExp) =>
        new Set(
            files
                .map((f) => /^screenshots\/([^/]+)\/(.+)\.png$/.exec(f))
                .filter((m) => m && dirs.test(m[1]))
                .map((m) => m![2]),
        )
    const tv = groupsChanged(/^tv-ios$/)
    return [...groupsChanged(/^(main|minimum)-(ios|android)$/)].filter(
        (group) =>
            !tv.has(group) &&
            fs.existsSync(path.join(SCREENSHOTS, 'tv-ios', `${group}.png`)),
    )
}

await main()
// Exit rather than wait for the event loop to empty: the image server is still
// running, so it wouldn't. Exiting runs cleanup, which stops it.
process.exit()
