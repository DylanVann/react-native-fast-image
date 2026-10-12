// objectPosition, as CSS's object-position, shared by the native (index.tsx)
// and web (index.web.tsx) versions: a CSS position string or an object of
// edges, resolved to what CSS computes for each axis.
import { warnOnce } from './warnings'

// Metro's (and React Native's Jest preset's) development flag; other web
// bundlers may not define it.
declare const __DEV__: boolean | undefined

/** A length in points (dp on Android), or a percentage: see [`objectPosition`](#objectposition). */
export type PositionLength = number | `${number}%`

/**
 * Where the image is in the view: see [`objectPosition`](#objectposition).
 */
export type ObjectPosition =
    | string
    | ((
          | { top?: PositionLength; bottom?: never }
          | { bottom: PositionLength; top?: never }
      ) &
          (
              | { left?: PositionLength; right?: never }
              | { right: PositionLength; left?: never }
          ))

// One axis as CSS computes it, calc(fraction * 100% + offset): the image's
// edge is at (view - image) * fraction + offset, in points.
export type ResolvedAxis = { fraction: number; offset: number }
export type ResolvedPosition = { x: ResolvedAxis; y: ResolvedAxis }

const START: ResolvedAxis = { fraction: 0, offset: 0 }
const CENTER: ResolvedAxis = { fraction: 0.5, offset: 0 }
const END: ResolvedAxis = { fraction: 1, offset: 0 }

/** The default, `50% 50%`. */
export const CENTERED: ResolvedPosition = { x: CENTER, y: CENTER }

type Keyword = 'left' | 'right' | 'top' | 'bottom' | 'center'
type Token = { keyword: Keyword } | { length: ResolvedAxis }

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i

// A length in px, a percentage, or 0 without a unit.
function length(text: string): ResolvedAxis | null {
    const lower = text.toLowerCase()
    if (lower.endsWith('%')) {
        const number = lower.slice(0, -1)
        return NUMBER.test(number)
            ? { fraction: Number(number) / 100, offset: 0 }
            : null
    }
    if (lower.endsWith('px')) {
        const number = lower.slice(0, -2)
        return NUMBER.test(number)
            ? { fraction: 0, offset: Number(number) }
            : null
    }
    return NUMBER.test(lower) && Number(lower) === 0 ? START : null
}

function token(text: string): Token | null {
    const lower = text.toLowerCase()
    if (
        lower === 'left' ||
        lower === 'right' ||
        lower === 'top' ||
        lower === 'bottom' ||
        lower === 'center'
    ) {
        return { keyword: lower }
    }
    const axis = length(text)
    return axis ? { length: axis } : null
}

const X: Partial<Record<Keyword, ResolvedAxis>> = {
    left: START,
    center: CENTER,
    right: END,
}
const Y: Partial<Record<Keyword, ResolvedAxis>> = {
    top: START,
    center: CENTER,
    bottom: END,
}

const x = (t: Token) => ('length' in t ? t.length : X[t.keyword])
const y = (t: Token) => ('length' in t ? t.length : Y[t.keyword])

// An offset from an edge: from the left or top as it is, from the right or
// bottom as 100% minus it.
function fromEdge(edge: Keyword, axis: ResolvedAxis): ResolvedAxis {
    return edge === 'left' || edge === 'top'
        ? axis
        : { fraction: 1 - axis.fraction, offset: -axis.offset || 0 }
}

// CSS's <position> (CSS Values 4), as object-position takes it: 1, 2 or 4
// values, keywords in any case, lengths in px or %, 0 without a unit. Null if
// it isn't one (CSS ignores it then).
function parse(text: string): ResolvedPosition | null {
    const tokens: Token[] = []
    for (const part of text.trim().split(/\s+/)) {
        const t = token(part)
        if (!t) return null
        tokens.push(t)
    }
    if (tokens.length === 1) {
        const [a] = tokens
        if ('keyword' in a && (a.keyword === 'top' || a.keyword === 'bottom')) {
            return { x: CENTER, y: Y[a.keyword]! }
        }
        return { x: x(a)!, y: CENTER }
    }
    if (tokens.length === 2) {
        const [a, b] = tokens
        // [left | center | right | <length-percentage>]
        // [top | center | bottom | <length-percentage>]
        const ax = x(a)
        const by = y(b)
        if (ax && by) return { x: ax, y: by }
        // Or two keywords in either order: [left | center | right] &&
        // [top | center | bottom].
        if ('keyword' in a && 'keyword' in b) {
            const bx = X[b.keyword]
            const ay = Y[a.keyword]
            if (bx && ay) return { x: bx, y: ay }
        }
        return null
    }
    if (tokens.length === 4) {
        // [[left | right] <length-percentage>] &&
        // [[top | bottom] <length-percentage>]
        const [a, b, c, d] = tokens
        if (
            !(
                'keyword' in a &&
                'length' in b &&
                'keyword' in c &&
                'length' in d
            )
        ) {
            return null
        }
        const horizontal = (k: Keyword) => k === 'left' || k === 'right'
        const vertical = (k: Keyword) => k === 'top' || k === 'bottom'
        if (horizontal(a.keyword) && vertical(c.keyword)) {
            return {
                x: fromEdge(a.keyword, b.length),
                y: fromEdge(c.keyword, d.length),
            }
        }
        if (vertical(a.keyword) && horizontal(c.keyword)) {
            return {
                x: fromEdge(c.keyword, d.length),
                y: fromEdge(a.keyword, b.length),
            }
        }
    }
    return null
}

const parsed = new Map<string, ResolvedPosition | null>()

function objectLength(value: unknown): ResolvedAxis | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? { fraction: 0, offset: value } : null
    }
    return typeof value === 'string' && value.endsWith('%')
        ? length(value)
        : null
}

/**
 * The position for objectPosition, or null if it isn't valid. A string is
 * CSS's syntax; an object has one of `top` and `bottom` and one of `left`
 * and `right`, each in points or a percentage, and a missing axis is
 * centered. Unset is centered.
 */
export function resolveObjectPosition(
    position: ObjectPosition | null | undefined,
): ResolvedPosition | null {
    if (position == null) return CENTERED
    if (typeof position === 'string') {
        // The same few strings, in every row of a list.
        let result = parsed.get(position)
        if (result === undefined) {
            result = parse(position)
            if (parsed.size < 100) parsed.set(position, result)
        }
        return result
    }
    if (typeof position !== 'object') return null
    const edges = position as Record<string, unknown>
    const axis = (start: Keyword, end: Keyword): ResolvedAxis | null => {
        const hasStart = edges[start] != null
        const hasEnd = edges[end] != null
        if (hasStart && hasEnd) return null
        if (!hasStart && !hasEnd) return CENTER
        const edge = hasStart ? start : end
        const value = objectLength(edges[edge])
        return value && fromEdge(edge, value)
    }
    const resolvedX = axis('left', 'right')
    const resolvedY = axis('top', 'bottom')
    return resolvedX && resolvedY ? { x: resolvedX, y: resolvedY } : null
}

// Without float noise (1 - 1.2 is -0.19999999999999996).
const round = (n: number) => Math.round(n * 1e6) / 1e6

/**
 * The position for objectPosition, or centered if it isn't valid (as CSS
 * ignores it), with a warning in development.
 */
export function objectPositionOrCentered(
    position: ObjectPosition | null | undefined,
): ResolvedPosition {
    const resolved = resolveObjectPosition(position)
    if (resolved) return resolved
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
        const value = JSON.stringify(position)
        warnOnce(
            `objectPosition ${value}`,
            `react-native-fast-image: objectPosition ${value} isn't a position, so the image is centered. Use CSS's syntax with px or % (e.g. 'right 10px bottom 20%'), or { top | bottom, left | right } in points or percentages.`,
            'warn',
        )
    }
    return CENTERED
}

/** The position as CSS (for the web version's object-position). */
export function cssPosition({ x, y }: ResolvedPosition) {
    const axis = ({ fraction, offset }: ResolvedAxis) => {
        const percent = round(fraction * 100)
        const px = round(offset)
        if (px === 0) return `${percent}%`
        if (percent === 0) return `${px}px`
        return `calc(${percent}% ${px < 0 ? '-' : '+'} ${Math.abs(px)}px)`
    }
    return `${axis(x)} ${axis(y)}`
}
