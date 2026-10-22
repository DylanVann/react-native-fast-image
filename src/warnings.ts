// FastImage's development warnings and errors, each once per app (a list would
// repeat it for every image), shared by the native (index.tsx) and web
// (index.web.tsx) versions.
import { Children } from 'react'
import type { ReactNode } from 'react'

const warned = new Set<string>()

export function warnOnce(
    key: string,
    message: string,
    level: 'warn' | 'error',
) {
    if (!warned.has(key)) {
        warned.add(key)
        console[level](message)
    }
}

// For the tests (test/setup.ts): `bun test` loads this module once for the
// native and web versions' tests together.
export function resetWarnings() {
    warned.clear()
}

// FastImage doesn't render children: on native it's a single view, and the
// web version does the same. toArray, as a Touchable clones its child with
// children: undefined.
export function warnIfChildren(children: unknown) {
    if (Children.toArray(children as ReactNode).length > 0) {
        warnOnce(
            'children',
            "react-native-fast-image: FastImage doesn't render children (since 10.0): use FastImageBackground for content over an image.",
            'error',
        )
    }
}

// A source's `headers` that native leaves out: one that isn't an object, or a
// value that isn't a string (e.g. a token that's undefined, or a number from
// JSON). The image loads without them, so a server that needs them refuses it.
export function warnIfInvalidHeaders(source: unknown) {
    const headers = (source as { headers?: unknown } | null | undefined)
        ?.headers
    if (headers == null) return
    let message: string | undefined
    if (typeof headers !== 'object' || Array.isArray(headers)) {
        message = "`headers` isn't an object, so none are sent"
    } else {
        const names = Object.keys(headers).filter(
            (name) =>
                typeof (headers as Record<string, unknown>)[name] !== 'string',
        )
        if (names.length > 0) {
            message = `the headers ${names.map((name) => `"${name}"`).join(', ')} aren't strings, so they aren't sent`
        }
    }
    if (message) {
        warnOnce('headers', `react-native-fast-image: ${message}.`, 'warn')
    }
}
