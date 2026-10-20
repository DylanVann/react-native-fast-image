// React Native's `ImageURISource` cache values, which the views' `source`
// takes so a source typed for React Native's Image works as it is. Not
// documented: Fast Image's own values are the ones to use. Native reads
// 'only-if-cached' as 'cacheOnly', and the others as the default, 'immutable'.
declare const __DEV__: boolean | undefined

export type ReactNativeCache =
    | 'default'
    | 'reload'
    | 'force-cache'
    | 'only-if-cached'

const REACT_NATIVE_CACHE: unknown[] = [
    'default',
    'reload',
    'force-cache',
    'only-if-cached',
]

export const isReactNativeCache = (cache: unknown): cache is ReactNativeCache =>
    REACT_NATIVE_CACHE.includes(cache)

let warnedReload = false

// For the tests: the warning is once per app.
export function resetReloadWarning() {
    warnedReload = false
}

// Warns once for a source (or one of several) with 'reload', as the image
// isn't loaded again each time.
export function warnIfReload(source: unknown) {
    if (warnedReload || typeof __DEV__ === 'undefined' || !__DEV__) return
    for (const entry of Array.isArray(source) ? source : [source]) {
        if (
            (entry as { cache?: unknown } | null | undefined)?.cache ===
            'reload'
        ) {
            warnedReload = true
            console.warn(
                "react-native-fast-image: `cache: 'reload'` loads the image as the default, `'immutable'`: it isn't loaded again each time. For an image that changes at the same url, use `cache: 'web'` (it follows the server's cache headers), or change its `cacheKey`.",
            )
            return
        }
    }
}
