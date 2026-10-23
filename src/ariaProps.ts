// The ARIA props (and id, tabIndex) as the accessibility props the native view
// takes. React Native's View and Image map them in JS, as here: their native
// views don't read the aria-* props.
import { Platform } from 'react-native'
import type { FastImageProps } from './index'

// The props mapped here.
export const ARIA_KEYS = [
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
>

const ARIA_KEY_SET: ReadonlySet<string> = new Set(ARIA_KEYS)

// The props without the ARIA keys, with the accessibility props they map to.
type NativeProps<P> = Omit<P & FastImageProps, (typeof ARIA_KEYS)[number]>

export function resolveAriaProps<P extends AriaProps>(
    props: P,
): NativeProps<P> {
    // Most images have none of them: their props go on as they are, without
    // a copy. Their own keys are checked (a few), not ARIA_KEYS (15 lookups of
    // keys they don't have, several times slower).
    let hasAria = false
    for (const key in props) {
        if (ARIA_KEY_SET.has(key) && props[key as keyof P] !== undefined) {
            hasAria = true
            break
        }
    }
    if (!hasAria) return props as NativeProps<P>
    // The same keys as ARIA_KEYS (a test checks each one is mapped).
    const {
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
    }
    // As View.js: a value given, null too, replaces the prop it maps to.
    if (ariaLabel !== undefined) native.accessibilityLabel = ariaLabel
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
            if (Platform.OS === 'ios') native.accessible = false
        }
    }
    if (id !== undefined) native.nativeID = id
    if (tabIndex !== undefined) native.focusable = !tabIndex
    // A labelled image is an accessibility element unless `accessible` says
    // otherwise or accessibilityElementsHidden hides it, as an <img
    // aria-label> on the web and React Native's Image with `alt`: iOS reads
    // `accessible` for it (Android reads the label either way, and its
    // importantForAccessibility, which iOS ignores). An empty label is none,
    // as on the web (a decorative image), and so is a blank one.
    if (
        typeof ariaLabel === 'string' &&
        ariaLabel.trim() !== '' &&
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
