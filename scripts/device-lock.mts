// One run at a time on the shared test setup: the booted iOS simulator, the
// Android emulator, and the ports the example apps use (Metro on 8081, the
// image server on 8090 and 8091). scripts/verify.mts takes the lock (except
// with --js-only); other scripts can run under it:
//
//   node scripts/device-lock.mts <command> [args...]
//
// The lock is a listening socket on 127.0.0.1:8089: only one process can hold
// it, and the OS frees it when that process exits, however it exits (flock's
// semantics; macOS has no flock command, and Node no flock()).

import { spawn } from 'node:child_process'
import net from 'node:net'
import { pathToFileURL } from 'node:url'

const LOCK_PORT = 8089

// Listens on the lock port, or returns undefined if another process does. A
// run waiting for it connects to find out who holds it.
function tryLock(owner: string): Promise<net.Server | undefined> {
    return new Promise((resolve, reject) => {
        const server = net.createServer((socket) => socket.end(owner))
        server.once('error', (error: NodeJS.ErrnoException) =>
            error.code === 'EADDRINUSE' ? resolve(undefined) : reject(error),
        )
        server.listen(LOCK_PORT, '127.0.0.1', () => {
            // Held until the process exits, without keeping it running.
            server.unref()
            resolve(server)
        })
    })
}

function lockOwner(): Promise<string> {
    return new Promise((resolve) => {
        let owner = ''
        net.connect(LOCK_PORT, '127.0.0.1')
            .on('data', (data) => (owner += data))
            .on('end', () => resolve(owner))
            .on('error', () => resolve('another run'))
    })
}

// Takes the lock, waiting for it unless `wait` is false (then it throws).
export async function acquireDeviceLock({ wait = true } = {}) {
    const me = `pid ${process.pid} in ${process.cwd()}: ${process.argv.slice(1).join(' ')}`
    let announced = false
    while (!(await tryLock(me))) {
        const owner = await lockOwner()
        if (!wait) throw new Error(`The devices are in use (${owner}).`)
        if (!announced) console.log(`Waiting for the devices (${owner})`)
        announced = true
        await new Promise((resolve) => setTimeout(resolve, 2000))
    }
}

// Run as a script: hold the lock while running a command.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const [command, ...args] = process.argv.slice(2)
    if (!command) {
        console.error('Usage: node scripts/device-lock.mts <command> [args...]')
        process.exit(2)
    }
    await acquireDeviceLock()
    const child = spawn(command, args, { stdio: 'inherit' })
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
        process.on(signal, () => child.kill(signal))
    }
    child.on('exit', (code) => process.exit(code ?? 1))
}
