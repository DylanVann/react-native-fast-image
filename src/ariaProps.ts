// The ARIA props (and id, tabIndex) as the accessibility props the native view
// takes. React Native's View and Image map them in JS, as here: their native
// views don't read the aria-* props.
import { Platform } from 'react-native'
import type { FastImageProps } from './index'

type AriaProps = Pick<
    FastImageProps,
    | 'aria-busy'
    | 'aria-checked'
    | 'aria-disabled'
    | 'aria-expanded'
    | 'aria-hidden'
    | 'aria-label'
    | 'aria-labelledby'
    | 'aria-live'
    | 'aria-selected'
    | 'aria-valuemax'
    | 'aria-valuemin'
    | 'aria-valuenow'
    | 'aria-valuetext'
    | 'id'
    | 'tabIndex'
    | 'accessible'
    | 'accessibilityState'
    | 'accessibilityValue'
>

export function resolveAriaProps<P extends AriaProps>(props: P) {
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
        ...resolved
    } = props
    const native = resolved as Omit<P, keyof AriaProps> & FastImageProps
    if (ariaLabel !== undefined) native.accessibilityLabel = ariaLabel
    if (ariaLabelledBy !== undefined) {
        native.accessibilityLabelledBy = ariaLabelledBy.split(/\s*,\s*/g)
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
    return native
}
