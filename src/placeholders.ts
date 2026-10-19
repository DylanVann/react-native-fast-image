// Placeholders given as strings, shared by the native (index.tsx) and web
// (index.web.tsx) versions: a source's `blurDataUri` is a data uri, decoded at
// once, so it shows in the view's first frame (a url there is ignored, with a
// warning in development). `placeholder` can also be the name of an image
// bundled with the app, or a url, loaded as a source (placeholderSource).
import type { PlaceholderSource, SourcePlaceholder } from './index'
import { warnOnce } from './warnings'

// Metro's (and React Native's Jest preset's) development flag; other web
// bundlers may not define it.
declare const __DEV__: boolean | undefined

const SCHEME = /^[a-z][a-z\d+.-]*:/i

// Whether `placeholder` is the name of an image bundled with the app (an iOS
// asset catalog image, an Android drawable): no scheme, not a path.
export function isImageName(value: string): boolean {
    return !SCHEME.test(value) && !value.startsWith('/')
}

// `placeholder` as a source to load: an http or https url, as a string or a
// source object's uri. Undefined for anything else (a local file or a data uri
// is decoded at once, as the native placeholder prop).
export function placeholderSource(
    value: unknown,
): PlaceholderSource | undefined {
    const uri =
        typeof value === 'string'
            ? value
            : value && typeof value === 'object'
              ? (value as PlaceholderSource).uri
              : undefined
    if (typeof uri !== 'string' || !/^https?:/i.test(uri)) return undefined
    return typeof value === 'string' ? { uri } : (value as PlaceholderSource)
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
            `react-native-fast-image: \`blurDataUri\` takes a data uri (data:image/…): "${value.slice(0, 60)}" is ignored. For a placeholder loaded from a url, use \`placeholder\`.`,
            'warn',
        )
    }
    return undefined
}
