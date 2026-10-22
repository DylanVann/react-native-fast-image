import { warnOnce } from './warnings'

// React Native's global: true in development.
declare const __DEV__: boolean | undefined

// A source with its headers as native takes them: strings only. Numbers,
// booleans and BigInts become strings with String(), as fetch's Headers
// converts them. Null and undefined values are left out (headers that aren't
// set), and so are values that can't be sent (objects, functions), with a
// warning in development, as is `headers` that isn't an object. The same
// object when every value is already a string, so a source isn't copied
// unless it has to be.
export function withStringHeaders<T>(source: T): T {
    const headers = (source as { headers?: unknown } | null | undefined)
        ?.headers
    if (headers == null) return source
    if (typeof headers !== 'object' || Array.isArray(headers)) {
        warn("`headers` isn't an object, so none are sent")
        const { headers: _, ...rest } = source as { headers?: unknown }
        return rest as T
    }
    const values = headers as Record<string, unknown>
    const names = Object.keys(values)
    let sent: Record<string, string> | undefined
    let left: string[] | undefined
    for (let i = 0; i < names.length; i++) {
        const value = values[names[i]]
        if (typeof value === 'string') {
            if (sent) sent[names[i]] = value
            continue
        }
        // The first value that isn't a string: copy the ones before it.
        if (!sent) {
            sent = {}
            for (let j = 0; j < i; j++)
                sent[names[j]] = values[names[j]] as string
        }
        if (
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            typeof value === 'bigint'
        ) {
            sent[names[i]] = String(value)
        } else if (value != null) {
            ;(left ??= []).push(`"${names[i]}"`)
        }
    }
    if (left) {
        warn(
            `the headers ${left.join(', ')} are objects or functions, so they aren't sent`,
        )
    }
    return sent ? ({ ...source, headers: sent } as T) : source
}

function warn(message: string) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
        warnOnce('headers', `react-native-fast-image: ${message}.`, 'warn')
    }
}
