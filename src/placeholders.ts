// Placeholders given as strings (`placeholder`, and a source's `blurDataUri`)
// are data uris, shared by the native (index.tsx) and web (index.web.tsx)
// versions, or for `placeholder`, the name of an image bundled with the app.
// They're decoded at once, so they show in the view's first frame; a url
// would load like an image (and on iOS and Android, not at all), so it's
// ignored, with a warning in development.
import type { SourcePlaceholder } from './index'
import { warnOnce } from './warnings'

// Metro's (and React Native's Jest preset's) development flag; other web
// bundlers may not define it.
declare const __DEV__: boolean | undefined

// Whether `placeholder` is the name of an image bundled with the app (an iOS
// asset catalog image, an Android drawable): no scheme, not a path.
export function isImageName(value: string): boolean {
    return !/^[a-z][a-z\d+.-]*:/i.test(value) && !value.startsWith('/')
}

// Whether a source has a thumbhash or blurDataUri, or `placeholder` is one
// (for every size of the source) rather than an image.
export function hasSourcePlaceholder(
    value: unknown,
): value is SourcePlaceholder {
    return (
        !!value &&
        typeof value === 'object' &&
        ('thumbhash' in value || 'blurDataUri' in value)
    )
}

// The value if it's a data uri, otherwise undefined (with a warning for
// another string).
export function dataUri(value: unknown): string | undefined {
    if (typeof value !== 'string' || value === '') return undefined
    if (/^data:/i.test(value)) return value
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
        warnOnce(
            'placeholder-url',
            `react-native-fast-image: \`placeholder\` and \`blurDataUri\` don't load urls: "${value.slice(0, 60)}" is ignored. Use a data uri (data:image/…), or for \`placeholder\`, a require()d image or the name of an image bundled with the app.`,
            'warn',
        )
    }
    return undefined
}
