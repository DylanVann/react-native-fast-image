import React, { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import FastImage, { FastImageProps } from 'react-native-fast-image'
import { useStatusBarHeight } from './StatusBarUnderlay'

// Cases for bugs that have been fixed. Each shows "<id>: OK" once its expected
// event arrives; maestro/regression.yaml waits for every OK. A crash fails the
// run because the app is gone.

const LOGO =
    'https://raw.githubusercontent.com/DylanVann/react-native-fast-image/main/ReactNativeFastImageExample/src/images/logo.png'
const MISSING = 'https://picsum.photos/does-not-exist.png'

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
