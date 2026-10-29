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

// fromStyle for several keys, in one walk of the style (each registered style
// flattened once): each key's value, or undefined.
export function fromStyleKeys<K extends keyof ImageStyle>(
    style: unknown,
    keys: readonly K[],
): { [P in K]?: ImageStyle[P] } {
    const found: Record<string, unknown> = {}
    const missing = new Set<string>(keys)
    collectFromStyle(style, found, missing)
    return found as { [P in K]?: ImageStyle[P] }
}

function collectFromStyle(
    style: unknown,
    found: Record<string, unknown>,
    missing: Set<string>,
) {
    if (Array.isArray(style)) {
        for (let i = style.length - 1; i >= 0 && missing.size > 0; i--) {
            collectFromStyle(style[i], found, missing)
        }
        return
    }
    if (typeof style === 'number') {
        style = StyleSheet.flatten(style as any)
    }
    if (!style || typeof style !== 'object') return
    for (const key of missing) {
        if (key in style) {
            found[key] = (style as Record<string, unknown>)[key]
            missing.delete(key)
        }
    }
}

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

// The sides a style leaves open, which follow the loaded image: a width (or
// height) of `auto` (opt-in: a side left out stays 0, as with React Native's
// Image, unless leftOut is 'open', for a source's own size), unless an
// absolutely positioned view's insets on both sides set it (e.g.
// StyleSheet.absoluteFill, as FastImageBackground's image has), or the
// style's aspectRatio sets it from the other side.
const SIDE_KEYS = [
    'width',
    'height',
    'aspectRatio',
    'position',
    'inset',
    'insetInline',
    'insetInlineStart',
    'insetInlineEnd',
    'insetBlock',
    'insetBlockStart',
    'insetBlockEnd',
    'left',
    'right',
    'start',
    'end',
    'top',
    'bottom',
] as const

export function openSides(
    style: unknown,
    leftOut: 'closed' | 'open' = 'closed',
): { width: boolean; height: boolean } {
    const values = fromStyleKeys(style, SIDE_KEYS)
    const { width, height } = values
    const setWidth = width != null && width !== 'auto'
    const setHeight = height != null && height !== 'auto'
    let openWidth = leftOut === 'open' ? !setWidth : width === 'auto'
    let openHeight = leftOut === 'open' ? !setHeight : height === 'auto'
    if (setWidth !== setHeight) {
        const aspectRatio = values.aspectRatio
        if (aspectRatio != null && aspectRatio !== 'auto') {
            openWidth = openHeight = false
        }
    }
    if ((openWidth || openHeight) && values.position === 'absolute') {
        const set = (key: (typeof SIDE_KEYS)[number]) => values[key] != null
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

// A single source's own size in points (a require()d image's, or a source's
// width and height, as with React Native's Image), which the sides a style
// leaves open follow from the start instead of the loaded image's: they
// don't change when it loads. Undefined for several sources, or without both.
export function ownSize(
    source: unknown,
): { width: number; height: number } | undefined {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
        return undefined
    }
    const { width, height } = source as { width?: unknown; height?: unknown }
    return typeof width === 'number' &&
        typeof height === 'number' &&
        width > 0 &&
        height > 0
        ? { width, height }
        : undefined
}
