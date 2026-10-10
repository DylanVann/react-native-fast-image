// objectFit, from the prop, the style or resizeMode, shared by the native
// (index.tsx) and web (index.web.tsx) versions.
import { StyleSheet } from 'react-native'
import type { ImageStyle, ObjectFit, ResizeMode } from './index'

// Finds a key (tintColor, objectFit) in a style prop, where the last style
// that sets it wins, as with StyleSheet.flatten, but without flattening (which
// allocates a merged object for an array style on every render).
export function fromStyle<K extends 'tintColor' | 'objectFit'>(
    style: unknown,
    key: K,
): ImageStyle[K] {
    if (Array.isArray(style)) {
        for (let i = style.length - 1; i >= 0; i--) {
            const found = fromStyle(style[i], key)
            if (found !== undefined) return found
        }
        return undefined
    }
    if (typeof style === 'number') {
        // A registered style from StyleSheet.create on older React Native.
        const flattened = StyleSheet.flatten(style as any) as
            | ImageStyle
            | undefined
        return flattened ? flattened[key] : undefined
    }
    return style && typeof style === 'object'
        ? (style as ImageStyle)[key]
        : undefined
}

// resizeMode as objectFit, and the two objectFit doesn't have: repeat, and
// center, which is scale-down except that Android shows an image smaller than
// the view at its size in pixels on the screen (scale-down: in dp).
const RESIZE_MODE_FIT = {
    contain: 'contain',
    cover: 'cover',
    stretch: 'fill',
    center: 'center',
    repeat: 'repeat',
} as const

const FITS: Record<ObjectFit, true> = {
    fill: true,
    contain: true,
    cover: true,
    none: true,
    'scale-down': true,
}

// The objectFit prop, then style's, then resizeMode (null, or a value that
// isn't one of objectFit's, counts as not set).
export function resolveObjectFit(
    objectFit: ObjectFit | null | undefined,
    style: unknown,
    resizeMode: ResizeMode,
): ObjectFit | 'repeat' | 'center' {
    const fit = objectFit != null ? objectFit : fromStyle(style, 'objectFit')
    if (fit && FITS[fit] === true) return fit
    return RESIZE_MODE_FIT[resizeMode] ?? 'cover'
}
