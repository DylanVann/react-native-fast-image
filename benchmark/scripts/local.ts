// The fast-image-local subject's package: FastImage from this checkout, built
// and packed as npm would publish it, and installed into the app's
// node_modules under the subject's name (app/subjects.json's `local`), so the
// subject is what users install. The package has no dependencies, only peers,
// so extracting it is installing it. Done after the app's own install, which
// would remove it.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = path.join(import.meta.dir, '..', '..')
const APP = path.join(ROOT, 'benchmark', 'app')

function run(cmd: string, args: string[], cwd: string) {
    const result = spawnSync(cmd, args, {
        cwd,
        encoding: 'utf8',
        timeout: 5 * 60_000,
    })
    if (result.status !== 0) {
        throw new Error(
            `${cmd} ${args.join(' ')} failed:\n${(result.stdout + result.stderr).slice(-3000)}`,
        )
    }
    return result.stdout
}

export function installLocal(name: string) {
    run('bun', ['run', 'build:package'], ROOT)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-local-'))
    try {
        const packed = JSON.parse(
            run('npm', ['pack', '--json', '--pack-destination', dir], ROOT),
        )
        const dest = path.join(APP, 'node_modules', name)
        fs.rmSync(dest, { recursive: true, force: true })
        fs.mkdirSync(dest, { recursive: true })
        run(
            'tar',
            [
                '-xzf',
                path.join(dir, packed[0].filename),
                '-C',
                dest,
                '--strip-components=1',
            ],
            ROOT,
        )
        return packed[0].filename as string
    } finally {
        fs.rmSync(dir, { recursive: true, force: true })
    }
}
