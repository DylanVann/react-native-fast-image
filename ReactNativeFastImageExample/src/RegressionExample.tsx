import React, { useEffect, useRef, useState } from 'react'
import {
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableWithoutFeedback,
    View,
} from 'react-native'
import FastImage, { FastImageProps, Source } from 'react-native-fast-image'
import { useStatusBarHeight } from './StatusBarUnderlay'
import { imageUrl } from './imageServer'

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
const LOGO = imageUrl('logo.png')
const MISSING = imageUrl('does-not-exist.png')
const PRELOAD = imageUrl('picsum/1025-200x200.jpg')

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
    // Only run the onMount given on the first render.
    const mount = useRef(onMount)
    useEffect(() => {
        mount.current?.()
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

// FastImage as a Touchable's direct child. The flow taps it; passes when
// onPress fires. The Touchable passes onClick to its child, which crashed on
// iOS ("unrecognized selector ... setOnClick:").
function TouchableCase() {
    const [pressed, setPressed] = useState(false)
    return (
        <View style={styles.row}>
            <TouchableWithoutFeedback
                testID="regression-touchable-image"
                onPress={() => setPressed(true)}
            >
                <FastImage style={styles.image} source={{ uri: LOGO }} />
            </TouchableWithoutFeedback>
            <View style={styles.text}>
                <Text testID="regression-touchable" style={styles.status}>
                    touchable: {pressed ? 'OK' : 'tap the image'}
                </Text>
                <Text style={styles.description}>
                    #1020: FastImage as a Touchable's direct child (iOS crashed)
                </Text>
            </View>
        </View>
    )
}

// A FastImage with pointerEvents="none" over a Pressable. The flow taps the
// Pressable's position; passes when it gets the press. pointerEvents went to
// the image inside FastImage's wrapper, which still took the touch.
function PointerEventsCase() {
    const [pressed, setPressed] = useState(false)
    return (
        <View style={styles.row}>
            <View>
                <Pressable
                    testID="regression-pointer-events-target"
                    style={styles.image}
                    onPress={() => setPressed(true)}
                />
                <FastImage
                    pointerEvents="none"
                    style={[styles.image, StyleSheet.absoluteFill]}
                    source={{ uri: LOGO }}
                />
            </View>
            <View style={styles.text}>
                <Text testID="regression-pointer-events" style={styles.status}>
                    pointer-events: {pressed ? 'OK' : 'tap the image'}
                </Text>
                <Text style={styles.description}>
                    #393: pointerEvents="none" lets touches through
                </Text>
            </View>
        </View>
    )
}

// A wide image in square boxes: the left one is contain; the right one loads
// as cover, then switches to contain. Both should match (checked by
// screenshot). Android kept showing the cover crop.
// A stable source object: a new one on each render re-sends the source prop,
// which reloaded the image and hid the bug.
const WIDE = { uri: imageUrl('picsum/1018-600x300.jpg') }
function ResizeModeChangeCase() {
    const [resizeMode, setResizeMode] = useState<'cover' | 'contain'>('cover')
    const [done, setDone] = useState(false)
    useEffect(() => {
        if (resizeMode === 'cover') return
        const timer = setTimeout(() => setDone(true), 1500)
        return () => clearTimeout(timer)
    }, [resizeMode])
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                resizeMode="contain"
                source={WIDE}
            />
            <FastImage
                style={[styles.image, { marginLeft: 4 }]}
                resizeMode={resizeMode}
                source={WIDE}
                onLoad={() => setResizeMode('contain')}
            />
            <View style={styles.text}>
                <Text testID="regression-resize-mode" style={styles.status}>
                    resize-mode: {done ? 'OK' : 'waiting'}
                </Text>
                <Text style={styles.description}>
                    #762: resizeMode changed after load (should match the left
                    image)
                </Text>
            </View>
        </View>
    )
}

// Changes a prop that doesn't affect loading (accessibilityLabel) a few times
// after the image loads, and passes if it didn't load again. Android reloaded
// on every prop update.
function NoReloadCase() {
    const [loaded, setLoaded] = useState(false)
    const [reloads, setReloads] = useState(0)
    const [label, setLabel] = useState(0)
    const [done, setDone] = useState(false)
    useEffect(() => {
        if (!loaded) return
        const interval = setInterval(() => setLabel((l) => l + 1), 200)
        const timer = setTimeout(() => {
            clearInterval(interval)
            setDone(true)
        }, 2000)
        return () => {
            clearInterval(interval)
            clearTimeout(timer)
        }
    }, [loaded])
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={WIDE}
                accessibilityLabel={`image ${label}`}
                // Only count load starts after the first load.
                onLoadStart={() => loaded && setReloads((n) => n + 1)}
                onLoad={() => setLoaded(true)}
            />
            <View style={styles.text}>
                <Text testID="regression-no-reload" style={styles.status}>
                    no-reload:{' '}
                    {!done
                        ? 'waiting'
                        : reloads === 0
                          ? 'OK'
                          : `reloaded ${reloads} times`}
                </Text>
                <Text style={styles.description}>
                    Unrelated prop changes don't reload the image (Android did)
                </Text>
            </View>
        </View>
    )
}

// Cycles one FastImage through three urls, then passes when the last one
// loads. On Android the view stayed in the progress map under every url it had
// loaded, which kept it (and its Activity) alive.
const SWAP = [1020, 1021, 1022].map((id) => ({
    uri: imageUrl(`picsum/${id}-120x120.jpg`),
}))
function SourceSwapCase() {
    const [index, setIndex] = useState(0)
    const [done, setDone] = useState(false)
    const [loaded, setLoaded] = useState(false)
    useEffect(() => {
        const interval = setInterval(() => setIndex((i) => i + 1), 400)
        const timer = setTimeout(() => {
            clearInterval(interval)
            setDone(true)
        }, 3000)
        return () => {
            clearInterval(interval)
            clearTimeout(timer)
        }
    }, [])
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={SWAP[index % SWAP.length]}
                onLoadStart={() => setLoaded(false)}
                onLoad={() => setLoaded(true)}
            />
            <View style={styles.text}>
                <Text testID="regression-source-swap" style={styles.status}>
                    source-swap: {done && loaded ? 'OK' : 'waiting'}
                </Text>
                <Text style={styles.description}>
                    #384: changing source keeps loading (Android leaked the
                    view)
                </Text>
            </View>
        </View>
    )
}

// Counts onLoadStart until the image loads; passes if it fired once. iOS sent
// it twice when source and onLoadStart were set together.
function LoadStartOnceCase() {
    const [loadStarts, setLoadStarts] = useState(0)
    const [loaded, setLoaded] = useState(false)
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={{ uri: PRELOAD }}
                onLoadStart={() => !loaded && setLoadStarts((n) => n + 1)}
                onLoad={() => setLoaded(true)}
            />
            <View style={styles.text}>
                <Text testID="regression-load-start-once" style={styles.status}>
                    load-start-once:{' '}
                    {!loaded
                        ? 'waiting'
                        : loadStarts === 1
                          ? 'OK'
                          : `onLoadStart fired ${loadStarts} times`}
                </Text>
                <Text style={styles.description}>
                    onLoadStart fires once per load (iOS sent it twice)
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

// Preloads an image with a header, then shows an image whose request fails if
// it has that header. iOS set preload headers on the shared downloader, so
// every later request sent them. (That preload still sends its own headers
// isn't checked here: preload doesn't report when it's done.) The url is new
// each launch, since the disk cache would otherwise have it from the last run.
const RUN = Date.now()
const PRIVATE = imageUrl(`private/picsum/1021-120x120.jpg?run=${RUN}`)
const NO_TOKEN = imageUrl(`no-token/picsum/1022-120x120.jpg?run=${RUN}`)
function PreloadHeadersCase() {
    const [shown, setShown] = useState(false)
    const [result, setResult] = useState<'waiting' | 'OK' | 'failed'>('waiting')
    useEffect(() => {
        FastImage.preload([
            { uri: PRIVATE, headers: { 'x-token': 'fast-image' } },
        ])
        const timer = setTimeout(() => setShown(true), 1000)
        return () => clearTimeout(timer)
    }, [])
    return (
        <View style={styles.row}>
            {shown ? (
                <FastImage
                    style={styles.image}
                    source={{ uri: NO_TOKEN }}
                    onLoad={() => setResult('OK')}
                    onError={() => setResult('failed')}
                />
            ) : (
                <View style={styles.image} />
            )}
            <View style={styles.text}>
                <Text testID="regression-preload-headers" style={styles.status}>
                    preload-headers: {result}
                </Text>
                <Text style={styles.description}>
                    #571: preload headers aren't sent with other images (iOS
                    sent them with every later request)
                </Text>
            </View>
        </View>
    )
}

// Loads an image into a 60×60 view and checks onLoad reports the image's own
// size, as iOS does. Android reported the size of the bitmap it decoded to fit
// the view.
function SourceSizeCase({
    id,
    description,
    uri,
    width,
    height,
}: {
    id: string
    description: string
    uri: string
    width: number
    height: number
}) {
    const [size, setSize] = useState<string>()
    const expected = `${width}x${height}`
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                resizeMode="contain"
                source={{ uri }}
                onLoad={(e) =>
                    setSize(`${e.nativeEvent.width}x${e.nativeEvent.height}`)
                }
            />
            <View style={styles.text}>
                <Text testID={`regression-${id}`} style={styles.status}>
                    {id}:{' '}
                    {size === undefined
                        ? 'waiting'
                        : size === expected
                          ? 'OK'
                          : `${size}, expected ${expected}`}
                </Text>
                <Text style={styles.description}>{description}</Text>
            </View>
        </View>
    )
}

// Loads the same image three times: decoded, from the memory cache, and after
// clearing the memory cache (on Android, from the disk cache of resized
// images, which Glide only uses for local images like this asset). Each
// onLoad should report the image's own size.
const CACHED_SOURCE = Platform.select({
    android: 'asset:/fastimage-logo.png',
    default: imageUrl('logo.png'),
})
function SourceSizeCachedCase() {
    const [step, setStep] = useState(0)
    const [sizes, setSizes] = useState<string[]>([])
    const done = sizes.length === 3
    const ok = done && sizes.every((s) => s === '1000x1000')
    return (
        <View style={styles.row}>
            {done ? (
                <View style={styles.image} />
            ) : (
                <FastImage
                    key={step}
                    style={styles.image}
                    resizeMode="contain"
                    source={{ uri: CACHED_SOURCE }}
                    onLoad={(e) => {
                        const size = `${e.nativeEvent.width}x${e.nativeEvent.height}`
                        setSizes((s) => [...s, size])
                        if (step === 0) setStep(1)
                        else if (step === 1) {
                            FastImage.clearMemoryCache().then(() => setStep(2))
                        }
                    }}
                />
            )}
            <View style={styles.text}>
                <Text
                    testID="regression-source-size-cached"
                    style={styles.status}
                >
                    source-size-cached:{' '}
                    {!done ? 'waiting' : ok ? 'OK' : sizes.join(', ')}
                </Text>
                <Text style={styles.description}>
                    onLoad reports the image's size when it comes from a cache
                    (expected 1000x1000 three times)
                </Text>
            </View>
        </View>
    )
}

// Plays a GIF once (loop={false}), then switches to loop={true} after 3 s: it
// should start playing again and keep looping (orange and purple).
function GifLoopChangeCase() {
    const [loop, setLoop] = useState(false)
    useEffect(() => {
        const timer = setTimeout(() => setLoop(true), 3000)
        return () => clearTimeout(timer)
    }, [])
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                loop={loop}
                source={{ uri: imageUrl('loop-forever-2.gif') }}
            />
            <View style={styles.text}>
                <Text testID="regression-gif-loop-change" style={styles.status}>
                    gif-loop-change: {loop ? 'OK' : 'waiting'}
                </Text>
                <Text style={styles.description}>
                    Changing loop from false to true plays the GIF again and
                    keeps looping (orange and purple)
                </Text>
            </View>
        </View>
    )
}

// Loads an image with `cache: 'web'` from a url the server marks as cacheable
// for an hour, loads it again, then asks the server how many times it was
// requested: once, if the second load came from the HTTP cache. Android sent
// every request to the network (#280).
const WEB_PATH = `/max-age/picsum/1025-200x200.jpg?web=${RUN}`
function WebCacheCase() {
    const [loads, setLoads] = useState(0)
    const [requests, setRequests] = useState<number>()
    useEffect(() => {
        if (loads !== 2) return
        fetch(imageUrl(`requests?path=${encodeURIComponent(WEB_PATH)}`))
            .then((response) => response.json())
            .then((json) => setRequests(json.count))
            .catch(() => setRequests(-1))
    }, [loads])
    return (
        <View style={styles.row}>
            {loads < 2 ? (
                <FastImage
                    key={loads}
                    style={styles.image}
                    source={{
                        uri: imageUrl(WEB_PATH.slice(1)),
                        cache: FastImage.cacheControl.web,
                    }}
                    onLoad={() => setLoads((n) => n + 1)}
                />
            ) : (
                <View style={styles.image} />
            )}
            <View style={styles.text}>
                <Text testID="regression-web-cache" style={styles.status}>
                    web-cache:{' '}
                    {requests === undefined
                        ? 'waiting'
                        : requests === 1
                          ? 'OK'
                          : `requested ${requests} times`}
                </Text>
                <Text style={styles.description}>
                    #280: cache web follows the server's caching headers
                    (Android requested it again)
                </Text>
            </View>
        </View>
    )
}

// Loads an image that 404s and passes when onError's message has the status
// code. onError had no details (#200).
function ErrorMessageCase() {
    const [error, setError] = useState<string>()
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={{ uri: MISSING }}
                onError={(e) => setError(e.nativeEvent.error)}
            />
            <View style={styles.text}>
                <Text testID="regression-error-message" style={styles.status}>
                    error-message:{' '}
                    {error === undefined
                        ? 'waiting'
                        : error.includes('404')
                          ? 'OK'
                          : error}
                </Text>
                <Text style={styles.description}>
                    #200: onError says what went wrong (here a 404)
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
            <NoCrashCase
                id="preload-unresolved"
                description="#849: preload with a uri that can't be resolved (Android crashed)"
                onMount={() =>
                    FastImage.preload([{ uri: 'not-a-real-image.jpg' }])
                }
            />
            <ClearTintCase />
            <LayoutCase id="layout" />
            <LayoutCase id="layout-fallback" fallback />
            <EventCase
                id="fallback-require"
                description="#1044: fallback with a require()d image (should show the logo)"
                event="onLoad"
                source={require('./images/logo.png')}
                fallback
            />
            <TouchableCase />
            <EventCase
                id="tint-style"
                description="#946: tintColor in style (should be green)"
                event="onLoad"
                source={{ uri: LOGO }}
                style={[styles.image, { tintColor: 'green' }]}
            />
            <PointerEventsCase />
            <ErrorMessageCase />
            <EventCase
                id="error-invalid-data-uri"
                description="A data: uri that isn't an image fires onError (iOS fired onLoad with 0x0)"
                event="onError"
                source={{ uri: 'data:image/png;base64,bm90IGFuIGltYWdl' }}
            />
            <EventCase
                id="error-empty-uri"
                description="#1028: an empty uri fires onError (Android didn't)"
                event="onError"
                source={{ uri: '' }}
            />
            <EventCase
                id="error-null-uri-default"
                description="#945: a null uri fires onError and shows defaultSource (Android showed nothing)"
                event="onError"
                source={{ uri: null as unknown as string }}
                defaultSource={DEFAULT}
            />
            <ResizeModeChangeCase />
            <NoReloadCase />
            <SourceSwapCase />
            <LoadStartOnceCase />
            <EventCase
                id="zero-size"
                description="#865: a 0×0 image still loads (Android never did)"
                event="onLoad"
                source={{ uri: imageUrl('picsum/1020-120x120.jpg') }}
                style={{ width: 0, height: 0 }}
            />
            <EventCase
                id="zero-height"
                description="#865: an image with a width but no height still loads"
                event="onLoad"
                source={{ uri: imageUrl('picsum/1021-120x120.jpg') }}
                style={{ width: 60, height: 0 }}
            />
            {Platform.OS === 'android' ? (
                <EventCase
                    id="asset-uri"
                    description="#1068: an asset:/ uri (a file in the app's Android assets) loads"
                    event="onLoad"
                    source={{ uri: 'asset:/fastimage-logo.png' }}
                />
            ) : (
                <NoCrashCase
                    id="asset-uri"
                    description="#1068: asset:/ uris are Android only"
                />
            )}
            <SourceSizeCase
                id="source-size"
                description="#608: onLoad reports the image's size, not the size decoded for the view (600x300)"
                uri={imageUrl('picsum/1018-600x300.jpg')}
                width={600}
                height={300}
            />
            <SourceSizeCase
                id="source-size-gif"
                description="#608: the same for a GIF (500x281)"
                uri={imageUrl('jellyfish.gif')}
                width={500}
                height={281}
            />
            <SourceSizeCachedCase />
            <PreloadCase />
            <PreloadHeadersCase />
            <NoCrashCase
                id="gif-loop-once"
                description="#651: a GIF without a loop count plays once and stops on cyan (Android looped every GIF forever)"
            >
                <FastImage
                    style={styles.image}
                    source={{ uri: imageUrl('loop-once.gif') }}
                />
            </NoCrashCase>
            <NoCrashCase
                id="gif-loop-true"
                description="loop={true}: a GIF that plays once by itself keeps looping (yellow and green)"
            >
                <FastImage
                    style={styles.image}
                    loop
                    source={{ uri: imageUrl('loop-once-2.gif') }}
                />
            </NoCrashCase>
            <GifLoopChangeCase />
            <NoCrashCase
                id="gif-loop-false"
                description="loop={false}: a GIF that loops forever by itself plays once and stops on blue"
            >
                <FastImage
                    style={styles.image}
                    loop={false}
                    source={{ uri: imageUrl('loop-forever.gif') }}
                />
            </NoCrashCase>
            <WebCacheCase />
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
