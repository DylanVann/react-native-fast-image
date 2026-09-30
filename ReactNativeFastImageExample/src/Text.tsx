import React, { useContext, useEffect, useState } from 'react'
import {
    LayoutChangeEvent,
    PixelRatio,
    Platform,
    StyleSheet,
    Text as NativeText,
    TextProps,
} from 'react-native'
import { CutOffContext } from './RunnerContext'

// The example's Text. In the regression runner it reports text that's cut
// off, which fails the group: once it's laid out, a hidden copy is laid out
// at the width it's drawn at, without numberOfLines, and if the copy is
// taller the text doesn't fit its box. That catches ellipsized text, and on
// React Native 0.73's Android (11+) text drawn with more lines than its box
// was measured for: it's measured at its width rounded up to a whole pixel
// but drawn at the laid-out width, so a line that just fits wraps when drawn
// and the last one falls outside the box. On Android the copy's width is a
// hair under the drawn width, so rounding it up (as both architectures do for
// a set width) gives the drawn width. `cutOffOk`: it may be cut off (a status
// that's one line so it doesn't move what's below).
export function Text({
    cutOffOk,
    onLayout,
    ...props
}: TextProps & { cutOffOk?: boolean }) {
    const report = useContext(CutOffContext)
    const [key] = useState(() => ({}))
    const [box, setBox] = useState<{ width: number; height: number }>()
    const [copyHeight, setCopyHeight] = useState<number>()
    const cut =
        !cutOffOk &&
        box != null &&
        copyHeight != null &&
        copyHeight > box.height + 0.5
    const text = React.Children.toArray(props.children)
        .filter((child) => typeof child !== 'object')
        .join('')
    useEffect(() => {
        report?.(key, cut ? text : null)
    }, [report, key, cut, text])
    useEffect(() => () => report?.(key, null), [report, key])
    if (!report) return <NativeText onLayout={onLayout} {...props} />
    const scale = PixelRatio.get()
    return (
        <>
            <NativeText
                {...props}
                onLayout={(e: LayoutChangeEvent) => {
                    const { width, height } = e.nativeEvent.layout
                    setBox({ width, height })
                    onLayout?.(e)
                }}
            />
            {box && (
                <NativeText
                    style={[
                        props.style,
                        styles.copy,
                        {
                            width:
                                Platform.OS === 'android'
                                    ? (Math.round(box.width * scale) - 0.05) /
                                      scale
                                    : box.width,
                        },
                    ]}
                    onLayout={(e: LayoutChangeEvent) =>
                        setCopyHeight(e.nativeEvent.layout.height)
                    }
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    pointerEvents="none"
                >
                    {props.children}
                </NativeText>
            )}
        </>
    )
}

const styles = StyleSheet.create({
    copy: {
        position: 'absolute',
        left: 0,
        top: 0,
        opacity: 0,
        height: undefined,
        minHeight: undefined,
        maxHeight: undefined,
        minWidth: undefined,
        maxWidth: undefined,
        flex: undefined,
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: undefined,
        margin: 0,
    },
})
