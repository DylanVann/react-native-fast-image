import React, { useEffect, useRef, useState } from 'react'
import { Platform, View } from 'react-native'
import FastImage, { LoadResult } from 'react-native-fast-image'
import { CaseStatus, caseStyles as styles } from './CaseStatus'
import { imageUrl } from './imageServer'
import type { RegressionGroup } from './RunnerContext'

// A few cases that check FastImage works at all in an app (the Expo example,
// ReactNativeFastImageExampleExpo, on iOS, Android and the web): an image
// loads, a missing one fails, a bundled one loads, preload reports its
// results, and the cache methods answer (on the web, that they aren't
// supported). The regression cases (RegressionExample.tsx) cover the rest.

// Busts the image caches between runs.
const RUN = Date.now()
const IMAGE = { uri: imageUrl(`picsum/1025-200x200.jpg?smoke=${RUN}`) }
const MISSING = { uri: imageUrl(`does-not-exist.png?smoke=${RUN}`) }

const describe = (result: LoadResult) => JSON.stringify(result)

// An image loads: onLoad's size, then onLoadEnd's result.
function LoadCase() {
    const [status, setStatus] = useState('loading')
    // A ref: onLoadEnd can come in the same tick as onLoad.
    const size = useRef<string>(undefined)
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={IMAGE}
                onLoad={(e) => {
                    size.current = `${e.nativeEvent.width}x${e.nativeEvent.height}`
                }}
                onLoadEnd={(result) =>
                    setStatus(
                        size.current === '200x200' &&
                            result?.ok &&
                            result.width === 200 &&
                            result.height === 200
                            ? 'OK'
                            : `onLoad ${size.current ?? 'not sent'}, onLoadEnd ${describe(result)}`,
                    )
                }
            />
            <CaseStatus
                id="smoke-load"
                status={status}
                description="A 200x200 image loads: onLoad with its size, then onLoadEnd with ok"
            />
        </View>
    )
}

// A missing image fails: onError's message, then onLoadEnd's result.
function ErrorCase() {
    const [status, setStatus] = useState('loading')
    // A ref: onLoadEnd can come in the same tick as onError.
    const error = useRef<string>(undefined)
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={MISSING}
                onError={(e) => {
                    error.current = e.nativeEvent.error
                }}
                onLoadEnd={(result) =>
                    setStatus(
                        typeof error.current === 'string' &&
                            error.current.length > 0 &&
                            result &&
                            !result.ok &&
                            result.error.length > 0
                            ? 'OK'
                            : `onError ${error.current ?? 'not sent'}, onLoadEnd ${describe(result)}`,
                    )
                }
            />
            <CaseStatus
                id="smoke-error"
                status={status}
                description="A missing image fails: onError with a message, then onLoadEnd with ok false"
            />
        </View>
    )
}

// A bundled (require()d) image loads at its size.
function BundledCase() {
    const [status, setStatus] = useState('loading')
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={require('./images/logo.png')}
                onLoad={(e) => {
                    const { width, height } = e.nativeEvent
                    setStatus(
                        width === 1000 && height === 1000
                            ? 'OK'
                            : `onLoad ${width}x${height}`,
                    )
                }}
                onError={(e) => setStatus(`error: ${e.nativeEvent.error}`)}
            />
            <CaseStatus
                id="smoke-bundled"
                status={status}
                description="A bundled (require()d) 1000x1000 image loads"
            />
        </View>
    )
}

// preload reports each source's result: the image loaded (with its size), the
// missing one didn't.
function PreloadCase() {
    const [status, setStatus] = useState('loading')
    useEffect(() => {
        FastImage.preload([
            { uri: imageUrl(`picsum/1021-120x120.jpg?smoke=${RUN}`) },
            MISSING,
        ]).then(([loaded, missing]) =>
            setStatus(
                loaded?.ok &&
                    loaded.width === 120 &&
                    loaded.height === 120 &&
                    missing &&
                    !missing.ok
                    ? 'OK'
                    : JSON.stringify([loaded, missing]),
            ),
        )
    }, [])
    return (
        <View style={styles.row}>
            <View style={styles.image} />
            <CaseStatus
                id="smoke-preload"
                status={status}
                description="preload of a 120x120 image and a missing one: ok with the size, then not ok"
            />
        </View>
    )
}

// getCachePath finds the loaded image's file (not supported on the web).
function CachePathCase() {
    const [status, setStatus] = useState('loading')
    const web = Platform.OS === 'web'
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={{
                    uri: imageUrl(`picsum/1022-120x120.jpg?smoke=${RUN}`),
                }}
                onLoad={async () => {
                    const result = await FastImage.getCachePath({
                        uri: imageUrl(`picsum/1022-120x120.jpg?smoke=${RUN}`),
                    })
                    const ok = web
                        ? !result.ok &&
                          result.error === 'Not supported on the web'
                        : result.ok && result.path.length > 0
                    setStatus(ok ? 'OK' : JSON.stringify(result))
                }}
            />
            <CaseStatus
                id="smoke-cache-path"
                status={status}
                description={
                    web
                        ? 'getCachePath says it is not supported on the web'
                        : "getCachePath gives the loaded image's file"
                }
            />
        </View>
    )
}

// The cache limits the app's config sets (app.config.js, through FastImage's
// Expo config plugin), as configureCache reports them. Android only has the
// disk size limit.
export const EXPO_CACHE_LIMITS = {
    maxDiskSize: 150 * 1024 * 1024,
    maxDiskAge: 7 * 24 * 60 * 60,
    maxMemorySize: 50 * 1024 * 1024,
}

function CacheLimitsCase() {
    const [status, setStatus] = useState('loading')
    useEffect(() => {
        FastImage.configureCache().then((state) => {
            const expected =
                Platform.OS === 'ios'
                    ? EXPO_CACHE_LIMITS
                    : { maxDiskSize: EXPO_CACHE_LIMITS.maxDiskSize }
            const ok = Object.entries(expected).every(
                ([name, value]) => state[name as keyof typeof state] === value,
            )
            setStatus(ok ? 'OK' : JSON.stringify(state))
        })
    }, [])
    return (
        <View style={styles.row}>
            <View style={styles.image} />
            <CaseStatus
                id="smoke-cache-limits"
                status={status}
                description="configureCache reports the limits the Expo config plugin set"
            />
        </View>
    )
}

export const SMOKE_GROUPS: RegressionGroup[] = [
    {
        name: 'smoke',
        cases: [
            <LoadCase key="load" />,
            <ErrorCase key="error" />,
            <BundledCase key="bundled" />,
            <PreloadCase key="preload" />,
            <CachePathCase key="cache-path" />,
            ...(Platform.OS === 'web'
                ? []
                : [<CacheLimitsCase key="cache-limits" />]),
        ],
    },
]
