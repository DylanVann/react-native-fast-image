// React Native's `ImageURISource` cache values, which the views' `source`
// takes so a source typed for React Native's Image works as it is. Not
// documented: Fast Image's own values are the ones to use.
declare const __DEV__: boolean | undefined

export type ReactNativeCache =
    | 'default'
    | 'reload'
    | 'force-cache'
    | 'only-if-cached'

let warnedReload = false

// For the tests: the warning is once per app.
export function resetReloadWarning() {
    warnedReload = false
}

// The source with React Native's 'only-if-cached' as 'cacheOnly'. Its other
// values are left to native, which loads a value it doesn't know as the
// default, 'immutable' ('reload' warns here, as the image isn't loaded again
// each time). Any other source is returned as it is.
export function fromReactNativeCache<T>(source: T): T {
    if (!source || typeof source !== 'object' || !('cache' in source)) {
        return source
    }
    const { cache } = source as { cache?: unknown }
    if (
        cache === 'reload' &&
        !warnedReload &&
        typeof __DEV__ !== 'undefined' &&
        __DEV__
    ) {
        warnedReload = true
        console.warn(
            "react-native-fast-image: `cache: 'reload'` loads the image as the default, `'immutable'`: it isn't loaded again each time. For an image that changes at the same url, use `cache: 'web'` (it follows the server's cache headers), or change its `cacheKey`.",
        )
    }
    return cache === 'only-if-cached'
        ? { ...source, cache: 'cacheOnly' }
        : source
}
