// The regression groups' times in the e2e workflow's runs, kept in its R2
// bucket, so `verify.mts --shard` can split each app's groups into ranges that
// take about as long as each other (VERIFY_GROUP_TIMES).
//
//   bun scripts/group-times.ts fetch <file>
//       Writes each group's median time in the last 5 runs, by
//       <app>-<platform>. Only runs that recorded their times before this run
//       started count, so every shard of a run reads the same times and splits
//       the groups the same way.
//   bun scripts/group-times.ts record <name>
//       Saves this job's first-try times, from verify-output's results.json
//       files, as group-times/<run id>/<name>.json.
//
// Uses the cache's R2 settings (RUNS_ON_S3_BUCKET_CACHE, ...): without them,
// fetch writes {} and the shards split by count.
import fs from 'node:fs'
import path from 'node:path'

type Times = Record<string, Record<string, number>>

const RUNS = 5
const PREFIX = 'group-times/'
const env = process.env
const s3 = env.RUNS_ON_S3_BUCKET_CACHE
    ? new Bun.S3Client({
          bucket: env.RUNS_ON_S3_BUCKET_CACHE,
          endpoint: env.RUNS_ON_S3_BUCKET_ENDPOINT,
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      })
    : undefined
const [command, arg] = process.argv.slice(2)

if (command === 'fetch' && arg) {
    const times = s3 ? await medians(s3) : {}
    fs.writeFileSync(arg, JSON.stringify(times) + '\n')
    for (const [app, groups] of Object.entries(times))
        console.log(`${app}: ${Object.keys(groups).length} groups`)
} else if (command === 'record' && arg) {
    const times = recorded()
    if (s3 && Object.keys(times).length > 0)
        await s3.write(
            `${PREFIX}${env.GITHUB_RUN_ID}/${arg}.json`,
            JSON.stringify(times),
        )
} else {
    console.error(
        'Usage: bun scripts/group-times.ts fetch <file> | record <name>',
    )
    process.exit(2)
}

// When this workflow run was created: the same for all of its jobs.
async function runCreatedAt() {
    const response = await fetch(
        `${env.GITHUB_API_URL}/repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
        { headers: { Authorization: `Bearer ${env.GH_TOKEN}` } },
    )
    if (!response.ok) throw new Error(`GitHub API: ${response.status}`)
    const { created_at } = (await response.json()) as { created_at: string }
    return Date.parse(created_at)
}

async function medians(s3: Bun.S3Client) {
    const created = await runCreatedAt()
    const files: { key: string; lastModified?: string }[] = []
    let continuationToken: string | undefined
    do {
        const page = await s3.list({ prefix: PREFIX, continuationToken })
        files.push(...(page.contents ?? []))
        continuationToken = page.isTruncated
            ? page.nextContinuationToken
            : undefined
    } while (continuationToken)
    // group-times/<run id>/<name>.json
    const runOf = (key: string) => Number(key.split('/')[1])
    const before = files.filter(
        (file) =>
            file.lastModified !== undefined &&
            Date.parse(file.lastModified) < created,
    )
    const runs = [...new Set(before.map((file) => runOf(file.key)))]
        .sort((a, b) => b - a)
        .slice(0, RUNS)
    const samples: Record<string, Record<string, number[]>> = {}
    for (const file of before.filter((file) =>
        runs.includes(runOf(file.key)),
    )) {
        const times = (await s3.file(file.key).json()) as Times
        for (const [app, groups] of Object.entries(times))
            for (const [group, seconds] of Object.entries(groups))
                ((samples[app] ??= {})[group] ??= []).push(seconds)
    }
    const median = (values: number[]) => {
        const sorted = [...values].sort((a, b) => a - b)
        const middle = Math.floor(sorted.length / 2)
        return sorted.length % 2
            ? sorted[middle]
            : (sorted[middle - 1] + sorted[middle]) / 2
    }
    return Object.fromEntries(
        Object.entries(samples).map(([app, groups]) => [
            app,
            Object.fromEntries(
                Object.entries(groups).map(([group, values]) => [
                    group,
                    median(values),
                ]),
            ),
        ]),
    ) as Times
}

// verify-output/<run>/<app>-<platform>/regression/results.json's timings
// ("fade 8.4s", "fade (retry) 9.1s"), without the retries.
function recorded() {
    const times: Times = {}
    const out = path.join(import.meta.dir, '..', 'verify-output')
    if (!fs.existsSync(out)) return times
    for (const file of fs.readdirSync(out, { recursive: true }) as string[]) {
        if (path.basename(file) !== 'results.json') continue
        const app = path.basename(path.dirname(path.dirname(file)))
        const { timings = [] } = JSON.parse(
            fs.readFileSync(path.join(out, file), 'utf8'),
        ) as { timings?: string[] }
        for (const timing of timings) {
            const match = timing.match(/^(.+) ([\d.]+)s$/)
            if (match && !match[1].endsWith(' (retry)'))
                (times[app] ??= {})[match[1]] = Number(match[2])
        }
    }
    return times
}
