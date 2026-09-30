// FastImage.resizeMode, priority and cacheControl, shared by the native
// (index.tsx) and web (index.web.tsx) versions.

export const resizeMode = {
    contain: 'contain',
    cover: 'cover',
    stretch: 'stretch',
    center: 'center',
    repeat: 'repeat',
} as const

export const priority = {
    low: 'low',
    normal: 'normal',
    high: 'high',
} as const

export const cacheControl = {
    // Ignore headers, use uri as cache key, fetch only if not in cache.
    immutable: 'immutable',
    // Respect http headers, no aggressive caching.
    web: 'web',
    // Only load from cache.
    cacheOnly: 'cacheOnly',
} as const
