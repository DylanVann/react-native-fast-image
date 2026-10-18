// Placeholders given as strings (`placeholder`, and a source's `blurDataUri`)
// are data uris, shared by the native (index.tsx) and web (index.web.tsx)
// versions. They're decoded at once, so they show in the view's first frame;
// a url would load like an image (and on iOS and Android, not at all), so
// it's ignored, with a warning in development.
import { warnOnce } from './warnings'

// Metro's (and React Native's Jest preset's) development flag; other web
// bundlers may not define it.
declare const __DEV__: boolean | undefined

// The value if it's a data uri, otherwise undefined (with a warning for
// another string).
export function dataUri(value: unknown): string | undefined {
    if (typeof value !== 'string' || value === '') return undefined
    if (/^data:/i.test(value)) return value
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
        warnOnce(
            'placeholder-url',
            `react-native-fast-image: \`placeholder\` and \`blurDataUri\` take a data uri (data:image/…), shown at once; "${value.slice(0, 60)}" isn't one, and is ignored. Use a require()d image, or a small image as a data uri.`,
            'warn',
        )
    }
    return undefined
}
