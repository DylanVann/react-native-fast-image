// FastImage.resizeMode, priority and cacheControl (deprecated), shared by the
// native (index.tsx) and web (index.web.tsx) versions.

// resizeMode was removed in 10.0 and is ignored (objectFit instead): its
// values are kept so code that reads them, e.g. FastImage.resizeMode.contain,
// doesn't throw.
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
