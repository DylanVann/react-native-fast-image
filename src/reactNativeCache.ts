// React Native's `ImageURISource` cache values, which the views' `source`
// takes so a source typed for React Native's Image works as it is. Not
// documented: Fast Image's own values are the ones to use. Native reads
// 'only-if-cached' as 'cacheOnly', and the others as the default, 'immutable'.
import { warnOnce } from './warnings'

declare const __DEV__: boolean | undefined

export type ReactNativeCache =
    | 'default'
    | 'reload'
    | 'force-cache'
    | 'only-if-cached'

// Warns for a source with 'reload', as the image isn't loaded again each time.
export function warnIfReload(source: unknown) {
    if (
        typeof __DEV__ !== 'undefined' &&
        __DEV__ &&
        (source as { cache?: unknown } | null | undefined)?.cache === 'reload'
    ) {
        warnOnce(
            'cache-reload',
            "react-native-fast-image: `cache: 'reload'` loads the image as the default, `'immutable'`: it isn't loaded again each time. For an image that changes at the same url, use `cache: 'web'` (it follows the server's cache headers), or change its `cacheKey`.",
            'warn',
        )
    }
}
