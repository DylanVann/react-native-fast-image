// Summarizes a results folder (from run.ts): every run's JSON file and every
// subject's XCTest result bundle in it, as a markdown table, written to
// summary.md and printed.
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
    subject: string
    scenario: string
    device?: { model: string; os: string }
    analysis: {
        firstMs?: number
        allMs?: number
        error?: string
        images: { shownMs?: number; eventGapMs?: number }[]
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

export function summarize(dir: string) {
    const files = fs.readdirSync(dir)
    const runs = files
        .filter((f) => /-\d+\.json$/.test(f))
        .map(
            (f) =>
                JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Run,
        )
    const failures: { subject: string; scenario: string; error: string }[] =
        fs.existsSync(path.join(dir, 'failures.json'))
            ? JSON.parse(
                  fs.readFileSync(path.join(dir, 'failures.json'), 'utf8'),
              )
            : []
    const order = Object.keys(subjects)
    const keys = [
        ...new Set(runs.map((r) => `${r.subject}\t${r.scenario}`)),
    ].sort(
        (a, b) =>
            order.indexOf(a.split('\t')[0]) - order.indexOf(b.split('\t')[0]) ||
            a.localeCompare(b),
    )
    const device = runs.find((r) => r.device)?.device
    const lines = [
        `Device: ${device ? `${device.model} (iOS ${device.os})` : 'unknown'}. Times in ms from the images being mounted, from the screen recording (median / p90 over all runs).`,
        '',
        '| Subject | Scenario | Runs | First image | All visible images | Per image | Load event after pixels | Failures |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ]
    for (const key of keys) {
        const [subject, scenario] = key.split('\t')
        const these = runs.filter(
            (r) => r.subject === subject && r.scenario === scenario,
        )
        const pick = (f: (r: Run) => number | undefined) =>
            these.map(f).filter((v): v is number => v !== undefined)
        const images = these.flatMap((r) => r.analysis.images)
        const perImage = images.flatMap((i) =>
            i.shownMs === undefined ? [] : [i.shownMs],
        )
        const gap = images.flatMap((i) =>
            i.eventGapMs === undefined ? [] : [i.eventGapMs],
        )
        const failed =
            these.filter((r) => r.analysis.error).length +
            failures.filter(
                (f) => f.subject === subject && f.scenario === scenario,
            ).length
        const first = pick((r) => r.analysis.firstMs)
        const all = pick((r) => r.analysis.allMs)
        lines.push(
            `| ${subjects[subject]?.name ?? subject} | ${scenario} | ${these.length} | ${fmt(first, median)} / ${fmt(first, p90)} | ${fmt(all, median)} / ${fmt(all, p90)} | ${fmt(perImage, median)} / ${fmt(perImage, p90)} | ${gap.length ? fmt(gap, median) : '–'} | ${failed || ''} |`,
        )
    }
    lines.push(
        '',
        'XCTest metrics (median / p90 of the measurements):',
        '',
        '| Subject | Test | Metric | Median | p90 |',
        '| --- | --- | --- | --- | --- |',
    )
    for (const bundle of files.filter((f) =>
        /^metrics-.*\.xcresult$/.test(f),
    )) {
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
                    )
                        continue
                    const unit = metric.unitOfMeasurement
                    lines.push(
                        `| ${subjects[subject]?.name ?? subject} | ${test.testIdentifier.replace(/.*\/test/, '').replace('()', '')} | ${metric.displayName.replace(/ \(.*\)$/, '')} | ${fmt(metric.measurements, median)} ${unit} | ${fmt(metric.measurements, p90)} ${unit} |`,
                    )
                }
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
