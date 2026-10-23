// The ARIA props (and id, tabIndex) as the accessibility props the native view
// takes, and `focusable` as React Native tvOS's isTVSelectable. React
// Native's View and Image map them in JS, as here: their native views don't
// read the aria-* props.
import { Platform } from 'react-native'
import type { FastImageProps } from './index'

// The props mapped here.
export const ARIA_KEYS = [
    'alt',
    'aria-busy',
    'aria-checked',
    'aria-disabled',
    'aria-expanded',
    'aria-hidden',
    'aria-label',
    'aria-labelledby',
    'aria-live',
    'aria-selected',
    'aria-valuemax',
    'aria-valuemin',
    'aria-valuenow',
    'aria-valuetext',
    'id',
    'tabIndex',
] as const

type AriaProps = Pick<
    FastImageProps,
    | (typeof ARIA_KEYS)[number]
    | 'accessible'
    | 'accessibilityState'
    | 'accessibilityValue'
    | 'focusable'
>

const ARIA_KEY_SET: ReadonlySet<string> = new Set(ARIA_KEYS)

// React Native tvOS's focus prop, which FastImageProps doesn't have.
type TVProps = { isTVSelectable?: boolean | null }

// The props without the ARIA keys, with the accessibility props they map to.
type NativeProps<P> = Omit<P & FastImageProps, (typeof ARIA_KEYS)[number]> &
    TVProps

export function resolveAriaProps<P extends AriaProps>(
    props: P,
): NativeProps<P> {
    // Most images have none of them (nor `focusable` on iOS): their props go
    // on as they are, without a copy. Their own keys are checked (a few), not
    // ARIA_KEYS (15 lookups of keys they don't have, several times slower).
    const ios = Platform.OS === 'ios'
    let hasAria = ios && props.focusable != null
    if (!hasAria) {
        for (const key in props) {
            if (ARIA_KEY_SET.has(key) && props[key as keyof P] !== undefined) {
                hasAria = true
                break
            }
        }
    }
    if (!hasAria) return props as NativeProps<P>
    // The same keys as ARIA_KEYS (a test checks each one is mapped).
    const {
        alt,
        'aria-busy': ariaBusy,
        'aria-checked': ariaChecked,
        'aria-disabled': ariaDisabled,
        'aria-expanded': ariaExpanded,
        'aria-hidden': ariaHidden,
        'aria-label': ariaLabel,
        'aria-labelledby': ariaLabelledBy,
        'aria-live': ariaLive,
        'aria-selected': ariaSelected,
        'aria-valuemax': ariaValueMax,
        'aria-valuemin': ariaValueMin,
        'aria-valuenow': ariaValueNow,
        'aria-valuetext': ariaValueText,
        id,
        tabIndex,
        ...rest
    } = props
    // A copy, so it's written to (React Native's Strict TypeScript API
    // declares the props read-only).
    const native = rest as {
        -readonly [K in keyof FastImageProps]: FastImageProps[K]
    } & TVProps
    // As View.js: a value given, null too, replaces the prop it maps to.
    if (ariaLabel !== undefined) native.accessibilityLabel = ariaLabel
    // alt after both, as in React Native's Image; an empty one is none.
    else if (native.accessibilityLabel == null && isLabel(alt)) {
        native.accessibilityLabel = alt
    }
    // A string is a list of ids, as in View.js; another value (e.g. an array,
    // accessibilityLabelledBy's form) goes on as it is, as in Image.
    if (ariaLabelledBy != null) {
        native.accessibilityLabelledBy =
            typeof ariaLabelledBy === 'string'
                ? ariaLabelledBy.split(/\s*,\s*/g)
                : ariaLabelledBy
    }
    if (ariaLive !== undefined) {
        native.accessibilityLiveRegion = ariaLive === 'off' ? 'none' : ariaLive
    }
    if (ariaHidden !== undefined) {
        native.accessibilityElementsHidden = ariaHidden
        if (ariaHidden === true) {
            native.importantForAccessibility = 'no-hide-descendants'
            // iOS reads `accessible` for whether the image is an
            // accessibility element (accessibilityElementsHidden only hides
            // its children), as for React Native's Image.
            if (ios) native.accessible = false
        }
    }
    if (id !== undefined) native.nativeID = id
    if (tabIndex !== undefined) native.focusable = !tabIndex
    // On iOS, `focusable` is also the isTVSelectable React Native tvOS reads
    // for focus, on Apple TV and iPhone alike, as its View.js sets it
    // (`focusable ?? isTVSelectable ?? false`), and so the one tabIndex gives
    // (View.js takes the `focusable` prop, so tabIndex does nothing there).
    // `focusable` stays, where View.js deletes it: React Native reads it on
    // Apple TV from 0.88, and a version without isTVSelectable leaves that
    // out. Without focusable, an isTVSelectable given goes on as it is.
    if (ios && native.focusable != null)
        native.isTVSelectable = native.focusable
    // On iOS, an image with aria-label or alt is an accessibility element
    // unless `accessible` says otherwise or accessibilityElementsHidden hides
    // it, as an <img aria-label> or <img alt> on the web and React Native's
    // Image with `alt`: iOS reads `accessible` for it. Android's TalkBack
    // reads the label either way, and `accessible` would make the image a
    // stop of its own, splitting a Pressable's announcement in two. An empty
    // label is none, as on the web (a decorative image), and so is a blank
    // one.
    if (
        ios &&
        (isLabel(ariaLabel) || isLabel(alt)) &&
        native.accessible === undefined &&
        !native.accessibilityElementsHidden
    ) {
        native.accessible = true
    }
    if (
        ariaBusy != null ||
        ariaChecked != null ||
        ariaDisabled != null ||
        ariaExpanded != null ||
        ariaSelected != null
    ) {
        const state = props.accessibilityState
        native.accessibilityState = {
            busy: ariaBusy ?? state?.busy,
            checked: ariaChecked ?? state?.checked,
            disabled: ariaDisabled ?? state?.disabled,
            expanded: ariaExpanded ?? state?.expanded,
            selected: ariaSelected ?? state?.selected,
        }
    }
    if (
        ariaValueMax != null ||
        ariaValueMin != null ||
        ariaValueNow != null ||
        ariaValueText != null
    ) {
        const value = props.accessibilityValue
        native.accessibilityValue = {
            max: ariaValueMax ?? value?.max,
            min: ariaValueMin ?? value?.min,
            now: ariaValueNow ?? value?.now,
            text: ariaValueText ?? value?.text,
        }
    }
    return native as NativeProps<P>
}

// A label to read: a string that isn't empty or blank.
function isLabel(value: unknown): value is string {
    return typeof value === 'string' && value.trim() !== ''
}
