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

const HELP = `Checks the library and runs both example apps on iOS and Android.

  node scripts/verify.mts [options]

Steps:
  1. JS: build, tests, typechecks, lint (oxlint) and formatting (oxfmt).
  2. For each example app: build for iOS and Android in parallel, start the
     packager, and run the Maestro flows in maestro/ with maestro-runner on
     both platforms at once. A flow failure or a crash fails the run.

Options:
  --app main|legacy   Only this example app (default: both).
  --ios, --android    Only this platform (default: both).
  --js-only           Only the JS checks.
  --no-js             Skip the JS checks.
  --pods              Run \`pod install\` even if Pods are already installed.
  --ref <git-ref>     Test the library code (src/, ios/, android/) from this ref
                      instead of the working tree, e.g. \`--ref main\` for a
                      "before" run. The working tree is restored afterwards.

Environment:
  IOS_SIMULATOR   Simulator name to use (default: a booted iPhone, else the
                  first available iPhone).
  ANDROID_AVD     Emulator to start if no device is connected (default: the
                  first AVD). Use a plain AOSP image ("default", no Google
                  apps) with 4 GB+ RAM; it's started with -gpu host and no
                  window.
  VERIFY_FLOWS_TIMEOUT, VERIFY_BUILD_TIMEOUT
                  Time limits in seconds for each app and platform's flows
                  (default 240) and builds (default 900).
  MAESTRO_RUNNER_BIN
                  maestro-runner binary (default: the dev dependency).
  MAESTRO_RUNNER_ANDROID_DRIVER
                  maestro-runner's Android driver (default devicelab).

Needs Xcode with CocoaPods via Bundler, JDK 17+, and the Android SDK with an
emulator. Output (logs, screenshots, crash reports) goes to
verify-output/<timestamp>/.`

type App = 'main' | 'legacy'
type Platform = 'ios' | 'android'

const ROOT = path.resolve(import.meta.dirname, '..')

// --- Options -------------------------------------------------------------

function parseOptions() {
    try {
        return parseArgs({
            options: {
                app: { type: 'string' },
                ios: { type: 'boolean', default: false },
                android: { type: 'boolean', default: false },
                'js-only': { type: 'boolean', default: false },
                'no-js': { type: 'boolean', default: false },
                pods: { type: 'boolean', default: false },
                ref: { type: 'string' },
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
    options.app !== 'legacy'
) {
    console.error(`Unknown app: ${options.app} (use main or legacy)`)
    process.exit(2)
}
const APPS: App[] = options.app ? [options.app as App] : ['main', 'legacy']
const PLATFORMS: Platform[] = options.ios
    ? ['ios']
    : options.android
      ? ['android']
      : ['ios', 'android']
const RUN_JS = !options['no-js']
const RUN_APPS = !options['js-only']
const REF = options.ref

const env = process.env
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

if (RUN_APPS && portInUse(8081)) {
    console.error(
        'Port 8081 is in use. Stop your packager before running this script.',
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
        app === 'main'
            ? 'ReactNativeFastImageExample'
            : 'ReactNativeFastImageExampleLegacy',
    )
const appName = (app: App) => path.basename(appDir(app))
const iosBundleId = (app: App) => `org.reactjs.native.example.${appName(app)}`
const androidPackage = (app: App) =>
    app === 'main'
        ? 'com.reactnativefastimageexample'
        : 'com.reactnativefastimageexamplelegacy'

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

async function startMetro(app: App) {
    say(`Starting Metro for ${app}`)
    metro = start('bunx', ['react-native', 'start', '--port', '8081'], {
        cwd: appDir(app),
        log: path.join(OUT, `metro-${app}.log`),
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

async function stopMetro() {
    if (metro === undefined) return
    const pgid = metro
    killGroup(pgid)
    metro = undefined
    // The next app's Metro needs the port.
    for (let i = 0; i < 20 && portInUse(8081); i++) await sleep(500)
    if (!groupAlive(pgid)) groups.delete(pgid)
}

// --- Flows ---------------------------------------------------------------

// Runs every flow in maestro/ in one maestro-runner call (one driver session),
// then reads each flow's result from the report. Screenshots go to the
// report's assets folder.
async function runFlows(
    app: App,
    platform: Platform,
    device: string,
    appId: string,
) {
    const dir = path.join(OUT, `${app}-${platform}`)
    fs.mkdirSync(dir, { recursive: true })
    const timeout = FLOWS_TIMEOUT
    const log = path.join(dir, 'flows.log')
    // The Android driver usually starts in seconds, but can take longer right
    // after an app install while Android compiles it.
    const driver =
        platform === 'android'
            ? [
                  '--driver',
                  env.MAESTRO_RUNNER_ANDROID_DRIVER ?? 'devicelab',
                  '--driver-start-timeout',
                  '90',
              ]
            : []
    const result = await run(
        MAESTRO_RUNNER,
        [
            '--platform',
            platform,
            '--device',
            device,
            ...driver,
            'test',
            '-e',
            `APP_ID=${appId}`,
            '--output',
            path.join(dir, 'report'),
            '--flatten',
            path.join(ROOT, 'maestro'),
        ],
        {
            cwd: dir,
            log,
            timeout,
            // maestro-runner builds WebDriverAgent for iOS; see the xcconfig.
            extraEnv: {
                XCODE_XCCONFIG_FILE:
                    env.XCODE_XCCONFIG_FILE ??
                    path.join(ROOT, 'scripts/maestro-runner-wda.xcconfig'),
            },
        },
    )
    let flows: { name: string; status: string }[] = []
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
    }
}

// --- iOS -----------------------------------------------------------------

let iosUdid = ''

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
        state: string
        isAvailable: boolean
    }
    const devices = Object.entries(
        JSON.parse(list).devices as Record<string, Device[]>,
    )
        .filter(([runtime]) => runtime.includes('iOS'))
        .flatMap(([, list]) => list)
        .filter((d) => d.isAvailable && d.name.startsWith('iPhone'))
    const pick = env.IOS_SIMULATOR
        ? devices.find((d) => d.name === env.IOS_SIMULATOR)
        : (devices.find((d) => d.state === 'Booted') ?? devices[0])
    if (!pick) return false
    iosUdid = pick.udid
    capture('xcrun', ['simctl', 'boot', iosUdid])
    capture('xcrun', ['simctl', 'bootstatus', iosUdid, '-b'], { timeout: 180 })
    return true
}

// Pods need reinstalling after node_modules is: on React Native 0.73,
// `pod install` also generates files inside node_modules/react-native.
function podsCurrent(dir: string) {
    try {
        const pods = fs.statSync(path.join(dir, 'ios/Pods')).mtimeMs
        const rn = fs.statSync(path.join(dir, 'node_modules/react-native'))
        return pods >= rn.mtimeMs
    } catch {
        return false
    }
}

async function iosPods(app: App) {
    const dir = appDir(app)
    if (!options['pods'] && podsCurrent(dir)) return true
    say(`pod install (${app})`)
    const log = path.join(OUT, `pods-${app}.log`)
    const ok =
        (await run('bundle', ['install'], { cwd: dir, log, timeout: 300 }))
            .ok &&
        (
            await run('bundle', ['exec', 'pod', 'install'], {
                cwd: path.join(dir, 'ios'),
                log,
                timeout: 600,
            })
        ).ok
    if (!ok) record('FAIL', `${app} ios pod install`, `see ${rel(log)}`)
    else {
        const now = new Date()
        fs.utimesSync(path.join(dir, 'ios/Pods'), now, now)
    }
    return ok
}

async function buildIos(app: App) {
    const dir = appDir(app)
    const name = appName(app)
    const log = path.join(OUT, `ios-build-${app}.log`)
    const result = await run(
        'xcodebuild',
        [
            '-workspace',
            `${name}.xcworkspace`,
            '-scheme',
            name,
            '-configuration',
            'Debug',
            '-sdk',
            'iphonesimulator',
            '-destination',
            `platform=iOS Simulator,id=${iosUdid}`,
            '-derivedDataPath',
            'build',
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
        `ios/build/Build/Products/Debug-iphonesimulator/${name}.app`,
    )
    if (
        capture('xcrun', ['simctl', 'install', iosUdid, product], {
            timeout: 120,
        }) === undefined
    ) {
        record('FAIL', `${app} ios install`)
        return false
    }
    record('PASS', `${app} ios build`)
    return true
}

async function flowsIos(app: App) {
    const startedAt = Date.now()
    await runFlows(app, 'ios', iosUdid, iosBundleId(app))
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
        const avd =
            env.ANDROID_AVD ?? capture(emulator, ['-list-avds'])?.split('\n')[0]
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
    const result = await run(
        './gradlew',
        ['app:assembleDebug', '--console=plain', '-q'],
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
    // the background, which slows the emulator for a while afterwards.
    const apk = path.join(
        dir,
        'android/app/build/outputs/apk/debug/app-debug.apk',
    )
    const marker = path.join(path.dirname(apk), `.installed-${androidSerial}`)
    const hash = createHash('sha1').update(fs.readFileSync(apk)).digest('hex')
    const installed =
        fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').trim() === hash
    if (
        !installed ||
        capture(ADB, [
            '-s',
            androidSerial,
            'shell',
            'pm',
            'path',
            androidPackage(app),
        ]) === undefined
    ) {
        const install = await run(
            ADB,
            ['-s', androidSerial, 'install', '-r', apk],
            { log, timeout: 180 },
        )
        if (!install.ok) {
            record('FAIL', `${app} android install`, `see ${rel(log)}`)
            return false
        }
        fs.writeFileSync(marker, hash)
    }
    capture(ADB, ['-s', androidSerial, 'reverse', 'tcp:8081', 'tcp:8081'])
    record('PASS', `${app} android build`)
    return true
}

async function flowsAndroid(app: App) {
    const pkg = androidPackage(app)
    capture(ADB, ['-s', androidSerial, 'logcat', '-b', 'crash', '-c'])
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

const build = { ios: buildIos, android: buildAndroid }
const flows = { ios: flowsIos, android: flowsAndroid }

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
            await jsCheck(
                'verify script typecheck',
                path.join(example, 'node_modules/.bin/tsc'),
                ['-p', 'scripts'],
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
            if (platform === 'ios') {
                if (iosDevice()) ready.push('ios')
                else record('FAIL', 'ios', 'no iPhone simulator found')
            } else {
                ensureJava()
                if (await androidDevice()) ready.push('android')
                else record('FAIL', 'android', 'no device or emulator')
            }
        }

        for (const app of APPS) {
            if (ready.length === 0) break
            if (!(await ensureNodeModules(appDir(app)))) continue
            const platforms =
                ready.includes('ios') && !(await iosPods(app))
                    ? ready.filter((p) => p !== 'ios')
                    : ready

            say(`Building ${app} (${platforms.join(' ')})`)
            const built = await Promise.all(platforms.map((p) => build[p](app)))
            const toRun = platforms.filter((_, i) => built[i])
            if (toRun.length === 0) continue

            if (!(await startMetro(app))) {
                record(
                    'FAIL',
                    `${app} metro`,
                    `see ${rel(path.join(OUT, `metro-${app}.log`))}`,
                )
                await stopMetro()
                continue
            }
            say(`Running flows for ${app} (${toRun.join(' ')})`)
            await Promise.all(toRun.map((p) => flows[p](app)))
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
                / android (walkthrough|regression|flows)$/.test(r.name),
        )
    ) {
        console.log(
            "If Android flows fail on screens that look fine, the emulator is probably overloaded: use a plain AOSP image (not Google APIs) with 4 GB+ RAM and hardware graphics (hw.ramSize, hw.gpu.mode = host in the AVD's config.ini).",
        )
    }
    process.exitCode = results.some((r) => r.status === 'FAIL') ? 1 : 0
}

await main()
