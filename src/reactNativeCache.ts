// React Native's `ImageURISource` cache values, which the views' `source`
// takes so a source typed for React Native's Image works as it is. Not
// documented: Fast Image's own values are the ones to use.
import { warnOnce } from './warnings'

declare const __DEV__: boolean | undefined

export type ReactNativeCache =
    | 'default'
    | 'reload'
    | 'force-cache'
    | 'only-if-cached'

// The source with React Native's cache value as Fast Image's: 'only-if-cached'
// is 'cacheOnly', and the others are the default, 'immutable' ('reload' with a
// warning, as the image isn't loaded again each time). Anything else is
// returned as it is, so an unchanged source stays the same object.
export function fromReactNativeCache<T>(source: T): T {
    if (!source || typeof source !== 'object' || !('cache' in source)) {
        return source
    }
    const { cache, ...rest } = source as { cache?: unknown }
    if (cache === 'only-if-cached') return { ...rest, cache: 'cacheOnly' } as T
    if (cache !== 'default' && cache !== 'reload' && cache !== 'force-cache') {
        return source
    }
    if (cache === 'reload' && typeof __DEV__ !== 'undefined' && __DEV__) {
        warnOnce(
            'cache-reload',
            "react-native-fast-image: `cache: 'reload'` loads the image as the default, `'immutable'`: it isn't loaded again each time. For an image that changes at the same url, use `cache: 'web'` (it follows the server's cache headers), or change its `cacheKey`.",
            'warn',
        )
    }
    return rest as T
}
