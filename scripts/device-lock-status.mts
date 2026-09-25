#!/usr/bin/env bun
// Live view of the device lock (scripts/device-lock.mts): which run holds it,
// which runs are waiting for it, when each started, how long it has been
// going, how much of its `timeout` budget is left, and how far along it is
// (from its verify-output/<stamp>/results.txt and the log it's writing).
//
//   bun scripts/device-lock-status.mts            refresh every 2 s
//   bun scripts/device-lock-status.mts --once     print once and exit
//   bun scripts/device-lock-status.mts --interval 5
//
// Runs are found by their command line (node/bun running scripts/verify.mts
// or scripts/device-lock.mts) in any checkout or Rift, plus whatever process
// listens on the lock port, so a stale or foreign holder shows up too.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const LOCK_PORT = 8089

const args = process.argv.slice(2)
const once = args.includes('--once') || !process.stdout.isTTY
const intervalIndex = args.indexOf('--interval')
const interval = Math.max(
    1,
    Number(intervalIndex === -1 ? 2 : args[intervalIndex + 1]) || 2,
)

// --- Colors --------------------------------------------------------------

const color = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code: string) => (text: string) =>
    color ? `\x1b[${code}m${text}\x1b[0m` : text
const bold = paint('1')
const dim = paint('2')
const green = paint('32')
const yellow = paint('33')
const red = paint('31')
const cyan = paint('36')

// --- System queries ------------------------------------------------------

// Short command with a time limit; empty output if it fails (lsof exits 1
// when nothing matches).
function capture(cmd: string, argv: string[]): string {
    try {
        return execFileSync(cmd, argv, {
            encoding: 'utf8',
            timeout: 5000,
            stdio: ['ignore', 'pipe', 'ignore'],
        })
    } catch (error) {
        const output = (error as { stdout?: string }).stdout
        return typeof output === 'string' ? output : ''
    }
}

type Process = { pid: number; ppid: number; elapsed: number; args: string }

// ps etime: [[dd-]hh:]mm:ss
function parseElapsed(etime: string): number {
    const [days, rest] = etime.includes('-') ? etime.split('-') : ['0', etime]
    const parts = rest!.split(':').map(Number)
    while (parts.length < 3) parts.unshift(0)
    const [h, m, s] = parts as [number, number, number]
    return Number(days) * 86400 + h * 3600 + m * 60 + s
}

function listProcesses(): Map<number, Process> {
    const processes = new Map<number, Process>()
    for (const line of capture('ps', ['-axo', 'pid=,ppid=,etime=,args=']).split(
        '\n',
    )) {
        const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line)
        if (!match) continue
        const pid = Number(match[1])
        processes.set(pid, {
            pid,
            ppid: Number(match[2]),
            elapsed: parseElapsed(match[3]!),
            args: match[4]!,
        })
    }
    return processes
}

function lockHolderPid(): number | undefined {
    const output = capture('lsof', [
        '-nP',
        `-iTCP:${LOCK_PORT}`,
        '-sTCP:LISTEN',
        '-Fp',
    ])
    const match = /^p(\d+)$/m.exec(output)
    return match ? Number(match[1]) : undefined
}

function workingDirectories(pids: number[]): Map<number, string> {
    const cwds = new Map<number, string>()
    if (pids.length === 0) return cwds
    let pid = 0
    for (const line of capture('lsof', [
        '-a',
        '-p',
        pids.join(','),
        '-d',
        'cwd',
        '-Fpn',
    ]).split('\n')) {
        if (line.startsWith('p')) pid = Number(line.slice(1))
        else if (line.startsWith('n')) cwds.set(pid, line.slice(1))
    }
    return cwds
}

// A run started directly by node/bun (not the `timeout` or shell wrapper
// around it, whose command line also mentions the script).
const RUN_COMMAND =
    /^(?:\S*\/)?(?:node|bun|tsx)\s+(?:\S+\s+)*?\S*scripts\/(?:verify|device-lock)\.mts\b/

// The `timeout N` (or `timeout -k 5 N`) wrapping a process, if any, and how
// long ago it started: that's the run's real budget, which counts from before
// the lock was taken.
function timeoutBudget(
    process: Process,
    processes: Map<number, Process>,
): { limit: number; elapsed: number } | undefined {
    let current: Process | undefined = process
    for (let depth = 0; current && depth < 6; depth++) {
        const match =
            /^(?:\S*\/)?timeout\s+(?:-[-\w]+(?:[= ]\S+)?\s+)*(\d+(?:\.\d+)?)([smhd]?)\b/.exec(
                current.args,
            )
        if (match) {
            const unit = { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[match[2]!]!
            return { limit: Number(match[1]) * unit, elapsed: current.elapsed }
        }
        current = processes.get(current.ppid)
    }
    return undefined
}

// --- Run output ----------------------------------------------------------

// verify.mts creates verify-output/<yyyymmdd-hhmmss>[-<ref>] when it starts,
// before taking the lock, so the directory stamped closest to the process
// start is its output.
function findRunDirectory(cwd: string, start: Date): string | undefined {
    const root = path.join(cwd, 'verify-output')
    let best: { dir: string; distance: number } | undefined
    let entries: string[]
    try {
        entries = fs.readdirSync(root)
    } catch {
        return undefined
    }
    for (const name of entries) {
        const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(name)
        if (!match) continue
        const [, y, mo, d, h, mi, s] = match.map(Number)
        const stamped = new Date(y!, mo! - 1, d, h, mi, s)
        const distance = Math.abs(stamped.getTime() - start.getTime()) / 1000
        if (distance <= 90 && (!best || distance < best.distance)) {
            best = { dir: path.join(root, name), distance }
        }
    }
    return best?.dir
}

type Progress = {
    passed: number
    failed: number
    last?: string
    activity?: { file: string; age: number }
}

function readProgress(dir: string): Progress {
    const progress: Progress = { passed: 0, failed: 0 }
    try {
        const lines = fs
            .readFileSync(path.join(dir, 'results.txt'), 'utf8')
            .split('\n')
            .filter(Boolean)
        progress.passed = lines.filter((l) => l.startsWith('PASS')).length
        progress.failed = lines.filter((l) => l.startsWith('FAIL')).length
        progress.last = lines[lines.length - 1]?.replace(/\s+/g, ' ')
    } catch {
        // No results yet.
    }
    // The most recently written file (two levels deep: logs, then the
    // per-app/platform folders with flow logs and screenshots).
    let newest: { file: string; mtime: number } | undefined
    const visit = (folder: string, depth: number) => {
        let entries: fs.Dirent[]
        try {
            entries = fs.readdirSync(folder, { withFileTypes: true })
        } catch {
            return
        }
        for (const entry of entries) {
            const file = path.join(folder, entry.name)
            if (entry.isDirectory()) {
                if (depth < 2) visit(file, depth + 1)
                continue
            }
            const mtime = fs.statSync(file).mtimeMs
            if (!newest || mtime > newest.mtime) newest = { file, mtime }
        }
    }
    visit(dir, 0)
    if (newest) {
        progress.activity = {
            file: path.relative(dir, newest.file),
            age: (Date.now() - newest.mtime) / 1000,
        }
    }
    return progress
}

// --- Rendering -----------------------------------------------------------

function duration(seconds: number): string {
    const s = Math.max(0, Math.round(seconds))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const rest = s % 60
    if (h > 0)
        return `${h}h ${String(m).padStart(2, '0')}m ${String(rest).padStart(2, '0')}s`
    if (m > 0) return `${m}m ${String(rest).padStart(2, '0')}s`
    return `${rest}s`
}

const clock = (date: Date) => date.toTimeString().slice(0, 8)

// The checkout's name: the Rift name under ~/Developer/.rifts/<repo>/<name>,
// otherwise the folder name.
const checkoutName = (cwd: string) => path.basename(cwd)

type Run = {
    process: Process
    cwd: string
    start: Date
    holder: boolean
    budget?: { limit: number; elapsed: number }
    dir?: string
    progress?: Progress
}

function collectRuns(): { runs: Run[]; holderPid?: number } {
    const processes = listProcesses()
    const holderPid = lockHolderPid()
    const candidates = [...processes.values()].filter(
        (p) => RUN_COMMAND.test(p.args) || p.pid === holderPid,
    )
    const cwds = workingDirectories(candidates.map((p) => p.pid))
    const now = Date.now()
    const runs = candidates.map((process): Run => {
        const cwd = cwds.get(process.pid) ?? '?'
        const start = new Date(now - process.elapsed * 1000)
        const run: Run = {
            process,
            cwd,
            start,
            holder: process.pid === holderPid,
            budget: timeoutBudget(process, processes),
        }
        if (cwd !== '?') {
            run.dir = findRunDirectory(cwd, start)
            if (run.dir) run.progress = readProgress(run.dir)
        }
        return run
    })
    // Holder first, then waiters in the order they started (which is the
    // order they'll likely get the lock, though the lock isn't a queue).
    runs.sort(
        (a, b) =>
            Number(b.holder) - Number(a.holder) ||
            a.start.getTime() - b.start.getTime(),
    )
    return { runs, holderPid }
}

function render({ runs, holderPid }: ReturnType<typeof collectRuns>): string {
    const lines: string[] = []
    const now = new Date()
    lines.push(
        bold(`Device lock 127.0.0.1:${LOCK_PORT}`) +
            dim(
                `  ${clock(now)}` +
                    (once
                        ? ''
                        : `, refreshing every ${interval} s (Ctrl-C to stop)`),
            ),
    )
    lines.push('')
    if (holderPid === undefined) lines.push(green('Nobody holds the lock.'))
    if (runs.length === 0) {
        lines.push(dim('No verify.mts or device-lock.mts runs.'))
        return lines.join('\n')
    }
    for (const run of runs) {
        const elapsed = run.process.elapsed
        const state = run.holder
            ? green('● HOLDS LOCK')
            : yellow('○ WAITING   ')
        const head = [
            state,
            bold(checkoutName(run.cwd).padEnd(18)),
            dim(`pid ${String(run.process.pid).padEnd(6)}`),
            `started ${clock(run.start)}`,
            `${run.holder ? 'running' : 'waiting'} ${duration(elapsed)}`,
        ]
        if (run.budget) {
            const left = run.budget.limit - run.budget.elapsed
            const tint =
                left <= 0 ? red : left < 120 ? yellow : (t: string) => t
            head.push(
                dim(`limit ${duration(run.budget.limit)}`) +
                    ' ' +
                    tint(
                        left <= 0
                            ? '(over its limit)'
                            : `(${duration(left)} left)`,
                    ),
            )
        }
        lines.push(head.join('  '))
        lines.push(`  ${dim('$')} ${run.process.args}`)
        lines.push(`  ${dim(run.cwd)}`)
        if (run.dir) {
            const p = run.progress!
            const results =
                p.passed + p.failed === 0
                    ? dim('no results yet')
                    : `${green(`${p.passed} passed`)}, ${
                          p.failed ? red(`${p.failed} failed`) : '0 failed'
                      }` + (p.last ? dim(`   last: ${p.last}`) : '')
            lines.push(`  ${cyan('results')}  ${results}`)
            if (p.activity) {
                lines.push(
                    `  ${cyan('writing')}  ${p.activity.file} ${dim(
                        `(${duration(p.activity.age)} ago)`,
                    )}`,
                )
            } else {
                lines.push(
                    `  ${cyan('output ')}  ${path.relative(run.cwd, run.dir)} ${dim(
                        '(empty)',
                    )}`,
                )
            }
        } else if (run.cwd !== '?') {
            lines.push(
                `  ${cyan('output ')}  ${dim('no verify-output folder for this run')}`,
            )
        }
        lines.push('')
    }
    if (runs.some((r) => !r.holder && r.budget)) {
        lines.push(
            dim(
                "A waiting run's limit counts from when its `timeout` started, so time spent waiting eats into it.",
            ),
        )
    }
    return lines.join('\n')
}

// --- Main ----------------------------------------------------------------

if (once) {
    console.log(render(collectRuns()))
} else {
    const hideCursor = '\x1b[?25l'
    const showCursor = '\x1b[?25h'
    const clear = '\x1b[2J\x1b[H'
    const restore = () => {
        process.stdout.write(showCursor)
        process.exit(0)
    }
    process.on('SIGINT', restore)
    process.on('SIGTERM', restore)
    process.stdout.write(hideCursor)
    const tick = () =>
        process.stdout.write(clear + render(collectRuns()) + '\n')
    tick()
    setInterval(tick, interval * 1000)
}
