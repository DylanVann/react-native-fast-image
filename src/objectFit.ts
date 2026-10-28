// objectFit, from the prop or the style, shared by the native (index.tsx) and
// web (index.web.tsx) versions.
import { StyleSheet } from 'react-native'
import type { ImageStyle, ObjectFit } from './index'

// Finds a key (e.g. tintColor, objectFit) in a style prop, where the last
// style that has it wins, as with StyleSheet.flatten, but without flattening
// (which allocates a merged object for an array style on every render). As
// there, a later style's `undefined` clears it (e.g. `height: undefined`).
export function fromStyle<K extends keyof ImageStyle>(
    style: unknown,
    key: K,
): ImageStyle[K] {
    const found = findInStyle(style, key)
    return found === NOT_FOUND ? undefined : (found as ImageStyle[K])
}

const NOT_FOUND = {}

function findInStyle(style: unknown, key: string): unknown {
    if (Array.isArray(style)) {
        for (let i = style.length - 1; i >= 0; i--) {
            const found = findInStyle(style[i], key)
            if (found !== NOT_FOUND) return found
        }
        return NOT_FOUND
    }
    if (typeof style === 'number') {
        // A registered style from StyleSheet.create on older React Native.
        style = StyleSheet.flatten(style as any)
    }
    return style && typeof style === 'object' && key in style
        ? (style as Record<string, unknown>)[key]
        : NOT_FOUND
}

const FITS: Record<ObjectFit, true> = {
    fill: true,
    contain: true,
    cover: true,
    none: true,
    'scale-down': true,
}

// The objectFit prop, then style's, then cover (null, or a value that isn't
// one of objectFit's, counts as not set).
export function resolveObjectFit(
    objectFit: ObjectFit | null | undefined,
    style: unknown,
): ObjectFit {
    const fit = objectFit != null ? objectFit : fromStyle(style, 'objectFit')
    return fit && FITS[fit] === true ? fit : 'cover'
}

// The sides a style leaves open, which follow the loaded image: no width (or
// height), or `auto`, unless an absolutely positioned view's insets on both
// sides set it (e.g. StyleSheet.absoluteFill, as FastImageBackground's image
// has).
export function openSides(style: unknown): { width: boolean; height: boolean } {
    const width = fromStyle(style, 'width')
    const height = fromStyle(style, 'height')
    let openWidth = width == null || width === 'auto'
    let openHeight = height == null || height === 'auto'
    if (
        (openWidth || openHeight) &&
        fromStyle(style, 'position') === 'absolute'
    ) {
        const set = (key: keyof ImageStyle) => fromStyle(style, key) != null
        const inset = set('inset')
        openWidth &&=
            !inset &&
            !set('insetInline') &&
            !(
                (set('left') || set('start') || set('insetInlineStart')) &&
                (set('right') || set('end') || set('insetInlineEnd'))
            )
        openHeight &&=
            !inset &&
            !set('insetBlock') &&
            !(
                (set('top') || set('insetBlockStart')) &&
                (set('bottom') || set('insetBlockEnd'))
            )
    }
    return { width: openWidth, height: openHeight }
}
