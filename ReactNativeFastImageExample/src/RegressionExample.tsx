import React, { useEffect, useState } from 'react'
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import FastImage, { FastImageProps, Source } from 'react-native-fast-image'
import { useStatusBarHeight } from './StatusBarUnderlay'

// Cases for bugs that have been fixed. Each shows "<id>: OK" once its expected
// event arrives; maestro/regression.yaml waits for every OK. A crash fails the
// run because the app is gone.

// In debug builds, Android only resolves a defaultSource that's bundled as a
// drawable (require() images come from Metro instead), so use one the app
// bundles, as require() images are in release builds.
const DEFAULT = Platform.select({
    android: { uri: 'rn_edit_text_material' } as unknown as number,
    default: require('./images/fields.jpg'),
})
const LOGO =
    'https://raw.githubusercontent.com/DylanVann/react-native-fast-image/main/ReactNativeFastImageExample/src/images/logo.png'
const MISSING = 'https://picsum.photos/does-not-exist.png'
const PRELOAD = 'https://picsum.photos/id/1025/200/200'

type EventName = 'onLoad' | 'onLoadEnd' | 'onError'

// Passes when `event` fires. With `removeAfter`, the handler is removed after
// it fires, which crashed on iOS before #1088.
function EventCase({
    id,
    description,
    event,
    removeAfter = false,
    ...props
}: {
    id: string
    description: string
    event: EventName
    removeAfter?: boolean
} & FastImageProps) {
    const [fired, setFired] = useState(false)
    const attached = !(removeAfter && fired)
    const handlers = attached ? { [event]: () => setFired(true) } : {}
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                resizeMode="contain"
                {...props}
                {...handlers}
            />
            <View style={styles.text}>
                <Text testID={`regression-${id}`} style={styles.status}>
                    {id}: {fired ? 'OK' : 'waiting'}
                </Text>
                <Text style={styles.description}>{description}</Text>
            </View>
        </View>
    )
}

// Passes if the app is still running a moment after this mounts (and runs
// `onMount`). For bugs that crashed the app instead of failing an event.
function NoCrashCase({
    id,
    description,
    onMount,
    children,
}: {
    id: string
    description: string
    onMount?: () => void
    children?: React.ReactNode
}) {
    const [ok, setOk] = useState(false)
    useEffect(() => {
        onMount?.()
        const timer = setTimeout(() => setOk(true), 1500)
        return () => clearTimeout(timer)
    }, [])
    return (
        <View style={styles.row}>
            {children ?? <View style={styles.image} />}
            <View style={styles.text}>
                <Text testID={`regression-${id}`} style={styles.status}>
                    {id}: {ok ? 'OK' : 'waiting'}
                </Text>
                <Text style={styles.description}>{description}</Text>
            </View>
        </View>
    )
}

// Passes when onLayout reports the image's position in its parent (x = 10
// from its margin). It reported 0 when it came from the inner native view.
function LayoutCase({ id, fallback }: { id: string; fallback?: boolean }) {
    const [x, setX] = useState<number>()
    const ok = x !== undefined && Math.abs(x - 10) < 1
    return (
        <View style={styles.row}>
            <FastImage
                style={[styles.image, { marginLeft: 10 }]}
                source={{ uri: LOGO }}
                fallback={fallback}
                onLayout={(e) => setX(e.nativeEvent.layout.x)}
            />
            <View style={styles.text}>
                <Text testID={`regression-${id}`} style={styles.status}>
                    {id}: {ok ? 'OK' : x === undefined ? 'waiting' : `x=${x}`}
                </Text>
                <Text style={styles.description}>
                    #992: onLayout reports the position in the parent
                    {fallback ? ' (fallback)' : ''}
                </Text>
            </View>
        </View>
    )
}

// Loads a green-tinted image, then removes tintColor. The second image should
// match the untinted first one; this is checked by screenshot, since the flow
// can't read colors. It stayed tinted on iOS.
function ClearTintCase() {
    const [tinted, setTinted] = useState(true)
    const [done, setDone] = useState(false)
    useEffect(() => {
        if (tinted) return
        const timer = setTimeout(() => setDone(true), 500)
        return () => clearTimeout(timer)
    }, [tinted])
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                resizeMode="contain"
                source={{ uri: LOGO }}
            />
            <FastImage
                style={[styles.image, { marginLeft: 4 }]}
                resizeMode="contain"
                source={{ uri: LOGO }}
                tintColor={tinted ? 'green' : undefined}
                onLoad={() => setTinted(false)}
            />
            <View style={styles.text}>
                <Text testID="regression-clear-tint" style={styles.status}>
                    clear-tint: {done ? 'OK' : 'waiting'}
                </Text>
                <Text style={styles.description}>
                    #586: tintColor removed after load (should match the left
                    image)
                </Text>
            </View>
        </View>
    )
}

// Preloads an image, shows it a moment later, and passes when it loads. Not a
// fixed bug; it's here because this screen needs no scrolling, which makes it
// reliable across runners and architectures.
function PreloadCase() {
    const [shown, setShown] = useState(false)
    const [loaded, setLoaded] = useState(false)
    useEffect(() => {
        FastImage.preload([{ uri: PRELOAD }])
        const timer = setTimeout(() => setShown(true), 1000)
        return () => clearTimeout(timer)
    }, [])
    return (
        <View style={styles.row}>
            {shown ? (
                <FastImage
                    style={styles.image}
                    source={{ uri: PRELOAD }}
                    onLoad={() => setLoaded(true)}
                />
            ) : (
                <View style={styles.image} />
            )}
            <View style={styles.text}>
                <Text testID="regression-preload" style={styles.status}>
                    preload: {loaded ? 'OK' : 'waiting'}
                </Text>
                <Text style={styles.description}>
                    FastImage.preload, then show the image
                </Text>
            </View>
        </View>
    )
}

export default function RegressionExample() {
    const statusBarHeight = useStatusBarHeight()
    return (
        <ScrollView
            style={{ marginTop: statusBarHeight }}
            contentContainerStyle={styles.container}
        >
            <Text style={styles.title}>Regression checks</Text>
            <EventCase
                id="tint-remote"
                description="#1082: tintColor on a remote image with no defaultSource"
                event="onLoad"
                source={{ uri: LOGO }}
                tintColor="green"
            />
            <EventCase
                id="tint-404"
                description="#1082: tintColor on an image that fails to load"
                event="onError"
                source={{ uri: MISSING }}
                tintColor="green"
            />
            <EventCase
                id="remove-onLoad"
                description="#1088: onLoad removed after it fires"
                event="onLoad"
                removeAfter
                source={{ uri: LOGO }}
            />
            <EventCase
                id="remove-onLoadEnd"
                description="#1088: onLoadEnd removed after it fires"
                event="onLoadEnd"
                removeAfter
                source={{ uri: LOGO }}
            />
            <EventCase
                id="remove-onError"
                description="#1088: onError removed after it fires"
                event="onError"
                removeAfter
                source={{ uri: MISSING }}
            />
            <NoCrashCase
                id="default-no-source"
                description="#973: defaultSource with no source (Android crashed)"
            >
                <FastImage style={styles.image} defaultSource={DEFAULT} />
            </NoCrashCase>
            <NoCrashCase
                id="preload-no-uri"
                description="#774: preload with an empty, missing or null uri, or a null source (crashed)"
                onMount={() =>
                    FastImage.preload([
                        { uri: '' },
                        {},
                        { uri: null as unknown as string },
                        null as unknown as Source,
                    ])
                }
            />
            <ClearTintCase />
            <LayoutCase id="layout" />
            <LayoutCase id="layout-fallback" fallback />
            <PreloadCase />
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    container: {
        padding: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    image: {
        width: 48,
        height: 48,
        backgroundColor: '#eee',
    },
    text: {
        flex: 1,
        marginLeft: 12,
    },
    status: {
        fontWeight: '600',
    },
    description: {
        color: '#666',
        marginTop: 2,
    },
})
