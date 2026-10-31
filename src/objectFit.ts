// objectFit, from the prop or the style, shared by the native (index.tsx) and
// web (index.web.tsx) versions.
import { StyleSheet } from 'react-native'
import type { ImageStyle, ObjectFit } from './index'

// Finds keys (e.g. tintColor, objectFit) in a style prop, in one walk of it
// (each registered style flattened once), where the last style that has a key
// wins, as with StyleSheet.flatten, but without flattening (which allocates a
// merged object for an array style on every render). As there, a later
// style's `undefined` clears it (e.g. `height: undefined`). Each key's value,
// or undefined.
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
        // A registered style from StyleSheet.create on older React Native.
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

const FITS: Record<ObjectFit, true> = {
    fill: true,
    contain: true,
    cover: true,
    none: true,
    'scale-down': true,
}

// The objectFit prop, then style's (from readStyle), then cover (null, or a
// value that isn't one of objectFit's, counts as not set).
export function resolveObjectFit(
    objectFit: ObjectFit | null | undefined,
    values: StyleValues,
): ObjectFit {
    const fit = objectFit != null ? objectFit : values.objectFit
    return fit && FITS[fit] === true ? fit : 'cover'
}

// The sides a style leaves open, which follow the loaded image: a width (or
// height) of `auto` (opt-in: a side left out stays 0, as with React Native's
// Image, unless leftOut is 'open', for a source's own size), unless an
// absolutely positioned view's insets on both sides set it (e.g.
// StyleSheet.absoluteFill, as FastImageBackground's image has), or the
// style's aspectRatio sets it from the other side. Also whether the style has
// an aspectRatio (not `auto`).
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

// The style's values FastImage reads (tintColor, objectFit and the sides'), in
// one walk of the style: resolveObjectFit and openSides take them in place of
// the style.
export function readStyle(style: unknown) {
    return fromStyleKeys(style, STYLE_KEYS)
}

const STYLE_KEYS = ['tintColor', 'objectFit', ...SIDE_KEYS] as const

type StyleValues = ReturnType<typeof readStyle>

export function openSides(
    values: StyleValues,
    leftOut: 'closed' | 'open' = 'closed',
): { width: boolean; height: boolean; aspectRatio: boolean } {
    const { width, height } = values
    const setWidth = width != null && width !== 'auto'
    const setHeight = height != null && height !== 'auto'
    let openWidth = leftOut === 'open' ? !setWidth : width === 'auto'
    let openHeight = leftOut === 'open' ? !setHeight : height === 'auto'
    const aspectRatio =
        values.aspectRatio != null && values.aspectRatio !== 'auto'
    if (setWidth !== setHeight && aspectRatio) {
        openWidth = openHeight = false
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
    return { width: openWidth, height: openHeight, aspectRatio }
}

// Padding doesn't inset the image (it fills the view inside its borders), so
// it isn't laid out either: after the style, every padding is 0. (On the web;
// the native views' shadow node clears it, see
// FastImageViewComponentDescriptor.)
export const NO_PADDING = {
    padding: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingStart: 0,
    paddingEnd: 0,
    paddingBlock: 0,
    paddingBlockStart: 0,
    paddingBlockEnd: 0,
    paddingInline: 0,
    paddingInlineStart: 0,
    paddingInlineEnd: 0,
} as const

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
