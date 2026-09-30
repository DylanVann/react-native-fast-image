import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react'
import {
    PixelRatio,
    Platform,
    StyleProp,
    StyleSheet,
    Text as NativeText,
    TextProps,
    TextStyle,
    View,
} from 'react-native'

// The example's Text. In the regression runner it's checked for being cut
// off, which fails the group (see useTextCheck). `cutOffOk`: it may be cut
// off (a status that's one line so it doesn't move what's below).
export function Text({
    cutOffOk,
    onLayout,
    ...props
}: TextProps & { cutOffOk?: boolean }) {
    const register = useContext(TextCheckContext)
    const [key] = useState(() => ({}))
    const box = useRef<{ width: number; height: number } | undefined>(undefined)
    const { style, children } = props
    // What the check needs, again whenever it changes (a new status can
    // leave the size as it was, without a layout event).
    const update = useCallback(() => {
        if (!register || !box.current) return
        register(key, cutOffOk ? null : { style, children, ...box.current })
    }, [register, key, cutOffOk, style, children])
    useEffect(update, [update])
    useEffect(() => () => register?.(key, null), [register, key])
    if (!register) return <NativeText onLayout={onLayout} {...props} />
    return (
        <NativeText
            {...props}
            onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout
                box.current = { width, height }
                update()
                onLayout?.(e)
            }}
        />
    )
}

type Entry = {
    style: StyleProp<TextStyle>
    children: React.ReactNode
    width: number
    height: number
}

// Registers a text (by a key of its own; null removes it). Null outside the
// runner.
const TextCheckContext = createContext<
    ((key: object, entry: Entry | null) => void) | null
>(null)

// For the runner: checks a group's texts for being cut off. When asked
// (check), it lays out a hidden copy of each text at the width it's drawn at,
// without numberOfLines, and a text whose copy is taller doesn't fit its box.
// That catches ellipsized text, and on React Native 0.73's Android (11+) text
// drawn with more lines than its box was measured for: it's measured at its
// width rounded up to a whole pixel but drawn at the laid-out width, so a line
// that just fits wraps when drawn and the last one falls outside the box. On
// Android the copy's width is a hair under the drawn width, so rounding it up
// (as both architectures do for a set width) gives the drawn width. The copies
// are only laid out when asked, all at once, in a container of their own
// (`layer`): inserting them next to the texts, in parents Android's New
// Architecture flattens, crashed its mounting now and then.
export function useTextCheck() {
    const texts = useRef(new Map<object, Entry>())
    const register = useCallback((key: object, entry: Entry | null) => {
        if (entry) texts.current.set(key, entry)
        else texts.current.delete(key)
    }, [])
    const [copies, setCopies] = useState<{
        run: number
        entries: Entry[]
    }>({ run: 0, entries: [] })
    const heights = useRef(new Map<number, number>())
    const laidOut = useRef<(() => void) | undefined>(undefined)
    // Resolves with the texts that are cut off.
    const check = useCallback(
        () =>
            new Promise<string[]>((resolve) => {
                const entries = [...texts.current.values()]
                heights.current = new Map()
                const finish = () => {
                    laidOut.current = undefined
                    resolve(
                        entries
                            .filter(
                                (entry, i) =>
                                    (heights.current.get(i) ?? 0) >
                                    entry.height + 0.5,
                            )
                            .map((entry) => textOf(entry.children)),
                    )
                }
                if (entries.length === 0) return finish()
                const timer = setTimeout(finish, 2000)
                laidOut.current = () => {
                    if (heights.current.size < entries.length) return
                    clearTimeout(timer)
                    finish()
                }
                setCopies((c) => ({ run: c.run + 1, entries }))
            }),
        [],
    )
    const scale = PixelRatio.get()
    const layer = (
        <View
            collapsable={false}
            pointerEvents="none"
            style={styles.layer}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
        >
            {copies.entries.map((entry, i) => (
                <NativeText
                    // New views for each check, so each sends its layout.
                    key={`${copies.run}-${i}`}
                    style={[
                        entry.style,
                        styles.copy,
                        {
                            width:
                                Platform.OS === 'android'
                                    ? (Math.round(entry.width * scale) - 0.05) /
                                      scale
                                    : entry.width,
                        },
                    ]}
                    onLayout={(e) => {
                        heights.current.set(i, e.nativeEvent.layout.height)
                        laidOut.current?.()
                    }}
                >
                    {entry.children}
                </NativeText>
            ))}
        </View>
    )
    return { register, check, layer, Provider: TextCheckContext.Provider }
}

const textOf = (children: React.ReactNode): string =>
    React.Children.toArray(children)
        .map((child) =>
            typeof child === 'object'
                ? textOf(
                      (child as React.ReactElement<TextProps>).props.children,
                  )
                : String(child),
        )
        .join('')

const styles = StyleSheet.create({
    layer: {
        position: 'absolute',
        left: 0,
        top: 0,
        opacity: 0,
    },
    copy: {
        position: 'absolute',
        left: 0,
        top: 0,
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
