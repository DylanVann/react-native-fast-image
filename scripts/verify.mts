// Checks the library and runs both example apps on iOS and Android. Run it with
// Node 24 (or 22.18+), which runs TypeScript directly:
//
//   node scripts/verify.mts [options]

import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { compare } from 'odiff-bin'

const HELP = `Checks the library and runs both example apps on iOS and Android.

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
  --app main|legacy|expo
                      Only this example app (default: main and legacy). The
                      Expo example (ReactNativeFastImageExampleExpo) runs only
                      when asked for: a few smoke cases on iOS and Android
                      (its native projects made by \`expo prebuild\`, with
                      FastImage's config plugin) and on the web (its web
                      version in headless Chrome, statuses only, no
                      screenshots).
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
  --ref <git-ref>     Test the library code (src/, ios/, android/) from this ref
                      instead of the working tree, e.g. \`--ref main\` for a
                      "before" run. The working tree is restored afterwards.
  --background        Also run the flows tagged \`background\`
                      (maestro/background.yaml), which send the app to the
                      background for 20 s. Slow, so they're skipped by
                      default; run them for changes to loading or lifecycle.
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
                  show other apps; created on first use with the device type
                  and runtime of the newest iPhone simulator).
  ANDROID_AVD     Emulator to start if no device is connected (default: the
                  first AVD named rnfi*, else the first AVD). Use a plain
                  AOSP image ("default", no Google apps) with 4 GB+ RAM; it's
                  started with -gpu host and no window.
  VERIFY_FLOWS_TIMEOUT, VERIFY_BUILD_TIMEOUT
                  Time limits in seconds for each app and platform's flows
                  (default 240, plus 120 with --background) and builds
                  (default 900).
  MAESTRO_RUNNER_BIN
                  maestro-runner binary (default: the dev dependency).
  MAESTRO_RUNNER_ANDROID_DRIVER
                  maestro-runner's Android driver (default devicelab).

Needs Xcode with CocoaPods via Bundler, JDK 17+, and the Android SDK with an
emulator. Output (logs, screenshots, crash reports, recordings) goes to
verify-output/<timestamp>/.`

type App = 'main' | 'legacy' | 'expo'
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
    options.app !== 'legacy' &&
    options.app !== 'expo'
) {
    console.error(`Unknown app: ${options.app} (use main, legacy or expo)`)
    process.exit(2)
}
// The Expo example only runs when asked for (--app expo).
const APPS: App[] = options.app ? [options.app as App] : ['main', 'legacy']
if (options.web && !APPS.includes('expo')) {
    console.error('--web is for the Expo example: use it with --app expo')
    process.exit(2)
}
const PLATFORMS: Platform[] = options.ios
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

const say = (message: string) => console.log(`==> ${message}`)
const rel = (file: string) => path.relative(ROOT, file)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Result = { status: 'PASS' | 'FAIL'; name: string; detail?: string }
const results: Result[] = []
function record(status: Result['status'], name: string, detail?: string) {
    results.push({ status, name, detail })
    const line = `${status.padEnd(4)}  ${name}${detail ? `  (${detail})` : ''}`
    // Written as it goes, so a run that's stopped early keeps its results.
    fs.appendFileSync(path.join(OUT, 'results.txt'), line + '\n')
    console.log(`    ${status}: ${name}${detail ? ` (${detail})` : ''}`)
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
const LIB_PATHS = ['src', 'ios', 'android']
let backup = ''
function restoreLibrary() {
    if (!backup) return
    say("Restoring the working tree's library code")
    for (const p of LIB_PATHS) {
        fs.rmSync(path.join(ROOT, p), { recursive: true, force: true })
        fs.cpSync(path.join(backup, p), path.join(ROOT, p), { recursive: true })
    }
    execFileSync('git', ['-C', ROOT, 'reset', '-q', '--', ...LIB_PATHS])
    fs.rmSync(backup, { recursive: true, force: true })
    backup = ''
}

let metro: number | undefined
// The bundles Metro was asked for while the current app built (warmBundles).
let bundleWarm: Promise<void> = Promise.resolve()
let cleanedUp = false
function cleanup() {
    if (cleanedUp) return
    cleanedUp = true
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
            legacy: 'ReactNativeFastImageExampleLegacy',
            expo: 'ReactNativeFastImageExampleExpo',
        }[app],
    )
const appName = (app: App) => path.basename(appDir(app))
const iosBundleId = (app: App) => `org.reactjs.native.example.${appName(app)}`
// com.reactnativefastimageexample, …legacy and …expo.
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
    for (let i = 0; i < 60; i++) {
        try {
            const response = await fetch('http://localhost:8081/status')
            if ((await response.text()).includes('running')) return true
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
    for (let i = 0; i < 20; i++) {
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
    if (!(await run('bun', ['run', 'build'], { log, timeout: 120 })).ok) {
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
const HELLO_TIMEOUT = 90_000
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

async function compareScreenshot(
    app: App,
    platform: Platform,
    name: string,
    file: string,
    masks: PixelRect[],
): Promise<{
    result: 'match' | 'seeded' | 'none' | 'differs'
    detail?: string
}> {
    const dir = path.join(SCREENSHOTS, `${app}-${platform}`)
    const reference = path.join(dir, `${name}.png`)
    if (!fs.existsSync(reference) || UPDATE_SCREENSHOTS) {
        // Not from a --ref run: it shows the library as it was.
        if (REF) return { result: 'none' }
        fs.mkdirSync(dir, { recursive: true })
        fs.copyFileSync(file, reference)
        return { result: 'seeded' }
    }
    const diffFile = file.replace(/\.png$/, '-diff.png')
    const ignoreRegions = masks
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
// palette? }; the screen is recorded (simctl io recordVideo, adb shell
// screenrecord), { type: 'recording', group, name } tells the case to make
// the change, and the case sends { type: 'sampleDone', group, name } once
// it's done (durationMs is the most it's given). A group's samples share a
// recording, which starts with the first and stops once they're all done, so
// they can run at the same time; each is checked in its own part of it, from
// the last frame before its change. Each frame's color in the middle of the
// area is matched
// to the nearest of `expect` and `palette` (hex colors), or to none if it's
// far from all of them or about as near to two (e.g. halfway through a fade
// that doesn't list a color for it). Colors are compared perceptually (CIE
// Lab), with some tolerance for video compression. Then repeats are
// collapsed, and the sample passes if what's left is `expect`,
// in order. How many frames each color lasted doesn't matter. `palette`
// lists colors that mustn't appear (so they're matched rather than left
// out). The result goes back as { type: 'sampled', group, name, ok, seen,
// detail? }, which the case shows as its status. The recording is kept in
// verify-output/.
type Rgb = [number, number, number]
// ΔE (CIE76): a frame is a color if it's within this of it, and at most
// SAMPLE_MAX_RATIO times as far from it as from the next nearest color.
const SAMPLE_MAX_DISTANCE = 40
const SAMPLE_MAX_RATIO = 0.6
// A sample's recording goes on this long after the case is done, for the
// frames that were still being drawn, and the case makes its change at least
// this long after it asked.
const SAMPLE_TAIL_MS = 500
const SAMPLE_LEAD_MS = 500

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
// being recorded (false if the recorder didn't start); `stop` ends the
// recording and resolves once the file is complete.
function recordScreen(platform: Platform, device: string, file: string) {
    const args =
        platform === 'ios'
            ? [
                  'simctl',
                  'io',
                  device,
                  'recordVideo',
                  '--codec=h264',
                  '--force',
                  file,
              ]
            : [
                  '-s',
                  device,
                  'shell',
                  'screenrecord',
                  '--verbose',
                  '--time-limit',
                  '60',
                  '/sdcard/fast-image-sample.mp4',
              ]
    // Not the previous sample's, if this one isn't saved.
    if (platform === 'android') {
        capture(ADB, [
            '-s',
            device,
            'shell',
            'rm',
            '-f',
            '/sdcard/fast-image-sample.mp4',
        ])
    }
    const child = spawn(platform === 'ios' ? 'xcrun' : ADB, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
    })
    const exited = new Promise<void>((resolve) =>
        child.on('close', () => resolve()),
    )
    // simctl says "Recording started"; screenrecord --verbose says which
    // encoder it configured, just before its first frame.
    const started = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 10_000)
        const look = (data: Buffer) => {
            if (/Recording started|Configuring recorder/.test(String(data))) {
                clearTimeout(timer)
                // screenrecord's first frame follows its configuration.
                setTimeout(() => resolve(true), platform === 'ios' ? 0 : 300)
            }
        }
        child.stdout?.on('data', look)
        child.stderr?.on('data', look)
        exited.then(() => resolve(false))
    })
    const stop = async () => {
        if (platform === 'ios') {
            child.kill('SIGINT')
        } else {
            // SIGINT makes screenrecord finish the file.
            capture(ADB, ['-s', device, 'shell', 'pkill', '-2', 'screenrecord'])
        }
        await Promise.race([exited, new Promise((r) => setTimeout(r, 15_000))])
        child.kill('SIGKILL')
        if (platform === 'android') {
            capture(
                ADB,
                ['-s', device, 'pull', '/sdcard/fast-image-sample.mp4', file],
                { timeout: 60 },
            )
        }
        return fs.existsSync(file)
    }
    return { started, stop }
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
): Rgb[] {
    const first = frames.findLastIndex((frame) => frame.time <= start)
    return frames
        .slice(Math.max(0, first))
        .filter((frame) => frame.time <= end)
        .map((frame) => frame.color)
}

// The colors seen (see above) and whether they're `expect`.
function matchSample(frames: Rgb[], expect: string[], palette: string[]) {
    const colors = [...new Set([...expect, ...palette])].map((hex) => ({
        hex,
        lab: toLab(hexToRgb(hex)),
    }))
    const seen: string[] = []
    for (const frame of frames) {
        const lab = toLab(frame)
        const [best, next] = colors
            .map(({ hex, lab: c }) => ({
                hex,
                distance: Math.hypot(
                    lab[0] - c[0],
                    lab[1] - c[1],
                    lab[2] - c[2],
                ),
            }))
            .sort((a, b) => a.distance - b.distance)
        const clear =
            best !== undefined &&
            best.distance <= SAMPLE_MAX_DISTANCE &&
            (!next || best.distance <= SAMPLE_MAX_RATIO * next.distance)
        if (clear && seen.at(-1) !== best.hex) seen.push(best.hex)
    }
    const ok =
        seen.length === expect.length &&
        seen.every((color, i) => color === expect[i])
    return { ok, seen }
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
    let socketError: string | undefined
    // From hello.
    let groups: string[] = []
    let scale = 1
    let windowWidth = 0
    let windowHeight = 0
    const failures: string[] = []
    const seeded: string[] = []
    const noReference: string[] = []
    // A screenshot of the group on screen (index), once it's all OK (or timed
    // out), compared with its reference. Comparisons (and video samples) run
    // in the background; `shots` is awaited at the end.
    const shots: Promise<void>[] = []
    // masks: the areas the app measured just before (dp), to leave out.
    const takeShot = (index: number, masksDp: unknown) => {
        // The web version's cases are checked by their statuses only.
        if (platform === 'web') return Promise.resolve()
        const name = groups[index]
        const file = path.join(
            dir,
            `${String(index + 1).padStart(2, '0')}-${name}.png`,
        )
        screenshot(platform, device, file)
        const masks = (
            Array.isArray(masksDp) ? (masksDp as PixelRect[]) : []
        ).map((m) => ({
            x: m.x * scale,
            y: m.y * scale,
            width: m.width * scale,
            height: m.height * scale,
        }))
        // The band above the runner's content (its top padding): the status
        // bar (on iOS even with the override: a "back to the previous app"
        // breadcrumb) and React Native's dev banner ("Loading from Metro…",
        // "Refreshing…"), which comes and goes.
        masks.push({
            x: 0,
            y: 0,
            width: windowWidth * scale,
            height: 140 * scale,
        })
        // On iOS, the home indicator at the bottom, which is there or not
        // depending on how long ago the app was opened.
        if (platform === 'ios' && windowHeight > 0) {
            masks.push({
                x: 0,
                y: (windowHeight - 34) * scale,
                width: windowWidth * scale,
                height: 34 * scale,
            })
        }
        const shot = compareScreenshot(app, platform, name, file, masks).then(
            ({ result, detail }) => {
                logLine(
                    `screenshot ${name}: ${result}${detail ? ` (${detail})` : ''}${
                        masks.length > 0 ? `, ${masks.length} masked` : ''
                    }`,
                )
                if (result === 'seeded') seeded.push(name)
                else if (result === 'none') noReference.push(name)
                else if (result === 'differs')
                    failures.push(`${name}: ${detail}`)
            },
        )
        shots.push(shot)
        return shot
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
        // When the recorder was launched (wall time), undefined if it didn't
        // start. Its first frame is at most a few hundred ms later (simctl
        // only says "Recording started" about a second after that).
        started: Promise<number | undefined>
        stop: Promise<() => Promise<boolean>>
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
            let launchedAt = 0
            const recording = stopped.then(() => {
                launchedAt = Date.now()
                return recordScreen(platform, device, file)
            })
            session = {
                index,
                file,
                started: recording
                    .then((r) => r.started)
                    .then((ok) => (ok ? launchedAt : undefined)),
                stop: recording.then((r) => r.stop),
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
            sample.start = t0 === undefined ? 0 : Math.max(0, requested - t0)
            // Some of the video before the change, in case the first frame
            // came a little after the launch.
            const lead = requested + SAMPLE_LEAD_MS - Date.now()
            if (lead > 0) await new Promise((r) => setTimeout(r, lead))
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
            if (t0 === undefined) error = "the recording didn't start"
            for (const sample of current.samples) {
                const { message } = sample
                const name = String(message.name)
                // Always answers, so the case doesn't wait forever.
                let result: { ok: boolean; seen: string[]; detail?: string }
                try {
                    if (error) throw new Error(error)
                    if (!saved) throw new Error('no recording was saved')
                    const frames = frameColors(
                        current.file,
                        message.area as PixelRect,
                        windowWidth,
                    )
                    result = matchSample(
                        framesBetween(
                            frames,
                            sample.start / 1000,
                            ((sample.end ?? 0) + SAMPLE_TAIL_MS) / 1000,
                        ),
                        (message.expect as string[]) ?? [],
                        (message.palette as string[]) ?? [],
                    )
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
        `ws://127.0.0.1:${IMAGE_SERVER_PORT}/regression?role=controller&platform=${platform}`,
    )
    ws.onopen = notify
    // The group on screen. If the app starts again (maestro-runner's iOS
    // driver relaunches it for the touch group), show that group again.
    let showing: number | undefined
    ws.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as RunnerMessage
        logLine(`<- ${JSON.stringify(message)}`)
        if (message.type === 'app') appConnected = message.connected === true
        else messages.push(message)
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

    if (
        !(await waitFor(
            () => (ws.readyState === WebSocket.OPEN ? true : undefined),
            5000,
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
        capture('xcrun', ['simctl', 'launch', device, appId], { timeout: 60 })
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

    const hello = await waitFor(
        () => messages.find((m) => m.type === 'hello'),
        HELLO_TIMEOUT,
    )
    if (!hello) {
        fail(
            socketError ??
                `the app didn't connect within ${HELLO_TIMEOUT / 1000}s`,
        )
        return
    }
    groups = hello.groups as string[]
    scale = Number(hello.scale) || 1
    windowWidth = Number((hello.window as { width?: number })?.width) || 0
    windowHeight = Number((hello.window as { height?: number })?.height) || 0
    const timings: string[] = []
    let measureRequests = 0
    const statuses: Record<string, Record<string, string>> = {}
    const statusOf = (index: number, id: string) =>
        messages.findLast(
            (m) => m.type === 'status' && m.group === index && m.id === id,
        )?.status as string | undefined
    for (let index = 0; index < groups.length; index++) {
        const group = groups[index]
        showing = index
        const groupStart = Date.now()
        const shown = await waitFor(
            () => messages.find((m) => m.type === 'group' && m.index === index),
            GROUP_TIMEOUT,
        )
        if (!shown) {
            failures.push(
                `${group}: not shown (${socketError ?? (appConnected ? 'timed out' : 'the app went away')})`,
            )
            break
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
                cases.every((id) => statusOf(index, id) === 'OK')
                    ? true
                    : appConnected && !socketError
                      ? undefined
                      : false,
            GROUP_TIMEOUT - (Date.now() - waitStart),
        )
        statuses[group] = Object.fromEntries(
            cases.map((id) => [id, statusOf(index, id) ?? 'no status']),
        )
        if (result === false) {
            failures.push(`${group}: the app went away`)
            break
        }
        if (!result) {
            for (const id of cases) {
                const status = statusOf(index, id)
                if (status !== 'OK')
                    failures.push(`${id}: ${status ?? 'no status'}`)
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
        if (!measured) failures.push(`${group}: the app didn't send its masks`)
        takeShot(index, measured?.masks)
        timings.push(
            `${group} ${((Date.now() - groupStart) / 1000).toFixed(1)}s`,
        )
        send({ type: 'next' })
    }
    await waitFor(() => messages.find((m) => m.type === 'done'), 5000)
    ws.close()
    await Promise.all(shots)
    const total = ((Date.now() - startedAt) / 1000).toFixed(1)
    fs.writeFileSync(
        path.join(dir, 'results.json'),
        JSON.stringify(
            { hello, statuses, failures, seeded, noReference, timings },
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
            `${groups.length} groups in ${total}s${seededNote}`,
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
    // The background flow waits 20 s with the app away, which takes about a
    // minute on iOS (maestro-runner polls slowly on the home screen).
    const timeout = FLOWS_TIMEOUT + (options.background ? 120 : 0)
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

// The flows run on a simulator of their own by default, so screenshots and
// recordings don't show other apps installed on a shared simulator. It's
// created on first use, like the emulator is started when none is running.
const IOS_SIMULATOR = env.IOS_SIMULATOR ?? 'RNFI iPhone'

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
        (runtime.match(/iOS-(\d+)-(\d+)/) ?? []).slice(1).map(Number)
    const devices = Object.entries(
        JSON.parse(list).devices as Record<string, Device[]>,
    )
        .filter(([runtime]) => runtime.includes('iOS'))
        // Newest iOS first.
        .sort(([a], [b]) => {
            const [am = 0, an = 0] = version(a)
            const [bm = 0, bn = 0] = version(b)
            return bm - am || bn - an
        })
        .flatMap(([runtime, list]) => list.map((d) => ({ ...d, runtime })))
        .filter((d) => d.isAvailable)
    let pick = devices.find((d) => d.name === IOS_SIMULATOR)
    if (!pick && !env.IOS_SIMULATOR) {
        // Create it with the newest iPhone's device type and runtime.
        const template = devices.find((d) => d.name.startsWith('iPhone'))
        if (!template) return false
        say(`Creating simulator "${IOS_SIMULATOR}" (${template.name})`)
        const udid = capture('xcrun', [
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
    capture('xcrun', ['simctl', 'boot', iosUdid])
    capture('xcrun', ['simctl', 'bootstatus', iosUdid, '-b'], { timeout: 180 })
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

// Pods need reinstalling after node_modules is: on React Native 0.73,
// `pod install` also generates files inside node_modules/react-native. And
// after the Podfile changed (e.g. another branch's): the installed Pods record
// the Podfile's SHA-1 they were installed for.
function podsCurrent(dir: string) {
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
        return (
            pods >= rn.mtimeMs &&
            builtFrom(path.join(dir, 'ios/Pods')) === SOURCE &&
            manifest.includes(`PODFILE CHECKSUM: ${podfile}`)
        )
    } catch {
        return false
    }
}

async function iosPods(app: App) {
    const dir = appDir(app)
    if (app === 'expo' && !(await expoPrebuild('ios'))) return false
    if (!options['pods'] && podsCurrent(dir)) return true
    say(`pod install (${app})`)
    const log = path.join(OUT, `pods-${app}.log`)
    const podInstall = (cmd: string, args: string[]) =>
        run(cmd, args, { cwd: path.join(dir, 'ios'), log, timeout: 600 })
    // The Expo example has no Gemfile: the installed CocoaPods, as Expo
    // uses.
    const ok =
        app === 'expo'
            ? (await podInstall('pod', ['install'])).ok
            : (
                  await run('bundle', ['install'], {
                      cwd: dir,
                      log,
                      timeout: 300,
                  })
              ).ok &&
              (await podInstall('bundle', ['exec', 'pod', 'install'])).ok
    if (!ok) record('FAIL', `${app} ios pod install`, `see ${rel(log)}`)
    else {
        const now = new Date()
        fs.utimesSync(path.join(dir, 'ios/Pods'), now, now)
        fs.writeFileSync(sourceMarker(path.join(dir, 'ios/Pods')), SOURCE)
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

async function buildIos(app: App) {
    const dir = appDir(app)
    const name = appName(app)
    const log = path.join(OUT, `ios-build-${app}.log`)
    trimCompilationCache()
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
            'iphonesimulator',
            '-destination',
            `platform=iOS Simulator,id=${iosUdid}`,
            '-derivedDataPath',
            'build',
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
    const product = path.join(
        dir,
        `ios/build/Build/Products/${CONFIGURATION}-iphonesimulator/${name}.app`,
    )
    if (
        capture('xcrun', ['simctl', 'install', iosUdid, product], {
            timeout: 120,
        }) === undefined
    ) {
        record('FAIL', `${app} ios install`)
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
    addLibraryGif()
    record('PASS', `${app} ios build`)
    return true
}

// A GIF in the simulator's photo library (its sample photos have none), for
// the photo library GIF case: added once, as its files show.
function addLibraryGif() {
    const dcim = path.join(
        os.homedir(),
        'Library/Developer/CoreSimulator/Devices',
        iosUdid,
        'data/Media/DCIM',
    )
    const hasGif = (dir: string): boolean =>
        fs.existsSync(dir) &&
        fs
            .readdirSync(dir, { withFileTypes: true })
            .some((entry) =>
                entry.isDirectory()
                    ? hasGif(path.join(dir, entry.name))
                    : entry.name.toLowerCase().endsWith('.gif'),
            )
    if (hasGif(dcim)) return
    capture('xcrun', [
        'simctl',
        'addmedia',
        iosUdid,
        path.join(IMAGE_SERVER, 'images/loop-forever.gif'),
    ])
}

async function flowsIos(app: App) {
    const startedAt = Date.now()
    await runRegression(app, 'ios', iosUdid, iosBundleId(app))
    if (options.background && app !== 'expo')
        await runFlows(app, 'ios', iosUdid, iosBundleId(app))
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
        // -gpu host: software rendering makes the example too slow for the flows.
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
                'host',
                '-no-snapshot-save',
                '-no-boot-anim',
            ],
            {
                log: path.join(OUT, 'emulator.log'),
            },
        ).unref()
        const deadline = Date.now() + 180_000
        while (Date.now() < deadline) {
            androidSerial = connectedDevice()
            if (
                androidSerial &&
                capture(ADB, [
                    '-s',
                    androidSerial,
                    'shell',
                    'getprop',
                    'sys.boot_completed',
                ]) === '1'
            )
                break
            await sleep(2000)
        }
        if (!androidSerial) return false
    } else if (
        capture('pgrep', ['-f', 'qemu-system']) &&
        !capture('pgrep', ['-f', 'qemu-system.*-no-window'])
    ) {
        console.log(
            '    Note: the emulator has a window. Keep it visible while the flows run, or quit it and let this script start one without a window.',
        )
    }
    // On emulators, don't let "isn't responding" dialogs from background apps
    // cover the app under test (the runners can't see through them).
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
    }
    return true
}

async function buildAndroid(app: App) {
    const dir = appDir(app)
    const log = path.join(OUT, `android-build-${app}.log`)
    if (app === 'expo' && !(await expoPrebuild('android'))) return false
    // React Native 0.87 caches autolinking (the library's directory) here;
    // 0.73 works it out on every build.
    const androidBuild = path.join(dir, 'android/build')
    if (builtFrom(androidBuild) !== SOURCE) {
        fs.rmSync(path.join(androidBuild, 'generated/autolinking'), {
            recursive: true,
            force: true,
        })
        fs.mkdirSync(androidBuild, { recursive: true })
        fs.writeFileSync(sourceMarker(androidBuild), SOURCE)
    }
    // Native code (C++) for the emulator's CPU architecture only, rather than
    // all four.
    const abi = capture(ADB, [
        '-s',
        androidSerial,
        'shell',
        'getprop',
        'ro.product.cpu.abi',
    ])?.trim()
    const result = await run(
        './gradlew',
        [
            `app:assemble${CONFIGURATION}`,
            ...(abi ? [`-PreactNativeArchitectures=${abi}`] : []),
            // React Native's bundle task only tracks the JS in the app's own
            // folder, not the library's src/ or (for the legacy app) the main
            // example's, so it would keep a stale bundle.
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
    record('PASS', `${app} android build`)
    return true
}

async function flowsAndroid(app: App) {
    const pkg = androidPackage(app)
    capture(ADB, ['-s', androidSerial, 'logcat', '-b', 'crash', '-c'])
    await runRegression(app, 'android', androidSerial, pkg)
    if (options.background && app !== 'expo')
        await runFlows(app, 'android', androidSerial, pkg)
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
                ['run', '--silent', 'build'],
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
                APPS.includes('expo') &&
                (await ensureNodeModules(appDir('expo')))
            )
                await jsCheck(
                    'expo example typecheck',
                    'bun',
                    ['run', '--silent', 'typecheck'],
                    appDir('expo'),
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
                else record('FAIL', 'ios', 'no iPhone simulator found')
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
            plans.push({ app, platforms })
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
        const first = plans[0]
        const firstStarted = first
            ? await startApp(first.app, first.platforms)
            : false
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
                if (!firstStarted) continue
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

await main()
// Exit rather than wait for the event loop to empty: the image server is still
// running, so it wouldn't. Exiting runs cleanup, which stops it.
process.exit()
