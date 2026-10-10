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
// A Macrobenchmark test's name, with its app's package as the subject's id
// (BurstTest's are named `burst[<variant>,<package>]`).
const testName = (name: string) =>
    name.replace(
        /com\.dylanvann\.rnfibenchmark\.(\w+)/g,
        (match, id: string) =>
            Object.keys(subjects).find(
                (s) => s.replace(/[^a-z0-9]/gi, '') === id,
            ) ?? match,
    )
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
        images: { shownMs?: number; windowMs?: number; eventGapMs?: number }[]
    }
    images?: { error?: string }[]
    network?: { mbps: number }
    imageServer?: { latencyMs: number; mbps: number }
    // Paired runs (run-android.ts --paired): the phone and the iteration,
    // which the other subjects ran next to on that phone.
    phone?: number
    iteration?: number
    // The image requests the phone's server got (Android).
    imageRequests?: number
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
        metrics?: Record<string, { median: number; runs: number[] }>
        sampledMetrics?: Record<
            string,
            { P50: number; P90: number; P99: number; runs: number[][] }
        >
    }[]
}

const platformOf = (r: { platform?: string }) => r.platform ?? 'ios'

const percentile = (values: number[], p: number) => {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[
        Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))
    ]
}

// Paired runs (run-android.ts --paired): each subject against the first, run
// by run, as they ran next to each other on the same phone. The median of
// those differences, the middle half of them, and how often the subject was
// faster, so phones' differences don't count.
function pairedComparison(runs: Run[]): string[] {
    const pairedRuns = runs.filter((r) => r.phone !== undefined)
    if (pairedRuns.length === 0) return []
    const inRuns = new Set(pairedRuns.map((r) => r.subject))
    const subjectsInOrder = order.filter((s) => inRuns.has(s))
    const [base, ...rest] = subjectsInOrder
    if (!base || rest.length === 0) return []
    const lines = [
        '',
        `Paired on each phone, against ${nameOf(base)} (ms; negative is faster): median difference, and the middle half of the differences, for time to the first and to the last image; how many runs were faster; image requests (median, each subject):`,
        '',
        '| Subject | Scenario | Pairs | First | All | Faster (all) | Requests |',
        '| --- | --- | --- | --- | --- | --- | --- |',
    ]
    const scenarios = [...new Set(pairedRuns.map((r) => r.scenario))]
    const key = (r: Run) => `${r.scenario}\t${r.phone}\t${r.iteration}`
    const baseRuns = new Map(
        pairedRuns.filter((r) => r.subject === base).map((r) => [key(r), r]),
    )
    const describe = (diffs: number[]) =>
        diffs.length
            ? `${Math.round(median(diffs)!)} (${Math.round(percentile(diffs, 0.25))} to ${Math.round(percentile(diffs, 0.75))})`
            : '–'
    for (const subject of rest) {
        for (const scenario of scenarios) {
            const first: number[] = []
            const all: number[] = []
            const requests: number[] = []
            const baseRequests: number[] = []
            for (const r of pairedRuns) {
                if (r.subject !== subject || r.scenario !== scenario) continue
                const b = baseRuns.get(key(r))
                if (!b) continue
                if (
                    r.analysis.firstMs !== undefined &&
                    b.analysis.firstMs !== undefined
                ) {
                    first.push(r.analysis.firstMs - b.analysis.firstMs)
                }
                if (
                    r.analysis.allMs !== undefined &&
                    b.analysis.allMs !== undefined
                ) {
                    all.push(r.analysis.allMs - b.analysis.allMs)
                }
                if (r.imageRequests !== undefined)
                    requests.push(r.imageRequests)
                if (b.imageRequests !== undefined)
                    baseRequests.push(b.imageRequests)
            }
            const faster = all.filter((d) => d < 0).length
            lines.push(
                `| ${nameOf(subject)} | ${scenario} | ${Math.max(first.length, all.length)} | ${describe(first)} | ${describe(all)} | ${all.length ? `${faster} of ${all.length}` : '–'} | ${requests.length ? `${median(requests)} (${nameOf(base)}: ${median(baseRequests) ?? '–'})` : '–'} |`,
            )
        }
    }
    return lines
}

export function summarize(dir: string) {
    const files = fs.readdirSync(dir)
    const runs = files
        // Not a paired run's metrics (metrics-android-phone-<n>.json).
        .filter((f) => /-\d+\.json$/.test(f) && !f.startsWith('metrics-'))
        .map(
            (f) =>
                JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Run,
        )
    const failuresFile = path.join(dir, 'failures.json')
    const failures: Failure[] = fs.existsSync(failuresFile)
        ? JSON.parse(fs.readFileSync(failuresFile, 'utf8'))
        : []
    const timedScenarios = new Set(runs.map((r) => r.scenario))
    timedScenarios.add('grid').add('large')
    const keys = [
        ...new Set(
            [
                ...runs,
                ...failures.filter((f) => timedScenarios.has(f.scenario)),
            ].map((r) => `${platformOf(r)}\t${r.subject}\t${r.scenario}`),
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
        `Times in ms from the start of the run (the frame its clock starts in, as the app renders the subject's views), from screen recordings, timed by the clock the app draws in each frame: median / p90 over the runs (with 5 runs, p90 is the slowest). All visible images: over the runs that showed every one; the others are counted in the next columns. Frame window: how long before an image's first frame the last earlier one was drawn (median / max): the image showed within that time. Network: the median download rate of 4 large photos fetched with \`fetch\` (not through the subject) once the images have loaded.${devices.length ? ` iOS: ${devices.join(', ')}.` : ''}${servers.length ? ` Images served on the phone (${servers.join('; ')}).` : ''}`,
        '',
        '| Platform | Subject | Scenario | Runs | First image | All visible images | Per image | Frame window | Load event after pixels | Images not shown (load errors) | Network Mbps | Failures |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
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
        const windows = images.flatMap((i) =>
            i.windowMs === undefined ? [] : [i.windowMs],
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
        const network = pick((r) => r.network?.mbps)
        const first = pick((r) => r.analysis.firstMs)
        const all = pick((r) => r.analysis.allMs)
        lines.push(
            `| ${platform} | ${nameOf(subject)} | ${scenario} | ${timed.length} | ${fmt(first, median)} / ${fmt(first, p90)} | ${fmt(all, median)} / ${fmt(all, p90)}${all.length && all.length < timed.length ? ` (${all.length} runs)` : ''} | ${fmt(perImage, median)} / ${fmt(perImage, p90)} | ${windows.length ? `${fmt(windows, median)} / ${Math.max(...windows)}` : '–'} | ${gap.length ? fmt(gap, median) : '–'} | ${notShown || errors ? `${notShown} (${errors})` : ''} | ${network.length ? fmt(network, median) : '–'} | ${failed || ''} |`,
        )
    }

    lines.push(...pairedComparison(runs))

    // Failures outside a scenario's runs (a build, the image server, the
    // metrics, a whole test).
    const others = failures.filter((f) => !timedScenarios.has(f.scenario))
    if (others.length) {
        lines.push('', 'Other failures:', '')
        for (const f of others) {
            lines.push(
                `- ${platformOf(f)} ${nameOf(f.subject)} ${f.scenario}: ${f.error.split('\n')[0].slice(0, 200)}`,
            )
        }
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
    // A paired run's metrics, one file per phone: pooled below.
    const phoneFiles = android.filter((f) =>
        /^metrics-android-phone-\d+\.json$/.test(f),
    )
    const subjectFiles = android.filter((f) => !phoneFiles.includes(f))
    if (subjectFiles.length > 0) {
        lines.push(
            '',
            'Android Macrobenchmark metrics (median, or p50 / p90 / p99 for sampled metrics):',
            '',
            '| Subject | Test | Metric | Value |',
            '| --- | --- | --- | --- |',
        )
    }
    for (const file of subjectFiles) {
        const subject = file.replace(/^metrics-android-|\.json$/g, '')
        const data = JSON.parse(
            fs.readFileSync(path.join(dir, file), 'utf8'),
        ) as AndroidMetrics
        for (const benchmark of data.benchmarks) {
            for (const [name, metric] of Object.entries(
                benchmark.metrics ?? {},
            )) {
                lines.push(
                    `| ${nameOf(subject)} | ${testName(benchmark.name)} | ${name} | ${Math.round(metric.median)} |`,
                )
            }
            for (const [name, metric] of Object.entries(
                benchmark.sampledMetrics ?? {},
            )) {
                lines.push(
                    `| ${nameOf(subject)} | ${testName(benchmark.name)} | ${name} | ${metric.P50.toFixed(1)} / ${metric.P90.toFixed(1)} / ${metric.P99.toFixed(1)} |`,
                )
            }
        }
    }

    // Every phone's runs of each test together. allFramesMs: each run's UI
    // thread and RenderThread frame time added up (the burst test's sums),
    // which counts frames FrameTimingMetric leaves out.
    const pooled = new Map<
        string,
        { metrics: Map<string, number[]>; sampled: Map<string, number[]> }
    >()
    const add = (map: Map<string, number[]>, name: string, values: number[]) =>
        map.set(name, [...(map.get(name) ?? []), ...values])
    for (const file of phoneFiles) {
        const data = JSON.parse(
            fs.readFileSync(path.join(dir, file), 'utf8'),
        ) as AndroidMetrics
        for (const benchmark of data.benchmarks) {
            const entry = pooled.get(benchmark.name) ?? {
                metrics: new Map(),
                sampled: new Map(),
            }
            pooled.set(benchmark.name, entry)
            const metrics = benchmark.metrics ?? {}
            for (const [name, metric] of Object.entries(metrics)) {
                add(entry.metrics, name, metric.runs)
            }
            const ui = metrics.uiThreadFramesSumMs?.runs
            const rt = metrics.renderThreadFramesSumMs?.runs
            if (ui && rt) {
                add(
                    entry.metrics,
                    'allFramesMs',
                    ui.map((v, i) => v + rt[i]),
                )
            }
            for (const [name, metric] of Object.entries(
                benchmark.sampledMetrics ?? {},
            )) {
                add(entry.sampled, name, metric.runs.flat())
            }
        }
    }
    if (pooled.size > 0) {
        lines.push(
            '',
            `Android Macrobenchmark metrics over every run on the ${phoneFiles.length} phones (median, or p50 / p90 / p99 of every sample; allFramesMs: each run's UI thread and RenderThread frame time added up):`,
            '',
            '| Test | Metric | Value |',
            '| --- | --- | --- |',
        )
        for (const [name, entry] of [...pooled].sort(([a], [b]) =>
            a.localeCompare(b),
        )) {
            for (const [metric, values] of [...entry.metrics].sort(([a], [b]) =>
                a.localeCompare(b),
            )) {
                lines.push(
                    `| ${testName(name)} | ${metric} | ${fmt(values, median)} |`,
                )
            }
            for (const [metric, values] of entry.sampled) {
                lines.push(
                    `| ${testName(name)} | ${metric} | ${[0.5, 0.9, 0.99].map((p) => percentile(values, p).toFixed(1)).join(' / ')} |`,
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
