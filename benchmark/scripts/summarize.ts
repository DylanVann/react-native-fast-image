// Summarizes a results folder (from run.ts and run-android.ts): every run's
// JSON file, every subject's iOS XCTest result bundle and Android
// Macrobenchmark metrics in it, as markdown tables, written to summary.md and
// printed.
//
//   bun benchmark/scripts/summarize.ts benchmark/results/<time>

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const subjects: Record<string, { name: string }> = JSON.parse(
    fs.readFileSync(
        path.join(import.meta.dir, '..', 'app', 'subjects.json'),
        'utf8',
    ),
)
const nameOf = (subject: string) => subjects[subject]?.name ?? subject
const order = Object.keys(subjects)

// The XCTest metrics in the summary (the result bundles have them all).
const SUMMARY_METRICS = [
    'Hitch Time Ratio',
    'Number of Hitches',
    'Frame Rate',
    'Memory Peak Physical',
    'Absolute Memory Physical',
]

const median = (values: number[]) => {
    if (!values.length) return undefined
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor((sorted.length - 1) / 2)]
}
const p90 = (values: number[]) => {
    if (!values.length) return undefined
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[
        Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)
    ]
}
const fmt = (values: number[], f: (v: number[]) => number | undefined) => {
    const v = f(values)
    return v === undefined ? '–' : `${Math.round(v)}`
}

type Run = {
    platform?: string
    subject: string
    scenario: string
    device?: { model: string; os: string }
    analysis: {
        firstMs?: number
        allMs?: number
        error?: string
        notShown?: number
        images: { shownMs?: number; eventGapMs?: number }[]
    }
    images?: { error?: string }[]
    network?: { before?: { mbps: number }; after?: { mbps: number } }
    imageServer?: { latencyMs: number; mbps: number }
}

type Failure = {
    platform?: string
    subject: string
    scenario: string
    error: string
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

type AndroidMetrics = {
    benchmarks: {
        name: string
        metrics?: Record<string, { median: number }>
        sampledMetrics?: Record<string, { P50: number; P90: number }>
    }[]
}

const platformOf = (r: { platform?: string }) => r.platform ?? 'ios'

export function summarize(dir: string) {
    const files = fs.readdirSync(dir)
    const runs = files
        .filter((f) => /-\d+\.json$/.test(f))
        .map(
            (f) =>
                JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Run,
        )
    const failuresFile = path.join(dir, 'failures.json')
    const failures: Failure[] = fs.existsSync(failuresFile)
        ? JSON.parse(fs.readFileSync(failuresFile, 'utf8'))
        : []
    const keys = [
        ...new Set(
            runs.map((r) => `${platformOf(r)}\t${r.subject}\t${r.scenario}`),
        ),
    ].sort((a, b) => {
        const [pa, sa] = a.split('\t')
        const [pb, sb] = b.split('\t')
        return (
            pa.localeCompare(pb) ||
            order.indexOf(sa) - order.indexOf(sb) ||
            a.localeCompare(b)
        )
    })
    const devices = [
        ...new Set(
            runs
                .filter((r) => r.device)
                .map((r) => `${r.device!.model} (iOS ${r.device!.os})`),
        ),
    ]
    const servers = [
        ...new Set(
            runs
                .filter((r) => r.imageServer)
                .map(
                    (r) =>
                        `${r.imageServer!.latencyMs} ms latency, ${r.imageServer!.mbps || 'unlimited'} Mbps`,
                ),
        ),
    ]
    const lines = [
        `Times in ms from the images being mounted, from screen recordings (median / p90 over all runs). Network: the median download rate of 4 large photos fetched with \`fetch\` (not through the subject) just before the images mount and just after they load.${devices.length ? ` iOS: ${devices.join(', ')}.` : ''}${servers.length ? ` Images served on the phone (${servers.join('; ')}).` : ''}`,
        '',
        '| Platform | Subject | Scenario | Runs | First image | All visible images | Per image | Load event after pixels | Images not shown (load errors) | Network Mbps (before / after) | Failures |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ]
    for (const key of keys) {
        const [platform, subject, scenario] = key.split('\t')
        const these = runs.filter(
            (r) =>
                platformOf(r) === platform &&
                r.subject === subject &&
                r.scenario === scenario,
        )
        // The times leave out runs whose analysis failed (e.g. a stalled
        // recording): they count as failures.
        const timed = these.filter((r) => !r.analysis.error)
        const pick = (f: (r: Run) => number | undefined) =>
            timed.map(f).filter((v): v is number => v !== undefined)
        const images = timed.flatMap((r) => r.analysis.images)
        const perImage = images.flatMap((i) =>
            i.shownMs === undefined ? [] : [i.shownMs],
        )
        const gap = images.flatMap((i) =>
            i.eventGapMs === undefined ? [] : [i.eventGapMs],
        )
        const failed =
            these.filter((r) => r.analysis.error).length +
            failures.filter(
                (f) =>
                    platformOf(f) === platform &&
                    f.subject === subject &&
                    f.scenario === scenario,
            ).length
        const notShown = timed.reduce(
            (sum, r) => sum + (r.analysis.notShown ?? 0),
            0,
        )
        const errors = timed.reduce(
            (sum, r) => sum + (r.images ?? []).filter((i) => i.error).length,
            0,
        )
        const before = pick((r) => r.network?.before?.mbps)
        const after = pick((r) => r.network?.after?.mbps)
        const first = pick((r) => r.analysis.firstMs)
        const all = pick((r) => r.analysis.allMs)
        lines.push(
            `| ${platform} | ${nameOf(subject)} | ${scenario} | ${timed.length} | ${fmt(first, median)} / ${fmt(first, p90)} | ${fmt(all, median)} / ${fmt(all, p90)} | ${fmt(perImage, median)} / ${fmt(perImage, p90)} | ${gap.length ? fmt(gap, median) : '–'} | ${notShown || errors ? `${notShown} (${errors})` : ''} | ${before.length ? `${fmt(before, median)} / ${fmt(after, median)}` : '–'} | ${failed || ''} |`,
        )
    }

    const bundles = files.filter((f) => /^metrics-.*\.xcresult$/.test(f))
    if (bundles.length > 0) {
        lines.push(
            '',
            'iOS XCTest metrics (median / p90 of the measurements):',
            '',
            '| Subject | Test | Metric | Median | p90 |',
            '| --- | --- | --- | --- | --- |',
        )
    }
    for (const bundle of bundles) {
        const subject = bundle.replace(/^metrics-|\.xcresult$/g, '')
        const result = spawnSync(
            'xcrun',
            [
                'xcresulttool',
                'get',
                'test-results',
                'metrics',
                '--path',
                path.join(dir, bundle),
                '--compact',
            ],
            { encoding: 'utf8', maxBuffer: 1 << 28 },
        )
        if (result.status !== 0) continue
        for (const test of JSON.parse(result.stdout) as MetricTest[]) {
            for (const testRun of test.testRuns) {
                for (const metric of testRun.metrics) {
                    if (
                        !SUMMARY_METRICS.some((name) =>
                            metric.displayName.startsWith(name),
                        )
                    ) {
                        continue
                    }
                    const unit = metric.unitOfMeasurement
                    lines.push(
                        `| ${nameOf(subject)} | ${test.testIdentifier.replace(/.*\/test/, '').replace('()', '')} | ${metric.displayName.replace(/ \(.*\)$/, '')} | ${fmt(metric.measurements, median)} ${unit} | ${fmt(metric.measurements, p90)} ${unit} |`,
                    )
                }
            }
        }
    }

    const android = files.filter((f) => /^metrics-android-.*\.json$/.test(f))
    if (android.length > 0) {
        lines.push(
            '',
            'Android Macrobenchmark metrics (median, or p50 / p90 for sampled metrics):',
            '',
            '| Subject | Test | Metric | Value |',
            '| --- | --- | --- | --- |',
        )
    }
    for (const file of android) {
        const subject = file.replace(/^metrics-android-|\.json$/g, '')
        const data = JSON.parse(
            fs.readFileSync(path.join(dir, file), 'utf8'),
        ) as AndroidMetrics
        for (const benchmark of data.benchmarks) {
            for (const [name, metric] of Object.entries(
                benchmark.metrics ?? {},
            )) {
                lines.push(
                    `| ${nameOf(subject)} | ${benchmark.name} | ${name} | ${Math.round(metric.median)} |`,
                )
            }
            for (const [name, metric] of Object.entries(
                benchmark.sampledMetrics ?? {},
            )) {
                lines.push(
                    `| ${nameOf(subject)} | ${benchmark.name} | ${name} | ${metric.P50.toFixed(1)} / ${metric.P90.toFixed(1)} |`,
                )
            }
        }
    }

    const table = lines.join('\n') + '\n'
    fs.writeFileSync(path.join(dir, 'summary.md'), table)
    return table
}

if (import.meta.main) {
    const dir = process.argv[2]
    if (!dir) throw new Error('usage: summarize.ts <results folder>')
    console.log(summarize(dir))
}
