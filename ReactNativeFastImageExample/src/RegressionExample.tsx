import React, { useContext, useEffect, useRef, useState } from 'react'
import {
    AppState,
    Image,
    NativeModules,
    PixelRatio,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableWithoutFeedback,
    View,
} from 'react-native'
import FastImage, {
    CachePathResult,
    FastImageBackground,
    FastImageProps,
    LoadResult,
    OnProgressEvent,
    PreloadResult,
    Source,
    Transition,
} from 'react-native-fast-image'
import { CaseStatus, caseStyles } from './CaseStatus'
import { useStatusBarHeight } from './StatusBarUnderlay'
import { imageUrl, slowImageUrl } from './imageServer'
import {
    Masked,
    measureView,
    RegressionGroup,
    SampleContext,
    sampleStatus,
} from './RunnerContext'

// Cases for bugs that have been fixed. Each shows "<id>: OK" once its expected
// event arrives. They're in REGRESSION_GROUPS, which the regression runner
// (RegressionRunner.tsx) shows a group at a time and reports over a WebSocket
// to scripts/verify.mts (which taps the `touch` group's cases with
// maestro/touch.yaml); the Regression tab shows all of them at once for a look
// by hand, plus the cases that send the app to the background
// (maestro/background.yaml). A crash fails the run because the app is gone.

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

// With `fallback`, FastImage renders React Native's Image, which fades an
// image in over 300 ms on Android after it loads. The fallback cases turn that
// off (FastImage passes other props on to Image), so the screenshot shows the
// image, not the fade. Not a FastImage prop, hence the cast.
const NO_FADE = { fadeDuration: 0 } as Partial<FastImageProps>

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
                {...(props.fallback ? NO_FADE : null)}
                {...props}
                {...handlers}
            />
            <CaseStatus
                id={id}
                status={fired ? 'OK' : 'waiting'}
                description={description}
            />
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
        const timer = setTimeout(() => setOk(true), 750)
        return () => clearTimeout(timer)
    }, [])
    return (
        <View style={styles.row}>
            {children ?? <View style={styles.image} />}
            <CaseStatus
                id={id}
                status={ok ? 'OK' : 'waiting'}
                description={description}
            />
        </View>
    )
}

// Passes when onLayout reports the image's position in its parent (x = 10
// from its margin), once the image has loaded. It reported 0 when it came
// from the inner native view.
function LayoutCase({ id, fallback }: { id: string; fallback?: boolean }) {
    const [x, setX] = useState<number>()
    const [loaded, setLoaded] = useState(false)
    const ok = loaded && x !== undefined && Math.abs(x - 10) < 1
    return (
        <View style={styles.row}>
            <FastImage
                style={[styles.image, { marginLeft: 10 }]}
                source={{ uri: LOGO }}
                fallback={fallback}
                {...(fallback ? NO_FADE : null)}
                onLayout={(e) => setX(e.nativeEvent.layout.x)}
                onLoad={() => setLoaded(true)}
            />
            <CaseStatus
                id={id}
                status={
                    ok
                        ? 'OK'
                        : x === undefined || !loaded
                          ? 'waiting'
                          : `x=${x}`
                }
                description={`#992: onLayout reports the position in the parent${
                    fallback ? ' (fallback)' : ''
                }`}
            />
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
            <CaseStatus
                id="clear-tint"
                status={done ? 'OK' : 'waiting'}
                description="#586: tintColor removed after load (should match the left image)"
            />
        </View>
    )
}

// FastImage as a Touchable's direct child. maestro/touch.yaml taps it; passes
// when onPress fires. The Touchable passes onClick to its child, which crashed on
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
            <CaseStatus
                id="touchable"
                status={pressed ? 'OK' : 'tap the image'}
                description="#1020: FastImage as a Touchable's direct child (iOS crashed)"
            />
        </View>
    )
}

// A FastImage with pointerEvents="none" over a Pressable. maestro/touch.yaml
// taps the Pressable's position; passes when it gets the press. pointerEvents went to
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
            <CaseStatus
                id="pointer-events"
                status={pressed ? 'OK' : 'tap the image'}
                description='#393: pointerEvents="none" lets touches through'
            />
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
        const timer = setTimeout(() => setDone(true), 750)
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
            <CaseStatus
                id="resize-mode"
                status={done ? 'OK' : 'waiting'}
                description="#762: resizeMode changed after load (should match the left image)"
            />
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
        }, 1000)
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
            <CaseStatus
                id="no-reload"
                status={
                    !done
                        ? 'waiting'
                        : reloads === 0
                          ? 'OK'
                          : `reloaded ${reloads} times`
                }
                description="Unrelated prop changes don't reload the image (Android did)"
            />
        </View>
    )
}

// Cycles one FastImage through three urls, moving to the next as each loads,
// and passes when the last one loads. On Android the view stayed in the
// progress map under every url it had loaded, which kept it (and its
// Activity) alive. A fixed number of swaps, so it always ends on the same
// image (1021) for the screenshot.
const SWAP = [1020, 1021, 1022].map((id) => ({
    uri: imageUrl(`picsum/${id}-120x120.jpg`),
}))
const SWAPS = 4
function SourceSwapCase() {
    const [index, setIndex] = useState(0)
    const [loaded, setLoaded] = useState(false)
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={SWAP[index % SWAP.length]}
                onLoadStart={() => setLoaded(false)}
                onLoad={() => {
                    if (index < SWAPS) setIndex(index + 1)
                    else setLoaded(true)
                }}
            />
            <CaseStatus
                id="source-swap"
                status={index === SWAPS && loaded ? 'OK' : 'waiting'}
                description="#384: changing source keeps loading (Android leaked the view)"
            />
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
            <CaseStatus
                id="load-start-once"
                status={
                    !loaded
                        ? 'waiting'
                        : loadStarts === 1
                          ? 'OK'
                          : `onLoadStart fired ${loadStarts} times`
                }
                description="onLoadStart fires once per load (iOS sent it twice)"
            />
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
        const timer = setTimeout(() => setShown(true), 500)
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
            <CaseStatus
                id="preload"
                status={loaded ? 'OK' : 'waiting'}
                description="FastImage.preload, then show the image"
            />
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
        const timer = setTimeout(() => setShown(true), 500)
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
            <CaseStatus
                id="preload-headers"
                status={result}
                description="#571: preload headers aren't sent with other images (iOS sent them with every later request)"
            />
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
            <CaseStatus
                id={id}
                status={
                    size === undefined
                        ? 'waiting'
                        : size === expected
                          ? 'OK'
                          : `${size}, expected ${expected}`
                }
                description={description}
            />
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
            <CaseStatus
                id="source-size-cached"
                status={!done ? 'waiting' : ok ? 'OK' : sizes.join(', ')}
                description="onLoad reports the image's size when it comes from a cache (expected 1000x1000 three times)"
            />
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
            <CaseStatus
                id="web-cache"
                status={
                    requests === undefined
                        ? 'waiting'
                        : requests === 1
                          ? 'OK'
                          : `requested ${requests} times`
                }
                description="#280: cache web follows the server's caching headers (Android requested it again)"
            />
        </View>
    )
}

// Loads an image with `cache: 'web'` that the server marks as cacheable for an
// hour, clears the caches, and loads it again: the server should get a second
// request. clearDiskCache left the HTTP cache of `web` images (Android's, and
// on iOS the app's shared NSURLCache), so it came from there.
const WEB_CLEAR_PATH = `/max-age/picsum/1025-200x200.jpg?web-clear=${RUN}`
function WebCacheClearCase() {
    const [step, setStep] = useState<'first' | 'cleared' | 'done'>('first')
    const [requests, setRequests] = useState<number>()
    useEffect(() => {
        if (step !== 'done') return
        fetch(imageUrl(`requests?path=${encodeURIComponent(WEB_CLEAR_PATH)}`))
            .then((response) => response.json())
            .then((json) => setRequests(json.count))
            .catch(() => setRequests(-1))
    }, [step])
    return (
        <View style={styles.row}>
            <FastImage
                // A new view for the second load, which stays (showing the
                // image) once it's done.
                key={step === 'first' ? 'first' : 'second'}
                style={styles.image}
                source={{
                    uri: imageUrl(WEB_CLEAR_PATH.slice(1)),
                    cache: FastImage.cacheControl.web,
                }}
                onLoad={() => {
                    if (step === 'first') {
                        Promise.all([
                            FastImage.clearMemoryCache(),
                            FastImage.clearDiskCache(),
                        ]).then(() => setStep('cleared'))
                    } else setStep('done')
                }}
            />
            <CaseStatus
                id="web-cache-clear"
                status={
                    requests === undefined
                        ? step
                        : requests === 2
                          ? 'OK'
                          : `requested ${requests} times`
                }
                description="clearDiskCache also clears the HTTP cache of cache web images (loaded again after clearing)"
            />
        </View>
    )
}

// Checks each onProgress event as it comes: a total above 0, loaded from 0 to
// the total and never going down, and progress equal to loaded / total (0 to
// 1). At onLoad, the last event (if there were any; with `required`, there
// must be) has all of it loaded and a progress of 1. Returns the first
// problem, or undefined.
function useProgressCheck(required = false) {
    const last = useRef<OnProgressEvent['nativeEvent']>(undefined)
    const [problem, setProblem] = useState<string>()
    const onProgress = (e: OnProgressEvent) => {
        const { loaded, total, progress } = e.nativeEvent
        const previous = last.current
        last.current = { loaded, total, progress }
        const bad =
            total <= 0
                ? `onProgress total ${total}`
                : loaded < 0 || loaded > total
                  ? `onProgress ${loaded}/${total}`
                  : previous && loaded < previous.loaded
                    ? `onProgress went from ${previous.loaded} to ${loaded}`
                    : typeof progress !== 'number' ||
                        Math.abs(progress - loaded / total) > 1e-9
                      ? `onProgress progress ${progress} for ${loaded}/${total}`
                      : undefined
        if (bad) setProblem((p) => p ?? bad)
    }
    const onLoad = () => {
        const final = last.current
        const bad = !final
            ? required
                ? 'no onProgress'
                : undefined
            : final.loaded !== final.total || final.progress !== 1
              ? `last onProgress ${final.loaded}/${final.total} (progress ${final.progress})`
              : undefined
        if (bad) setProblem((p) => p ?? bad)
    }
    return { problem, onProgress, onLoad }
}

// Loads an image with a Content-Length and checks its onProgress events: at
// least one, each with progress (loaded / total), the last one 1.
const PROGRESS = imageUrl(`picsum/1015-2048x2048.jpg?progress=${RUN}`)
function ProgressCase() {
    const check = useProgressCheck(true)
    const [loaded, setLoaded] = useState(false)
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={{ uri: PROGRESS }}
                onProgress={check.onProgress}
                onLoad={() => {
                    check.onLoad()
                    setLoaded(true)
                }}
            />
            <CaseStatus
                id="progress"
                status={!loaded ? 'waiting' : (check.problem ?? 'OK')}
                description="onProgress events have progress (loaded / total, 0 to 1), ending at 1"
            />
        </View>
    )
}

// Loads an image the server sends without a Content-Length, so its size is
// unknown while it loads (both platforms sent a total of -1, which made
// loaded / total negative), and checks its onProgress events.
const CHUNKED = imageUrl(`chunked/picsum/1015-2048x2048.jpg?run=${RUN}`)
function ProgressUnknownSizeCase() {
    const check = useProgressCheck()
    const [loaded, setLoaded] = useState(false)
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={{ uri: CHUNKED }}
                onProgress={check.onProgress}
                onLoad={() => {
                    check.onLoad()
                    setLoaded(true)
                }}
            />
            <CaseStatus
                id="progress-unknown-size"
                status={!loaded ? 'waiting' : (check.problem ?? 'OK')}
                description="onProgress with an unknown total (no Content-Length): none sent, or each one between 0 and the total"
            />
        </View>
    )
}

// Loads an image the server sends gzip-compressed, so its Content-Length is
// the compressed size, smaller than the image the client ends up with, and
// checks its onProgress events.
const GZIP = imageUrl(`gzip/picsum/1015-2048x2048.jpg?run=${RUN}`)
function ProgressGzipCase() {
    const check = useProgressCheck()
    const [loaded, setLoaded] = useState(false)
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={{ uri: GZIP }}
                onProgress={check.onProgress}
                onLoad={() => {
                    check.onLoad()
                    setLoaded(true)
                }}
            />
            <CaseStatus
                id="progress-gzip"
                status={!loaded ? 'waiting' : (check.problem ?? 'OK')}
                description="onProgress for a gzip-compressed image: loaded never goes past the total"
            />
        </View>
    )
}

// Gets two cookies with fetch, then loads an image the server only sends with
// both (and which sets a cookie of its own), then checks the image's cookie
// was kept for later requests. Android sent no cookies with images (iOS did).
// The cookie values are this run's, so cookies kept from earlier runs don't
// count.
const COOKIE_IMAGE = imageUrl(`cookie/logo.png?run=${RUN}`)
function CookiesCase() {
    const [cookiesSet, setCookiesSet] = useState(false)
    const [status, setStatus] = useState('waiting')
    useEffect(() => {
        fetch(imageUrl(`set-cookie?run=${RUN}`), { credentials: 'include' })
            .then(() => setCookiesSet(true))
            .catch((e) => setStatus(`fetch failed: ${e}`))
    }, [])
    const checkImageCookie = () =>
        fetch(imageUrl('cookies'), { credentials: 'include' })
            .then((response) => response.json())
            .then((json) =>
                setStatus(
                    json.cookie
                        .split(/;\s*/)
                        .includes(`fast-image-image=${RUN}`)
                        ? 'OK'
                        : `image cookie not kept (${json.cookie})`,
                ),
            )
            .catch((e) => setStatus(`fetch failed: ${e}`))
    return (
        <View style={styles.row}>
            {cookiesSet ? (
                <FastImage
                    style={styles.image}
                    source={{ uri: COOKIE_IMAGE }}
                    onLoad={checkImageCookie}
                    onError={() => setStatus('image failed (no cookies sent)')}
                />
            ) : (
                <View style={styles.image} />
            )}
            <CaseStatus
                id="cookies"
                status={status}
                description="Images are sent the cookies other requests got, and keep the ones they get (Android sent none)"
            />
        </View>
    )
}

// Counts an image's load events while the app goes to the background and
// comes back (maestro/background.yaml does that). With `slow`, the image is
// still loading when the app leaves, and has to finish after it returns
// (#758): the slow server sends half of it, then holds the rest until the app
// is back and releases it (or else a phone that keeps downloading in the
// background could finish it while away), still sending the source's header (the
// slow server needs it) and progress up to the total, with its tint (green,
// check the screenshot). Otherwise it has loaded, and mustn't load again
// (#1022). Passes 2 s after the app is back, if the image loaded exactly once.
const BACKGROUND_SLOW_HEADERS = { 'x-token': 'fast-image' }
function BackgroundCase({ id, slow }: { id: string; slow?: boolean }) {
    const [counts, setCounts] = useState({ start: 0, load: 0, error: 0 })
    // afterReturn: a progress event came after the app was back.
    const [progress, setProgress] = useState({
        loaded: 0,
        total: 0,
        afterReturn: false,
    })
    const [returned, setReturned] = useState(false)
    const [settled, setSettled] = useState(false)
    const wentAway = useRef(false)
    const hold = `${id}-${RUN}`
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'background') wentAway.current = true
            if (state === 'active' && wentAway.current) {
                setReturned(true)
                if (slow) {
                    fetch(imageUrl(`release?hold=${hold}`)).catch(() => {})
                }
            }
        })
        return () => subscription.remove()
    }, [hold, slow])
    useEffect(() => {
        if (!returned) return
        const timer = setTimeout(() => setSettled(true), 2000)
        return () => clearTimeout(timer)
    }, [returned])
    const count = (key: keyof typeof counts) => () =>
        setCounts((c) => ({ ...c, [key]: c[key] + 1 }))
    const path = `picsum/1022-120x120.jpg?${id}=${RUN}`
    const progressDone =
        progress.afterReturn &&
        progress.total > 0 &&
        progress.loaded === progress.total
    const summary =
        `start=${counts.start} load=${counts.load} error=${counts.error}` +
        (slow ? ` progress=${progress.loaded}/${progress.total}` : '')
    const ok =
        counts.start === 1 &&
        counts.load === 1 &&
        counts.error === 0 &&
        (!slow || progressDone)
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={
                    slow
                        ? {
                              uri: slowImageUrl(`${path}&hold=${hold}`),
                              headers: BACKGROUND_SLOW_HEADERS,
                          }
                        : { uri: imageUrl(path) }
                }
                tintColor={slow ? 'green' : undefined}
                onLoadStart={count('start')}
                onProgress={
                    slow
                        ? (e) => {
                              const back =
                                  wentAway.current &&
                                  AppState.currentState === 'active'
                              // Read the event now: the updater runs later.
                              const { loaded, total } = e.nativeEvent
                              setProgress((p) => ({
                                  loaded,
                                  total,
                                  afterReturn: p.afterReturn || back,
                              }))
                          }
                        : undefined
                }
                onLoad={count('load')}
                onError={count('error')}
            />
            <CaseStatus
                id={id}
                status={
                    !returned
                        ? `waiting for the app to come back (${summary})`
                        : !settled
                          ? `back (${summary})`
                          : ok
                            ? 'OK'
                            : summary
                }
                description={
                    slow
                        ? '#758: an image still loading when the app goes to the background finishes after it comes back, with its header, progress and tint (green)'
                        : "#1022: a loaded image doesn't load again when the app comes back from the background"
                }
            />
        </View>
    )
}

// The background cases load only once started, so the rest of the tab's
// cases aren't loading while the app goes to the background.
function BackgroundCases() {
    const [started, setStarted] = useState(false)
    if (started) {
        return (
            <>
                <BackgroundCase id="background-loaded" />
                <BackgroundCase id="background-loading" slow />
            </>
        )
    }
    return (
        <View style={styles.row}>
            <Pressable
                testID="regression-background-start"
                style={styles.image}
                onPress={() => setStarted(true)}
            />
            <View style={styles.text}>
                <Text style={styles.status}>background: tap the box</Text>
                <Text style={styles.description}>
                    Starts the background cases (#758, #1022), which
                    maestro/background.yaml runs: the app goes to the background
                    and comes back 20 s later
                </Text>
            </View>
        </View>
    )
}

// resizeMode center: a 600x300 image (red, with a blue border) is scaled down
// to fit the view, so the border shows (iOS showed it at full size, cropped to
// red); a 16x16 one (green) stays at its own size. Check the screenshot.
function CenterCase() {
    const [loaded, setLoaded] = useState(0)
    const onLoad = () => setLoaded((n) => n + 1)
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                resizeMode="center"
                source={{ uri: imageUrl('center-large.png') }}
                onLoad={onLoad}
            />
            <FastImage
                style={[styles.image, styles.gap]}
                resizeMode="center"
                source={{ uri: imageUrl('center-small.png') }}
                onLoad={onLoad}
            />
            <CaseStatus
                id="resize-center"
                status={loaded === 2 ? 'OK' : 'waiting'}
                description="#866: resizeMode center scales a larger image down (blue border shows) and keeps a smaller one at its size"
            />
        </View>
    )
}

// Preloads an image at a url that's new each launch (so the disk cache from an
// earlier run doesn't count), shows it once the preload has resolved, and asks
// the server how many times it was requested: once, if the shown image came
// from the preload. On Android, Glide keys loads by size, so a view can't join
// a preload of the same url still in flight: shown before the preload has
// finished, the image is downloaded again (#657). Awaiting the result avoids
// that. The ms are from showing the image to onLoad (a decode from the disk
// cache on Android; the memory cache on iOS).
const PRELOAD_REUSE_PATH = `/picsum/1025-200x200.jpg?reuse=${RUN}`
function PreloadReuseCase() {
    const [shownAt, setShownAt] = useState<number>()
    const [result, setResult] = useState<{ count: number; ms: number }>()
    useEffect(() => {
        FastImage.preload([{ uri: imageUrl(PRELOAD_REUSE_PATH.slice(1)) }])
            .then((results) => {
                if (results[0].ok) setShownAt(Date.now())
                else setResult({ count: 0, ms: 0 })
            })
            .catch(() => setResult({ count: -1, ms: 0 }))
    }, [])
    return (
        <View style={styles.row}>
            {shownAt === undefined ? (
                <View style={styles.image} />
            ) : (
                <FastImage
                    style={styles.image}
                    source={{ uri: imageUrl(PRELOAD_REUSE_PATH.slice(1)) }}
                    onLoad={() => {
                        const ms = Date.now() - shownAt
                        fetch(
                            imageUrl(
                                `requests?path=${encodeURIComponent(PRELOAD_REUSE_PATH)}`,
                            ),
                        )
                            .then((response) => response.json())
                            .then((json) =>
                                setResult({ count: json.count, ms }),
                            )
                            .catch(() => setResult({ count: -1, ms }))
                    }}
                />
            )}
            <CaseStatus
                id="preload-reuse"
                status={
                    result === undefined
                        ? 'waiting'
                        : result.count === 1
                          ? 'OK'
                          : result.count < 1
                            ? 'preload failed'
                            : `requested ${result.count} times (${result.ms} ms)`
                }
                description="#657: an image shown after FastImage.preload resolves isn't downloaded again"
            />
        </View>
    )
}

// Colors of the test images, and of an image view with nothing in it.
const MAGENTA = '#ff00ff'
const CYAN = '#00ffff'
const BLANK = '#eeeeee'

// Shows a magenta image, then changes the source to a cyan one that takes
// about 1 s (the slow server, 150 ms between parts), while the screen is
// recorded (a video sample, see RunnerContext.tsx). The view should go from
// magenta to cyan without showing blank in between (it flashed blank, #747);
// with `recycle`, recyclingKey changes too, and it should be blank while cyan
// loads (for views reused for other content). With `memoryCache` false the
// images aren't kept in memory, so the one shown comes from the disk cache
// while cyan loads (Android shows it from its cache).
function KeepPreviousCase({
    id,
    recycle,
    memoryCache,
}: {
    id: string
    recycle?: boolean
    memoryCache?: boolean
}) {
    const sample = useContext(SampleContext)
    const view = useRef<React.ComponentRef<typeof View>>(null)
    const [second, setSecond] = useState(false)
    const done = useRef(() => {})
    const [status, setStatus] = useState('loading the first image')
    const expect = recycle ? [MAGENTA, BLANK, CYAN] : [MAGENTA, CYAN]
    const onFirstLoad = async () => {
        const area = await measureView(view.current)
        if (!area) return setStatus('not on screen')
        setStatus('recording')
        const result = await sample(
            {
                name: id,
                area,
                durationMs: 5000,
                expect,
                palette: [MAGENTA, BLANK, CYAN],
            },
            (sampleDone) => {
                done.current = sampleDone
                setSecond(true)
            },
        )
        setStatus(sampleStatus(result, expect))
    }
    return (
        <View style={styles.row}>
            <View ref={view} collapsable={false}>
                <FastImage
                    style={styles.image}
                    source={
                        second
                            ? {
                                  uri: slowImageUrl(
                                      `cyan.png?${id}=${RUN}&delay=150`,
                                  ),
                                  headers: BACKGROUND_SLOW_HEADERS,
                                  memoryCache,
                              }
                            : {
                                  uri: imageUrl(`magenta.png?${id}=${RUN}`),
                                  memoryCache,
                              }
                    }
                    recyclingKey={
                        recycle ? (second ? 'second' : 'first') : null
                    }
                    onLoad={second ? () => done.current() : onFirstLoad}
                />
            </View>
            <CaseStatus
                id={id}
                status={status}
                description={
                    recycle
                        ? 'recyclingKey: changing it with the source clears the image (magenta) while the new one (cyan) loads (recorded: magenta, blank, cyan)'
                        : '#747: changing the source keeps the image (magenta) until the new one (cyan) has loaded (recorded: magenta, then cyan, never blank)'
                }
            />
        </View>
    )
}

const GREEN = '#008000'

// Tint over time (a video sample, see RunnerContext.tsx): shows an image
// tinted green (a GIF paused on its first frame), then, while the screen is
// recorded, plays the GIF, changes the tint to cyan, or removes it.
// blink-once.gif plays once: opaque (magenta), transparent, opaque, 400 ms
// each, so tinted it goes green, blank, green (iOS showed its first frame
// tinted, without playing it).
function TintSampleCase({
    id,
    uri,
    change,
    expect,
    description,
}: {
    id: string
    uri: string
    change: 'play' | 'recolor' | 'clear'
    expect: string[]
    description: string
}) {
    const sample = useContext(SampleContext)
    const view = useRef<React.ComponentRef<typeof View>>(null)
    const started = useRef(false)
    const [changed, setChanged] = useState(false)
    const [status, setStatus] = useState('loading')
    const onLoad = async () => {
        if (started.current) return
        started.current = true
        const area = await measureView(view.current)
        if (!area) return setStatus('not on screen')
        setStatus('recording')
        const result = await sample(
            {
                name: id,
                area,
                durationMs: 4000,
                expect,
                palette: [GREEN, CYAN, MAGENTA, BLANK],
            },
            (done) => {
                setChanged(true)
                // The GIF takes 1.2 s to play.
                setTimeout(done, change === 'play' ? 2000 : 500)
            },
        )
        setStatus(sampleStatus(result, expect))
    }
    const tintColor = !changed
        ? GREEN
        : change === 'recolor'
          ? CYAN
          : change === 'clear'
            ? undefined
            : GREEN
    return (
        <View style={styles.row}>
            <View ref={view} collapsable={false}>
                <FastImage
                    style={styles.image}
                    source={{ uri: imageUrl(`${uri}?${id}=${RUN}`) }}
                    tintColor={tintColor}
                    paused={!(changed && change === 'play')}
                    onLoad={onLoad}
                />
            </View>
            <CaseStatus id={id} status={status} description={description} />
        </View>
    )
}

// Clears the source while a slow image (cyan) is still loading. The load is
// cancelled: no onLoad, and the view stays blank (on Android the load kept
// going, and showed the image when it finished).
function SourceClearedWhileLoadingCase({ id }: { id: string }) {
    const [step, setStep] = useState<'loading' | 'cleared' | 'done'>('loading')
    const [loads, setLoads] = useState(0)
    useEffect(() => {
        // The slow image takes about 1.2 s.
        const cleared = setTimeout(() => setStep('cleared'), 400)
        // Once it would have finished, had it not been cancelled.
        const done = setTimeout(() => setStep('done'), 2000)
        return () => {
            clearTimeout(cleared)
            clearTimeout(done)
        }
    }, [])
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={
                    step === 'loading'
                        ? {
                              uri: slowImageUrl(
                                  `cyan.png?${id}=${RUN}&delay=150`,
                              ),
                              headers: BACKGROUND_SLOW_HEADERS,
                          }
                        : undefined
                }
                onLoad={() => setLoads((n) => n + 1)}
            />
            <CaseStatus
                id={id}
                status={
                    step !== 'done'
                        ? step
                        : loads
                          ? `${loads} onLoad after clearing the source`
                          : 'OK'
                }
                description="Clearing the source while a slow image loads: no onLoad, and the view stays blank (check the screenshot)"
            />
        </View>
    )
}

const cachedPhoto = (id: string) => ({
    uri: imageUrl(`picsum/1020-120x120.jpg?${id}=${RUN}`),
})
// An 8 × 8 yellow PNG.
const YELLOW_DATA_URI =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAE0lEQVR4nGP8dYIBK2DCLjxYJQBkHQHSoiSr7AAAAABJRU5ErkJggg=='

// Changes the source while a slow image (cyan) is still loading, to an image
// that's already in the memory cache (preloaded), so the first load is
// cancelled. It mustn't send onError or onLoad, or replace the new image.
// With `keepPrevious`, an image (magenta) is showing before the slow one, so
// that load keeps it while it loads. With `toData`, the new source is a data
// uri (yellow), which isn't loaded through SDWebImage on iOS.
function SourceChangeWhileLoadingCase({
    id,
    keepPrevious,
    toData,
}: {
    id: string
    keepPrevious?: boolean
    toData?: boolean
}) {
    const [step, setStep] = useState<
        'preload' | 'first' | 'slow' | 'changed' | 'done'
    >('preload')
    const [errors, setErrors] = useState<string[]>([])
    // onLoad events after the change.
    const [loads, setLoads] = useState(0)
    useEffect(() => {
        FastImage.preload([cachedPhoto(id)]).then(() =>
            setStep(keepPrevious ? 'first' : 'slow'),
        )
    }, [id, keepPrevious])
    useEffect(() => {
        if (step !== 'slow') return
        // The slow image takes about 1.2 s.
        const timer = setTimeout(() => setStep('changed'), 400)
        return () => clearTimeout(timer)
    }, [step])
    const source =
        step === 'preload'
            ? undefined
            : step === 'first'
              ? { uri: imageUrl(`magenta.png?${id}=${RUN}`) }
              : step === 'slow'
                ? {
                      uri: slowImageUrl(`cyan.png?${id}=${RUN}&delay=150`),
                      headers: BACKGROUND_SLOW_HEADERS,
                  }
                : toData
                  ? { uri: YELLOW_DATA_URI }
                  : cachedPhoto(id)
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={source}
                onError={(e) => {
                    const error = e.nativeEvent.error
                    setErrors((all) => [...all, error])
                }}
                onLoad={() => {
                    if (step === 'first') setStep('slow')
                    else if (step === 'changed' || step === 'done') {
                        setLoads((n) => n + 1)
                        // Once the slow image would have finished (about
                        // 1.2 s from its start), had it not been cancelled.
                        if (step === 'changed')
                            setTimeout(() => setStep('done'), 1500)
                    }
                }}
            />
            <CaseStatus
                id={id}
                status={
                    step !== 'done'
                        ? step
                        : errors.length
                          ? `onError: ${errors.join('; ')}`
                          : loads !== 1
                            ? `${loads} onLoad after the change`
                            : 'OK'
                }
                description={
                    toData
                        ? 'Changing the source to a data uri (yellow) while a slow image loads: no onError or onLoad for the slow one, and it stays yellow'
                        : keepPrevious
                          ? 'Changing the source from a loaded image (magenta) to a slow one, then to a cached photo before it loads: no onError, and the photo stays'
                          : 'Changing the source to a cached photo while a slow image loads: no onError for the first, and the photo stays'
                }
            />
        </View>
    )
}

// source.cacheKey (#524): an image loaded (or preloaded) with a token in its
// url, then the same image with another token and the same cacheKey. The
// second url is never requested: it comes from the cache. With downsample, on
// iOS, the downloaded file is found under the key too.
const cacheKeyPath = (id: string, token: string) =>
    `/picsum/1025-200x200.jpg?token=${token}&${id}=${RUN}`
function CacheKeyCase({
    id,
    description,
    preload,
    downsample,
}: {
    id: string
    description: string
    preload?: boolean
    downsample?: boolean
}) {
    const cacheKey = `${id}-${RUN}`
    const first = { uri: imageUrl(cacheKeyPath(id, 'a').slice(1)), cacheKey }
    const second = { uri: imageUrl(cacheKeyPath(id, 'b').slice(1)), cacheKey }
    const [firstLoaded, setFirstLoaded] = useState(false)
    const [secondLoaded, setSecondLoaded] = useState(false)
    const [requests, setRequests] = useState<number>()
    useEffect(() => {
        if (preload) {
            FastImage.preload([first]).then(() => setFirstLoaded(true))
        }
        // Only on mount: the sources don't change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    useEffect(() => {
        if (!secondLoaded) return
        const path = encodeURIComponent(cacheKeyPath(id, 'b'))
        fetch(imageUrl(`requests?path=${path}`))
            .then((response) => response.json())
            .then((json) => setRequests(json.count))
            .catch(() => setRequests(-1))
    }, [secondLoaded, id])
    return (
        <View style={styles.row}>
            {preload ? (
                <View style={styles.image} />
            ) : (
                <FastImage
                    style={styles.image}
                    source={first}
                    onLoad={() => setFirstLoaded(true)}
                />
            )}
            {firstLoaded ? (
                <FastImage
                    style={[styles.image, styles.gap]}
                    source={second}
                    downsample={!!downsample}
                    onLoad={() => setSecondLoaded(true)}
                />
            ) : (
                <View style={[styles.image, styles.gap]} />
            )}
            <CaseStatus
                id={id}
                status={
                    requests === undefined
                        ? 'waiting'
                        : requests === 0
                          ? 'OK'
                          : `the second url was requested ${requests} times`
                }
                description={description}
            />
        </View>
    )
}

// Preloads a url that first gets an HTML page (status 200, as from a captive
// portal), then preloads it again: the second preload downloads it and
// succeeds. iOS failed it without a request until the app was relaunched
// (#394), since views retry failed urls but preloads didn't. Android kept the
// page in Glide's disk cache (and `web` images' HTTP cache), so every later
// load failed; iOS kept it in `web` images' HTTP cache. With `web`, iOS still
// stored the page (it has an inline <svg>, and SDWebImage took it for an SVG
// image) until the failed load removed it, so a preload right after could get
// it from there: it happened once in tens of urls, so with many.
const RETRY_TRIES = 40
function PreloadRetryCase({ id, web }: { id: string; web?: boolean }) {
    const pathFor = (attempt: number) =>
        `/bad-once/picsum/1025-200x200.jpg?${id}=${RUN}-${attempt}`
    const sourceFor = (attempt: number) => ({
        uri: imageUrl(pathFor(attempt).slice(1)),
        cache: web ? FastImage.cacheControl.web : undefined,
    })
    const [status, setStatus] = useState('waiting')
    const [shown, setShown] = useState(false)
    const source = sourceFor(0)
    useEffect(() => {
        const run = async () => {
            for (let attempt = 0; attempt < RETRY_TRIES; attempt++) {
                const tried = sourceFor(attempt)
                const [first] = await FastImage.preload([tried])
                if (first.ok) return setStatus('the first preload loaded')
                const [second] = await FastImage.preload([tried])
                const response = await fetch(
                    imageUrl(
                        `requests?path=${encodeURIComponent(pathFor(attempt))}`,
                    ),
                )
                const { count } = (await response.json()) as { count: number }
                if (!second.ok) {
                    return setStatus(
                        `retry ${attempt + 1} failed (${count} requests): ${second.error}`,
                    )
                }
                if (count !== 2) {
                    return setStatus(`retry ${attempt + 1}: ${count} requests`)
                }
            }
            setShown(true)
        }
        run().catch((e) => setStatus(`error: ${e}`))
        // Only on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return (
        <View style={styles.row}>
            {shown ? (
                <FastImage
                    style={styles.image}
                    source={source}
                    onLoad={() => setStatus('OK')}
                />
            ) : (
                <View style={styles.image} />
            )}
            <CaseStatus
                id={id}
                status={status}
                description={
                    web
                        ? "a url whose first response was an HTML page (with cache 'web') loads the next time"
                        : '#394: a url whose first response was an HTML page is downloaded again by the next preload'
                }
            />
        </View>
    )
}

// Shows a url whose first response is an HTML page (status 200): the view
// fails, then a new view of the same url downloads it again and shows it.
// Android kept the page in Glide's disk cache, so the second view failed too.
function ViewRetryCase() {
    const path = `/bad-once/picsum/1025-200x200.jpg?view-retry=${RUN}`
    const [attempt, setAttempt] = useState(1)
    const [status, setStatus] = useState('waiting')
    const onLoad = async () => {
        const response = await fetch(
            imageUrl(`requests?path=${encodeURIComponent(path)}`),
        )
        const { count } = (await response.json()) as { count: number }
        setStatus(
            attempt === 1
                ? 'the first view loaded'
                : count === 2
                  ? 'OK'
                  : `${count} requests`,
        )
    }
    return (
        <View style={styles.row}>
            <FastImage
                // A new view for the second attempt.
                key={attempt}
                style={styles.image}
                source={{ uri: imageUrl(path.slice(1)) }}
                onError={() =>
                    attempt === 1
                        ? setAttempt(2)
                        : setStatus('the second view failed too')
                }
                onLoad={onLoad}
            />
            <CaseStatus
                id="view-retry"
                status={status}
                description="a url whose first response was an HTML page loads in the next view"
            />
        </View>
    )
}

// Preloads a `web` url that 404s: it fails with one request. Android loaded
// it again with the client without the HTTP cache (two requests).
const WEB_404_PATH = `/does-not-exist.jpg?web-404=${RUN}`
function Web404Case() {
    const [status, setStatus] = useState('waiting')
    useEffect(() => {
        const run = async () => {
            const [result] = await FastImage.preload([
                {
                    uri: imageUrl(WEB_404_PATH.slice(1)),
                    cache: FastImage.cacheControl.web,
                },
            ])
            const response = await fetch(
                imageUrl(`requests?path=${encodeURIComponent(WEB_404_PATH)}`),
            )
            const { count } = (await response.json()) as { count: number }
            setStatus(
                !result.ok && count === 1
                    ? 'OK'
                    : `ok: ${result.ok}, ${count} requests`,
            )
        }
        run().catch((e) => setStatus(`error: ${e}`))
    }, [])
    return (
        <View style={styles.row}>
            <View style={styles.image} />
            <CaseStatus
                id="web-404"
                status={status}
                description="a url that 404s with cache 'web' is requested once"
            />
        </View>
    )
}

// An image sent as `Content-Type: text/plain` still loads (Android fails
// responses that aren't images only if their bytes aren't an image either).
function MislabeledCase() {
    const [status, setStatus] = useState('waiting')
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={{
                    uri: imageUrl(
                        `mislabeled/picsum/1025-200x200.jpg?mislabeled=${RUN}`,
                    ),
                }}
                onLoad={() => setStatus('OK')}
                onError={(e) => setStatus(`error: ${e.nativeEvent.error}`)}
            />
            <CaseStatus
                id="mislabeled"
                status={status}
                description="an image sent as text/plain loads"
            />
        </View>
    )
}

// Preloads an image that isn't cached with `cache: 'cacheOnly'`: it fails
// without a request to the server, as a view with it does. iOS downloaded it
// (preload didn't follow `cache`, #406).
const PRELOAD_CACHE_ONLY_PATH = `/logo.png?cache-only=${RUN}`
function PreloadCacheOnlyCase() {
    const [status, setStatus] = useState('waiting')
    useEffect(() => {
        FastImage.preload([
            {
                uri: imageUrl(PRELOAD_CACHE_ONLY_PATH.slice(1)),
                cache: FastImage.cacheControl.cacheOnly,
            },
        ])
            .then(async ([result]) => {
                const response = await fetch(
                    imageUrl(
                        `requests?path=${encodeURIComponent(PRELOAD_CACHE_ONLY_PATH)}`,
                    ),
                )
                const { count } = (await response.json()) as { count: number }
                setStatus(
                    !result.ok && count === 0
                        ? 'OK'
                        : `ok: ${result.ok}, ${count} requests`,
                )
            })
            .catch((e) => setStatus(`error: ${e}`))
    }, [])
    return (
        <View style={styles.row}>
            <View style={styles.image} />
            <CaseStatus
                id="preload-cache-only"
                status={status}
                description="#406: preloading with cache 'cacheOnly' doesn't download (fails if it isn't cached)"
            />
        </View>
    )
}

// Shows an image with memoryCache false, then shows it in a second view: it
// comes from the disk cache (the server gets one request). (That it isn't
// kept in memory isn't visible here.)
const NO_MEMORY_PATH = `/picsum/1025-200x200.jpg?no-memory=${RUN}`
function MemoryCacheOffCase() {
    const [second, setSecond] = useState(false)
    const [requests, setRequests] = useState<number>()
    const source = {
        uri: imageUrl(NO_MEMORY_PATH.slice(1)),
        memoryCache: false,
    }
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={source}
                onLoad={() => setSecond(true)}
            />
            {second ? (
                <FastImage
                    style={[styles.image, styles.gap]}
                    source={source}
                    onLoad={() =>
                        fetch(
                            imageUrl(
                                `requests?path=${encodeURIComponent(NO_MEMORY_PATH)}`,
                            ),
                        )
                            .then((response) => response.json())
                            .then((json) => setRequests(json.count))
                            .catch(() => setRequests(-1))
                    }
                />
            ) : (
                <View style={[styles.image, styles.gap]} />
            )}
            <CaseStatus
                id="memory-cache-off"
                status={
                    requests === undefined
                        ? 'waiting'
                        : requests === 1
                          ? 'OK'
                          : `requested ${requests} times`
                }
                description="memoryCache false: the image shows, and a second view gets it from the disk cache"
            />
        </View>
    )
}

// The disk cache limit the example apps set in their native config
// (FastImageMaxDiskSize in Info.plist, fastimage.MAX_DISK_SIZE
// in AndroidManifest.xml), which the configure-cache case checks.
const EXAMPLE_MAX_DISK_SIZE = 300 * 1024 * 1024

// FastImage.configureCache: the limit in the app's native config is in effect
// from the start, with the disk cache's size. iOS: a runtime change applies at
// once: downloads an image (getCachePath), sets maxDiskSize to 1 byte, which
// removes every image from the disk cache, then the image isn't cached
// anymore. Resetting it (null) goes back to the native config's limit. On
// Android a runtime change applies from the next launch, so the limit in
// effect stays the same. Changes are saved, so it always resets. Only groups
// after this one see the emptied cache.
function ConfigureCacheCase() {
    const [status, setStatus] = useState('waiting')
    useEffect(() => {
        const uri = imageUrl(`picsum/1022-120x120.jpg?configure-cache=${RUN}`)
        const run = async () => {
            const state = await FastImage.configureCache()
            if (state.maxDiskSize !== EXAMPLE_MAX_DISK_SIZE) {
                return setStatus(`maxDiskSize is ${state.maxDiskSize}`)
            }
            // Images earlier groups loaded.
            if (!state.diskSize)
                return setStatus(`diskSize is ${state.diskSize}`)
            if (Platform.OS !== 'ios') {
                const changed = await FastImage.configureCache({
                    maxDiskSize: 1,
                })
                const reset = await FastImage.configureCache({
                    maxDiskSize: null,
                })
                return setStatus(
                    changed.maxDiskSize === EXAMPLE_MAX_DISK_SIZE &&
                        reset.maxDiskSize === EXAMPLE_MAX_DISK_SIZE
                        ? 'OK'
                        : `in effect: ${changed.maxDiskSize}, ${reset.maxDiskSize}`,
                )
            }
            const before = await FastImage.getCachePath({ uri })
            if (!before.ok) return setStatus(`not cached: ${before.error}`)
            const trimmed = await FastImage.configureCache({ maxDiskSize: 1 })
            const after = await FastImage.getCachePath({
                uri,
                cache: FastImage.cacheControl.cacheOnly,
            })
            const reset = await FastImage.configureCache({ maxDiskSize: null })
            setStatus(
                after.ok
                    ? `still cached: ${after.path}`
                    : trimmed.diskSize !== 0
                      ? `diskSize is ${trimmed.diskSize} after trimming`
                      : reset.maxDiskSize !== EXAMPLE_MAX_DISK_SIZE
                        ? `maxDiskSize is ${reset.maxDiskSize} after resetting`
                        : 'OK',
            )
        }
        run().catch((e) => setStatus(`error: ${e}`))
    }, [])
    return (
        <View style={styles.row}>
            <View style={styles.image} />
            <CaseStatus
                id="configure-cache"
                status={status}
                description="configureCache: the native config's limit is in effect, with the disk cache's size; a change applies (iOS: at once), and null resets it"
            />
        </View>
    )
}

// FastImage.writeToCache: stores a local file (here an image's file from
// getCachePath: green) as another url's image (which the server would send
// brown), then shows that url: the green image, with no request for the url.
//   - keyOnly: stored with only the cacheKey (no uri yet), then shown by
//     url and cacheKey;
//   - cached: the url is in the cache already, so it isn't replaced;
//   - missing: the file doesn't exist; web: a `cache: 'web'` source.
function WriteToCacheCase({
    id,
    description,
    byCacheKey,
    keyOnly,
    cached,
    missing,
    web,
}: {
    id: string
    description: string
    byCacheKey?: boolean
    keyOnly?: boolean
    cached?: boolean
    missing?: boolean
    web?: boolean
}) {
    const path = `/${web ? 'max-age/' : ''}picsum/1025-200x200.jpg?${id}=${RUN}`
    const source: Source = {
        uri: imageUrl(path.slice(1)),
        cacheKey: byCacheKey || keyOnly ? `${id}-${RUN}` : undefined,
        cache: web ? FastImage.cacheControl.web : undefined,
    }
    const [status, setStatus] = useState('waiting')
    const [shown, setShown] = useState(false)
    const requests = () =>
        fetch(imageUrl(`requests?path=${encodeURIComponent(path)}`))
            .then((response) => response.json())
            .then((json: { count: number }) => json.count)
    useEffect(() => {
        const run = async () => {
            const file = missing
                ? { ok: true as const, path: '/no/such/image.jpg' }
                : await FastImage.getCachePath({
                      uri: imageUrl(
                          `picsum/1022-120x120.jpg?${id}-file=${RUN}`,
                      ),
                  })
            if (!file.ok) return setStatus(`no file: ${file.error}`)
            if (cached) {
                const before = await FastImage.getCachePath(source)
                if (!before.ok) return setStatus(`not cached: ${before.error}`)
            }
            const result = await FastImage.writeToCache(
                keyOnly ? { cacheKey: source.cacheKey } : source,
                `file://${file.path}`,
            )
            const expected = cached
                ? 'Already in the disk cache'
                : missing
                  ? "Can't read the file"
                  : web
                    ? "Can't store cache: 'web'"
                    : undefined
            if (expected) {
                return setStatus(
                    !result.ok && result.error.startsWith(expected)
                        ? 'OK'
                        : `expected "${expected}": ${JSON.stringify(result)}`,
                )
            }
            if (!result.ok) return setStatus(`error: ${result.error}`)
            setShown(true)
        }
        run().catch((e) => setStatus(`error: ${e}`))
        // Only on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return (
        <View style={styles.row}>
            {shown ? (
                <FastImage
                    style={styles.image}
                    source={source}
                    onLoad={async () => {
                        const count = await requests()
                        setStatus(count === 0 ? 'OK' : `${count} requests`)
                    }}
                    onError={(e) => setStatus(`error: ${e.nativeEvent.error}`)}
                />
            ) : (
                <View style={styles.image} />
            )}
            <CaseStatus id={id} status={status} description={description} />
        </View>
    )
}

// FastImage.getCachePath: the source's file in the disk cache, shown as a
// `file://` source (so it's the downloaded image; the file may have no image
// extension, which React Native 0.73's Image doesn't load on iOS).
//   - loaded: a view shows the image first, then the path is asked for;
//   - otherwise it isn't loaded before: getCachePath downloads it (one
//     request), or with cacheOnly fails without a request;
//   - whileLoading: asked for while a view is still downloading it (slowly).
function CachePathCase({
    id,
    description,
    loaded,
    byCacheKey,
    space,
    web,
    cacheOnly,
    missing,
    whileLoading,
    keyOnly,
}: {
    id: string
    description: string
    loaded?: boolean
    byCacheKey?: boolean
    // Asks with only the cacheKey (no uri): only looked up.
    keyOnly?: boolean
    // A url with a space (iOS caches it escaped).
    space?: boolean
    // With cache 'web', served cacheable (Android keeps it in an HTTP cache).
    web?: boolean
    // Asks with cache 'cacheOnly' (for a `web` image loaded before: the same
    // uri, not as `web`).
    cacheOnly?: boolean
    // A url that 404s.
    missing?: boolean
    whileLoading?: boolean
}) {
    const path = missing
        ? `does-not-exist.jpg?${id}=${RUN}`
        : `${web ? 'max-age/' : ''}picsum/1022-120x120.jpg?${id}=${RUN}${space ? '&name=a b' : ''}`
    const uri = whileLoading
        ? slowImageUrl(`picsum/1022-120x120.jpg?group=${id}-${RUN}&delay=150`)
        : imageUrl(path)
    const source: Source = {
        uri,
        cacheKey: byCacheKey || keyOnly ? `${id}-${RUN}` : undefined,
        cache: web ? FastImage.cacheControl.web : undefined,
        headers: whileLoading ? BACKGROUND_SLOW_HEADERS : undefined,
    }
    const [result, setResult] = useState<CachePathResult>()
    const [requests, setRequests] = useState<number>()
    const [shown, setShown] = useState(false)
    const getPath = () =>
        FastImage.getCachePath(
            keyOnly
                ? { cacheKey: source.cacheKey }
                : cacheOnly
                  ? {
                        uri,
                        cacheKey: source.cacheKey,
                        cache: FastImage.cacheControl.cacheOnly,
                    }
                  : source,
        )
            .then(async (r) => {
                const response = await fetch(
                    whileLoading
                        ? imageUrl(`requests?group=${id}-${RUN}`)
                        : // As the server counts it, with the space escaped.
                          imageUrl(
                              `requests?path=${encodeURIComponent(`/${path.replace(/ /g, '%20')}`)}`,
                          ),
                )
                const { count } = (await response.json()) as { count: number }
                setRequests(count)
                setResult(r)
            })
            .catch((e) => setResult({ ok: false, error: String(e) }))
    useEffect(() => {
        if (!loaded) getPath()
        // Only on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    // Requests the server got: the view's (if it loaded the image first) and
    // getCachePath's download (if any).
    const expected = loaded ? 1 : cacheOnly || keyOnly ? 0 : 1
    const status =
        result === undefined
            ? 'waiting'
            : missing
              ? !result.ok && result.error.includes('404')
                  ? 'OK'
                  : `expected a 404: ${JSON.stringify(result)}`
              : (cacheOnly || keyOnly) && !loaded
                ? !result.ok && requests === 0
                    ? 'OK'
                    : `${JSON.stringify(result)}, ${requests} requests`
                : !result.ok
                  ? `error: ${result.error}`
                  : !shown
                    ? 'showing the file'
                    : whileLoading
                      ? // One download on iOS, where SDWebImage shares it;
                        // Glide on Android downloads it again for a request
                        // that isn't the same as the view's.
                        requests === (Platform.OS === 'ios' ? 1 : 2)
                          ? 'OK'
                          : `${requests} requests`
                      : requests === expected
                        ? 'OK'
                        : `${requests} requests, expected ${expected}`
    return (
        <View style={styles.row}>
            {loaded || whileLoading ? (
                <FastImage
                    style={styles.image}
                    source={source}
                    onLoadStart={whileLoading ? getPath : undefined}
                    onLoad={loaded ? getPath : undefined}
                />
            ) : (
                <View style={styles.image} />
            )}
            {result?.ok ? (
                <FastImage
                    style={[styles.image, styles.gap]}
                    source={{ uri: `file://${result.path}` }}
                    onLoad={() => setShown(true)}
                />
            ) : (
                <View style={[styles.image, styles.gap]} />
            )}
            <CaseStatus id={id} status={status} description={description} />
        </View>
    )
}

// Preloads an image with memoryCache false (to disk only, without decoding
// it), which still reports its size, then shows it: it loads from the disk
// cache, so the server gets one request. (That it isn't decoded into memory
// isn't visible here.)
const PRELOAD_DISK_PATH = `/picsum/1025-200x200.jpg?preload-disk=${RUN}`
function PreloadDiskCase() {
    const [result, setResult] = useState<PreloadResult>()
    const [shown, setShown] = useState(false)
    const [requests, setRequests] = useState<number>()
    const source = {
        uri: imageUrl(PRELOAD_DISK_PATH.slice(1)),
        memoryCache: false,
    }
    useEffect(() => {
        FastImage.preload([source]).then(([r]) => {
            setResult(r)
            setShown(true)
        })
        // Only on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    const onLoad = () =>
        fetch(
            imageUrl(`requests?path=${encodeURIComponent(PRELOAD_DISK_PATH)}`),
        )
            .then((response) => response.json())
            .then((json) => setRequests(json.count))
            .catch(() => setRequests(-1))
    const sized = result?.ok && result.width === 200 && result.height === 200
    return (
        <View style={styles.row}>
            {shown ? (
                <FastImage
                    style={styles.image}
                    source={source}
                    onLoad={onLoad}
                />
            ) : (
                <View style={styles.image} />
            )}
            <CaseStatus
                id="preload-disk"
                status={
                    requests === undefined
                        ? result && !result.ok
                            ? `error: ${result.error}`
                            : 'waiting'
                        : sized && requests === 1
                          ? 'OK'
                          : `${JSON.stringify(result)}, ${requests} requests`
                }
                description="preload with memoryCache false reports the size, and the image then shows from the disk cache"
            />
        </View>
    )
}

// transition, recorded (a video sample, see RunnerContext.tsx): an image that
// fades in over 1 s, over black, goes from black through half cyan to cyan;
// one that shows at once goes from black to cyan (half cyan mustn't appear).
// Over black, so halfway is far from both ends. Each records until the fade's
// length after its image loaded, so one that shouldn't fade has the time to.
// Where the image comes from:
// - download: the slow server (about 350 ms). On the legacy architecture, an
//   image that loads before the new view is first drawn can show without the
//   fade.
// - memory: a view showing the same image (left) has loaded it.
// - disk: a view showing it loaded it, then went away, and the memory cache
//   was cleared.
// - change: the view shows magenta, then its source changes to cyan, which
//   another view (left) has loaded (from the memory cache): magenta, then
//   cyan, or through blue-violet if it fades.
// - change-download: the same, with a cyan image that downloads (the slow
//   server).
// - file: the file getCachePath gives for an image a view (left) loaded, as
//   a `file://` source: a local file, not a memory cache hit.
// - bundled: a require()d image (from Metro in debug builds, from the app in
//   release builds).
const FADE_MS = 1000
const BLACK = '#000000'
// Cyan at half opacity over black.
const HALF_CYAN = '#008080'
// Halfway from magenta to cyan.
const MAGENTA_CYAN = '#8080ff'
type FadeFrom =
    | 'download'
    | 'memory'
    | 'disk'
    | 'change'
    | 'change-download'
    | 'file'
    | 'bundled'
function FadeCase({
    id,
    from,
    skipOnCacheHit,
    betweenImages,
    blurRadius,
    fades,
    description,
}: {
    id: string
    from: FadeFrom
    skipOnCacheHit?: Transition['skipOnCacheHit']
    betweenImages?: boolean
    blurRadius?: number
    fades: boolean
    description: string
}) {
    const sample = useContext(SampleContext)
    const view = useRef<React.ComponentRef<typeof View>>(null)
    const change = from === 'change' || from === 'change-download'
    const source =
        from === 'download' || from === 'change-download'
            ? {
                  uri: slowImageUrl(`cyan.png?${id}=${RUN}&delay=50`),
                  headers: BACKGROUND_SLOW_HEADERS,
              }
            : { uri: imageUrl(`cyan.png?${id}=${RUN}`) }
    const magenta = { uri: imageUrl(`magenta.png?${id}=${RUN}`) }
    const [file, setFile] = useState<Source>()
    // Recorded as the view mounts (download, bundled), or once the view that
    // loads the image first (left) has loaded it.
    const onMount = from === 'download' || from === 'bundled'
    // Whether a view (left) loads the image first.
    const loader = !onMount && from !== 'change-download'
    const [loaderShown, setLoaderShown] = useState(loader)
    // The view that fades (change: it shows magenta until the change).
    const [shown, setShown] = useState(change)
    const [changed, setChanged] = useState(false)
    // What the view that fades shows (change: magenta until the change).
    const shownSource =
        from === 'bundled'
            ? require('./images/cyan.png')
            : from === 'file'
              ? file
              : change && !changed
                ? magenta
                : source
    const [status, setStatus] = useState(
        onMount ? 'waiting' : 'loading the first view',
    )
    const expect = change
        ? fades
            ? [MAGENTA, MAGENTA_CYAN, CYAN]
            : [MAGENTA, CYAN]
        : fades
          ? [BLACK, HALF_CYAN, CYAN]
          : [BLACK, CYAN]
    const loaded = useRef(0)
    const done = useRef(() => {})
    const record = async () => {
        const area = await measureView(view.current)
        if (!area) return setStatus('not on screen')
        setStatus('recording')
        const result = await sample(
            {
                name: id,
                area,
                durationMs: 5000,
                expect,
                palette: change
                    ? [MAGENTA, MAGENTA_CYAN, CYAN]
                    : [BLACK, HALF_CYAN, CYAN],
            },
            (sampleDone) => {
                done.current = sampleDone
                if (change) setChanged(true)
                else setShown(true)
            },
        )
        setStatus(sampleStatus(result, expect))
    }
    const onLoaderLoad = async () => {
        if (from === 'disk') {
            setLoaderShown(false)
            // Once the view has let go of the image.
            await new Promise<void>((resolve) => setTimeout(resolve, 500))
            await FastImage.clearMemoryCache()
            record()
        } else if (from === 'memory') {
            record()
        } else if (from === 'file') {
            const result = await FastImage.getCachePath(source)
            if (!result.ok) return setStatus(`no file: ${result.error}`)
            setFile({ uri: `file://${result.path}` })
            record()
        } else if (++loaded.current === (loader ? 2 : 1)) {
            // change: after magenta has faded in too.
            setTimeout(record, FADE_MS + 500)
        }
    }
    useEffect(() => {
        if (onMount) record()
        // Only on mount (the others record once the first view loads).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return (
        <View style={styles.row}>
            {loader ? (
                <View style={styles.image}>
                    {loaderShown ? (
                        <FastImage
                            style={styles.image}
                            source={source}
                            onLoad={onLoaderLoad}
                        />
                    ) : null}
                </View>
            ) : null}
            <View
                ref={view}
                collapsable={false}
                style={[fadeStyles.black, loader ? styles.gap : null]}
            >
                {shown ? (
                    <FastImage
                        style={fadeStyles.image}
                        source={shownSource}
                        onLoad={
                            change && !changed
                                ? onLoaderLoad
                                : // With some slack: the fade can start a
                                  // little after onLoad on a busy device.
                                  () =>
                                      setTimeout(
                                          () => done.current(),
                                          FADE_MS + 500,
                                      )
                        }
                        transition={{
                            duration: FADE_MS,
                            betweenImages,
                            skipOnCacheHit,
                        }}
                        blurRadius={blurRadius}
                    />
                ) : null}
            </View>
            <CaseStatus id={id} status={status} description={description} />
        </View>
    )
}

const fadeStyles = StyleSheet.create({
    black: { width: 48, height: 48, backgroundColor: BLACK },
    image: { width: 48, height: 48 },
})

// Preloads a mix of sources and checks the results: each source's ok, and the
// size of the ones that loaded. The private image only loads with its header,
// which checks preload sends it (#571).
const PRELOAD_RESULTS_RUN = `results=${RUN}`
function PreloadResultsCase() {
    const [status, setStatus] = useState('waiting')
    useEffect(() => {
        FastImage.preload([
            { uri: imageUrl(`picsum/1025-200x200.jpg?${PRELOAD_RESULTS_RUN}`) },
            { uri: MISSING },
            { uri: '' },
            null as unknown as Source,
            {
                uri: imageUrl(
                    `private/picsum/1021-120x120.jpg?${PRELOAD_RESULTS_RUN}`,
                ),
                headers: { 'x-token': 'fast-image' },
            },
            {
                uri: imageUrl(
                    `private/picsum/1022-120x120.jpg?${PRELOAD_RESULTS_RUN}`,
                ),
            },
        ]).then((results) => {
            const got = results
                .map((r) => (r.ok ? `${r.width}x${r.height}` : 'failed'))
                .join(', ')
            const expected = '200x200, failed, failed, failed, 120x120, failed'
            const errors = results.filter((r) => !r.ok).every((r) => r.error)
            setStatus(got === expected && errors ? 'OK' : got)
        })
    }, [])
    return (
        <View style={styles.row}>
            <View style={styles.image} />
            <CaseStatus
                id="preload-results"
                status={status}
                description="preload resolves with each source's result and size"
            />
        </View>
    )
}

// Preloads a few slow images at once and asks the server how many it was
// sending at the same time: preload loads a few sources at a time (3, or
// SDWebImagePrefetcher's maxConcurrentPrefetchCount on iOS), so a long list
// doesn't hold up the images the app is showing. Without the limit both
// platforms load all 4 at once (SDWebImage's downloader allows 6, Glide's
// source executor has 4 threads on the emulator), so this fails without it.
const PRELOAD_LIMIT_GROUP = `limit-${RUN}`
function PreloadLimitCase() {
    const [status, setStatus] = useState('waiting')
    useEffect(() => {
        const sources = [0, 1, 2, 3].map((i) => ({
            uri: slowImageUrl(
                `picsum/1020-120x120.jpg?group=${PRELOAD_LIMIT_GROUP}&i=${i}&delay=150`,
            ),
            headers: { 'x-token': 'fast-image' },
        }))
        FastImage.preload(sources)
            .then(async (results) => {
                const loaded = results.filter((r) => r.ok).length
                const response = await fetch(
                    imageUrl(`requests?group=${PRELOAD_LIMIT_GROUP}`),
                )
                const { count, peak } = (await response.json()) as {
                    count: number
                    peak: number
                }
                setStatus(
                    loaded === 4 && count === 4 && peak <= 3
                        ? 'OK'
                        : `loaded ${loaded}, ${count} requests, ${peak} at once`,
                )
            })
            .catch((e) => setStatus(`error: ${e}`))
    }, [])
    return (
        <View style={styles.row}>
            <View style={styles.image} />
            <CaseStatus
                id="preload-limit"
                status={status}
                description="preload loads a few sources at a time"
            />
        </View>
    )
}

// A portrait image (600x1200, 12px black and white stripes) with cover in a
// view that gets taller after it loaded (96x16, then 96x96), next to React
// Native's Image. Android showed a zoomed-in slice of it: Glide had cropped it
// to the first size (#983). Check the screenshot: both should look the same.
function SizeChangeCase() {
    const [tall, setTall] = useState(false)
    const [done, setDone] = useState(false)
    const size = { width: 96, height: tall ? 96 : 16 }
    useEffect(() => {
        if (!tall) return
        const t = setTimeout(() => setDone(true), 1000)
        return () => clearTimeout(t)
    }, [tall])
    const source = { uri: imageUrl('portrait-stripes.png') }
    return (
        <View style={styles.row}>
            <FastImage
                style={size}
                resizeMode="cover"
                source={source}
                onLoad={() => setTimeout(() => setTall(true), 300)}
            />
            <Image
                style={[size, styles.gap]}
                resizeMode="cover"
                source={source}
            />
            <CaseStatus
                id="size-change"
                status={done ? 'OK' : 'waiting'}
                description="#983: an image in a view that gets taller after it loaded looks like Image next to it (not zoomed in)"
            />
        </View>
    )
}

export const styles = StyleSheet.create({
    container: {
        padding: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
    },
    group: {
        color: '#666',
        marginBottom: 8,
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
    gap: {
        marginLeft: 8,
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

// FastImageBackground: a photo filling a wide view (cover, with rounded
// corners from imageStyle), with text on top. Check the screenshot.
function ImageBackgroundCase() {
    const [loaded, setLoaded] = useState(false)
    return (
        <View style={styles.row}>
            <FastImageBackground
                source={{ uri: imageUrl('picsum/1020-120x120.jpg') }}
                style={backgroundStyles.view}
                imageStyle={backgroundStyles.image}
                onLoad={() => setLoaded(true)}
            >
                <Text style={backgroundStyles.text}>on top</Text>
            </FastImageBackground>
            <CaseStatus
                id="image-background"
                status={loaded ? 'OK' : 'loading'}
                description="FastImageBackground: the image fills the view (cover, rounded corners), with the text on top"
            />
        </View>
    )
}

const backgroundStyles = StyleSheet.create({
    view: { width: 96, height: 48, justifyContent: 'center' },
    image: { borderRadius: 8 },
    text: { color: 'white', fontWeight: '600', textAlign: 'center' },
})

// onLoadEnd gets the load's result: for an image that loads, ok and the size
// onLoad got; for one that fails (a 404), not ok and the error onError got.
function LoadEndResultCase({
    id,
    uri,
    description,
}: {
    id: string
    uri: string
    description: string
}) {
    const [expected, setExpected] = useState<LoadResult>()
    const [result, setResult] = useState<LoadResult>()
    const got = JSON.stringify(result)
    const want = JSON.stringify(expected)
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={{ uri }}
                onLoad={(e) => {
                    // Read the event now: the updater runs later.
                    const { width, height } = e.nativeEvent
                    setExpected({ ok: true, width, height })
                }}
                onError={(e) => {
                    const { error } = e.nativeEvent
                    setExpected({ ok: false, error })
                }}
                onLoadEnd={setResult}
            />
            <CaseStatus
                id={id}
                status={
                    !result || !expected
                        ? 'waiting'
                        : got === want
                          ? 'OK'
                          : `got ${got}, expected ${want}`
                }
                description={description}
            />
        </View>
    )
}

// The cases that run on their own, in the groups the runner shows one at a
// time (each fits on a screen, so its screenshot shows every case). Cases in
// a group load at the same time; timed ones (a second or two) are grouped so
// they overlap. Keys are the case ids, which must be unique across groups.

// The loop prop. The test GIFs have two 400 ms frames, so a play takes 0.8 s;
// a case turns OK that long after onLoad (times its plays), plus a margin for
// the animation to start. A GIF that stops ends on its last frame, which the
// screenshot compares; one that keeps looping could be on either frame, so
// it's masked (those cases only check nothing crashes).
const GIF_PLAY = 800
const GIF_MARGIN = 600
function GifLoopCase({
    id,
    description,
    loop,
    plays,
    source,
    animates,
}: {
    id: string
    description: string
    loop?: boolean | number
    // How many plays to wait for before the screenshot.
    plays: number
    source: string
    // Still animating at the screenshot: masked.
    animates?: boolean
}) {
    const [ok, setOk] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
    useEffect(() => () => clearTimeout(timer.current), [])
    const image = (
        <FastImage
            style={styles.image}
            loop={loop}
            source={{ uri: imageUrl(source) }}
            onLoad={() => {
                clearTimeout(timer.current)
                timer.current = setTimeout(
                    () => setOk(true),
                    plays * GIF_PLAY + GIF_MARGIN,
                )
            }}
        />
    )
    return (
        <View style={styles.row}>
            {animates ? <Masked>{image}</Masked> : image}
            <CaseStatus
                id={id}
                status={ok ? 'OK' : 'waiting'}
                description={description}
            />
        </View>
    )
}

// The paused prop, with the GIF that loops forever by itself (red, then
// blue), or another image like it (`source`, e.g. an animated WebP, with
// `name` for its ids and descriptions). Paused from the start, it stays on its
// first frame (red). Paused, then resumed with loop={false}, it plays once and
// stops on its last frame (blue); if resuming didn't play it, it would still
// be red.
function GifPausedCase({
    resume,
    source = 'loop-forever.gif',
    name = 'gif',
}: {
    resume?: boolean
    source?: string
    name?: string
}) {
    const [paused, setPaused] = useState(true)
    const [ok, setOk] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
    useEffect(() => () => clearTimeout(timer.current), [])
    const id = `${name.toLowerCase()}-${resume ? 'resume' : 'paused'}`
    // An animated WebP's descriptions name it; the GIF's are as they were.
    const kind = name === 'gif' ? '' : ` (an animated ${name})`
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                paused={paused}
                loop={resume ? false : undefined}
                source={{ uri: imageUrl(source) }}
                onLoad={() => {
                    clearTimeout(timer.current)
                    // A play's worth of time paused, then (resume) one play.
                    timer.current = setTimeout(() => {
                        if (!resume) return setOk(true)
                        setPaused(false)
                        timer.current = setTimeout(
                            () => setOk(true),
                            GIF_PLAY + GIF_MARGIN,
                        )
                    }, GIF_PLAY)
                }}
            />
            <CaseStatus
                id={id}
                status={ok ? 'OK' : 'waiting'}
                description={
                    resume
                        ? `paused, then paused={false} with loop={false}${kind}: plays once and stops on blue`
                        : `paused: ${kind ? `an image${kind}` : 'a GIF'} that loops forever by itself stays on its first frame (red)`
                }
            />
        </View>
    )
}

// A GIF that plays once (1.5 s red, then 0.1 s blue), paused after it
// finished, then resumed: it plays again from the start, on both platforms
// (iOS's player does; Android matches it), so it's red at the screenshot. One
// that's still playing continues its count instead.
function GifResumeFinishedCase() {
    const [paused, setPaused] = useState(false)
    const [ok, setOk] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
    useEffect(() => () => clearTimeout(timer.current), [])
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                paused={paused}
                source={{ uri: imageUrl('slow-once.gif') }}
                onLoad={() => {
                    clearTimeout(timer.current)
                    // Its one play (1.6 s), then pause, then resume.
                    timer.current = setTimeout(() => {
                        setPaused(true)
                        timer.current = setTimeout(() => {
                            setPaused(false)
                            timer.current = setTimeout(() => setOk(true), 300)
                        }, 200)
                    }, 1600 + GIF_MARGIN)
                }}
            />
            <CaseStatus
                id="gif-resume-finished"
                status={ok ? 'OK' : 'waiting'}
                description="A GIF that played once, paused, then resumed: plays again (red), as on iOS"
            />
        </View>
    )
}

// loop={false}, then loop={true} once the GIF has played once: it starts
// again and keeps looping (orange and purple). Masked: it's animating.
function GifLoopChangeCase() {
    const [loop, setLoop] = useState(false)
    const [ok, setOk] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
    useEffect(() => () => clearTimeout(timer.current), [])
    return (
        <View style={styles.row}>
            <Masked>
                <FastImage
                    style={styles.image}
                    loop={loop}
                    source={{ uri: imageUrl('loop-forever-2.gif') }}
                    onLoad={() => {
                        clearTimeout(timer.current)
                        timer.current = setTimeout(() => {
                            setLoop(true)
                            timer.current = setTimeout(() => setOk(true), 400)
                        }, GIF_PLAY + GIF_MARGIN)
                    }}
                />
            </Masked>
            <CaseStatus
                id="gif-loop-change"
                status={ok ? 'OK' : 'waiting'}
                description="Changing loop from false to true plays the GIF again and keeps looping (orange and purple)"
            />
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
            <CaseStatus
                id="error-message"
                status={
                    error === undefined
                        ? 'waiting'
                        : error.includes('404')
                          ? 'OK'
                          : error
                }
                description="#200: onError says what went wrong (here a 404)"
            />
        </View>
    )
}

// imageRendering: each row shows an image at its own size (one image pixel
// per screen pixel, cropped), then drawn in each mode (columns: auto, smooth,
// pixelated). Checked by the screenshot; each row says what to expect. Shrunk
// with auto or pixelated, the first two rows lose detail, differently on each
// platform (they drop different pixels). smooth is iOS only (the same as auto
// on Android).
const RENDERING_MODES = ['auto', 'smooth', 'pixelated'] as const
const RENDERING_COLUMN = 96
const RENDERING_ROWS = [
    {
        image: 'stripes.png',
        size: { width: 1024, height: 1024 },
        drawn: { width: 48, height: 48 },
        label: 'Shrunk: 1px black and white stripes (1024px) drawn at 48. smooth (iOS): an even gray (#445)',
    },
    {
        image: 'text-page.png',
        size: { width: 1600, height: 1000 },
        drawn: { width: 96, height: 60 },
        label: 'Shrunk: a page of small text (1600px wide) drawn at 96. smooth (iOS): the lines of text stay continuous',
    },
    {
        image: 'sprite-12.png',
        size: { width: 12, height: 12 },
        drawn: { width: 60, height: 60 },
        label: 'Enlarged: 12px pixel art drawn at 60. pixelated: sharp pixels; auto and smooth blur it (#926)',
    },
]

// The image at its own size, in a window that crops it.
function OriginalCrop({
    image,
    size,
}: {
    image: string
    size: { width: number; height: number }
}) {
    const scale = PixelRatio.get()
    return (
        <View style={renderingStyles.original}>
            <FastImage
                style={{
                    width: size.width / scale,
                    height: size.height / scale,
                }}
                source={{ uri: imageUrl(image) }}
                imageRendering="pixelated"
            />
        </View>
    )
}

function ImageRenderingCase() {
    const [loads, setLoads] = useState(0)
    const onLoad = () => setLoads((n) => n + 1)
    const total = RENDERING_MODES.length * RENDERING_ROWS.length
    return (
        <View>
            {RENDERING_ROWS.map((row) => (
                <View key={row.image} style={renderingStyles.row}>
                    <Text style={styles.description}>{row.label}</Text>
                    <OriginalCrop image={row.image} size={row.size} />
                    <View style={renderingStyles.columns}>
                        {RENDERING_MODES.map((mode) => (
                            <View key={mode} style={renderingStyles.column}>
                                <Text style={styles.description}>{mode}</Text>
                                <FastImage
                                    style={row.drawn}
                                    source={{ uri: imageUrl(row.image) }}
                                    imageRendering={mode}
                                    // Drawn from the full image, not one
                                    // decoded smaller (downsample).
                                    downsample={false}
                                    onLoad={onLoad}
                                />
                            </View>
                        ))}
                    </View>
                </View>
            ))}
            <View style={caseStyles.row}>
                <CaseStatus
                    id="image-rendering"
                    status={loads >= total ? 'OK' : `loaded ${loads}/${total}`}
                    description="imageRendering: each image at its own size, then auto, smooth and pixelated"
                />
            </View>
        </View>
    )
}

const renderingStyles = StyleSheet.create({
    row: { marginBottom: 10 },
    original: {
        width: 200,
        height: 24,
        overflow: 'hidden',
        backgroundColor: '#eee',
        marginVertical: 4,
    },
    columns: { flexDirection: 'row' },
    column: { width: RENDERING_COLUMN, marginRight: 12 },
})

// Shows status OK once `total` images have loaded (count with the returned
// onLoad), and a moment more, for the blur, which is applied after the load.
function useLoadedThenOk(total: number) {
    const [loads, setLoads] = useState(0)
    const [done, setDone] = useState(false)
    useEffect(() => {
        if (loads < total) return
        const timer = setTimeout(() => setDone(true), 500)
        return () => clearTimeout(timer)
    }, [loads, total])
    const onLoad = () => setLoads((n) => n + 1)
    return [done ? 'OK' : `loaded ${loads}/${total}`, onLoad] as const
}

const BLUR_PHOTO = imageUrl('picsum/1018-1024x1024.jpg')

// blurRadius, in points: the same number looks about the same as with React
// Native's Image on iOS, and whatever the file's resolution (it's blurred at
// the size it's shown at). React Native's Image on Android blurs in the
// decoded bitmap's pixels, and doesn't resize network images, so a large one
// hardly blurs. The blurred view doesn't change the unblurred one of the same
// file.
function BlurCase() {
    const [status, onLoad] = useLoadedThenOk(4)
    return (
        <View style={blurStyles.stacked}>
            <View style={blurStyles.images}>
                <FastImage
                    style={blurStyles.image}
                    source={{ uri: BLUR_PHOTO }}
                    onLoad={onLoad}
                />
                <Image
                    style={[blurStyles.image, blurStyles.next]}
                    source={{ uri: BLUR_PHOTO }}
                    blurRadius={6}
                    fadeDuration={0}
                    onLoad={onLoad}
                />
                <FastImage
                    style={[blurStyles.image, blurStyles.next]}
                    source={{ uri: BLUR_PHOTO }}
                    blurRadius={6}
                    onLoad={onLoad}
                />
                <FastImage
                    style={[blurStyles.image, blurStyles.next]}
                    source={{ uri: imageUrl('picsum/1018-256x256.jpg') }}
                    blurRadius={6}
                    onLoad={onLoad}
                />
            </View>
            <View style={blurStyles.status}>
                <CaseStatus
                    id="blur"
                    status={status}
                    description="blurRadius={6}: a photo sharp, blurred by React Native's Image (on Android it blurs in the file's pixels, so this 1024 px photo hardly changes), then by FastImage from a 1024 px and a 256 px file (alike)"
                />
            </View>
        </View>
    )
}

// A bundled image, a tinted one (the blurred logo, tinted green) and a GIF,
// which shows its first frame, blurred and still.
function BlurKindsCase() {
    const [status, onLoad] = useLoadedThenOk(3)
    return (
        <View style={styles.row}>
            <FastImage
                style={blurStyles.image}
                source={require('./images/fields.jpg')}
                blurRadius={6}
                onLoad={onLoad}
            />
            <FastImage
                style={[blurStyles.image, blurStyles.next]}
                resizeMode="contain"
                source={{ uri: LOGO }}
                tintColor="green"
                blurRadius={4}
                onLoad={onLoad}
            />
            <FastImage
                style={[blurStyles.image, blurStyles.next]}
                source={{ uri: imageUrl('jellyfish.gif') }}
                blurRadius={6}
                onLoad={onLoad}
            />
            <CaseStatus
                id="blur-kinds"
                status={status}
                description="Blurred: a bundled image, a tinted logo (soft green) and a GIF (its first frame, still)"
            />
        </View>
    )
}

// tintColor changed on a blurred image once it has loaded: it shows the new
// tint on the blurred image (iOS shows the blurred image with the new tint
// without blurring it again), matching the one tinted that way from the start.
function BlurTintChangeCase() {
    const [loaded, setLoaded] = useState(0)
    const [changed, setChanged] = useState(false)
    const [done, setDone] = useState(false)
    useEffect(() => {
        if (loaded < 2 || changed) return
        const timer = setTimeout(() => setChanged(true), 300)
        return () => clearTimeout(timer)
    }, [loaded, changed])
    useEffect(() => {
        if (!changed) return
        const timer = setTimeout(() => setDone(true), 500)
        return () => clearTimeout(timer)
    }, [changed])
    const onLoad = () => setLoaded((n) => n + 1)
    return (
        <View style={styles.row}>
            <FastImage
                style={blurStyles.image}
                resizeMode="contain"
                source={{ uri: LOGO }}
                tintColor={changed ? '#9324c3' : 'green'}
                blurRadius={4}
                onLoad={onLoad}
            />
            <FastImage
                style={[blurStyles.image, blurStyles.next]}
                resizeMode="contain"
                source={{ uri: LOGO }}
                tintColor="#9324c3"
                blurRadius={4}
                onLoad={onLoad}
            />
            <CaseStatus
                id="blur-tint-change"
                status={done ? 'OK' : 'loading'}
                description="tintColor changed from green to purple on a blurred logo after it loaded (should match the right one)"
            />
        </View>
    )
}

const BLUR_CHANGE_SOURCE = { uri: PRELOAD }

// The load events (onLoadStart, onProgress, onLoad, onLoadEnd) an image sends
// after its first load has ended, and handlers that record them. onDone runs
// when the first load ends.
function useLateEvents(onDone: () => void) {
    const afterRef = useRef(false)
    const [late, setLate] = useState<string[]>([])
    const note = (name: string) => () => {
        if (afterRef.current) setLate((names) => [...names, name])
    }
    const handlers = {
        onLoadStart: note('onLoadStart'),
        onProgress: note('onProgress'),
        onLoad: note('onLoad'),
        onLoadEnd: () => {
            note('onLoadEnd')()
            if (!afterRef.current) {
                afterRef.current = true
                onDone()
            }
        },
    }
    return [late, handlers] as const
}

// blurRadius changed once the image has loaded (after onLoadEnd, the load's
// last event): 0 → 6 matches the image blurred from the start, and 6 → 0 the
// sharp one. It's the image that's showing, so no load events fire again
// (Android loaded it again, with its events).
function BlurChangeCase() {
    const [on, setOn] = useState(false)
    const [off, setOff] = useState(false)
    const [done, setDone] = useState(false)
    const [lateOn, onHandlers] = useLateEvents(() => setOn(true))
    const [lateOff, offHandlers] = useLateEvents(() => setOff(true))
    useEffect(() => {
        if (!on || !off) return
        const timer = setTimeout(() => setDone(true), 1500)
        return () => clearTimeout(timer)
    }, [on, off])
    const late = [...lateOn, ...lateOff]
    const source = BLUR_CHANGE_SOURCE
    return (
        <View style={blurStyles.stacked}>
            <View style={blurStyles.images}>
                <FastImage
                    style={blurStyles.image}
                    source={source}
                    blurRadius={on ? 6 : 0}
                    {...onHandlers}
                />
                <FastImage
                    style={[blurStyles.image, blurStyles.next]}
                    source={source}
                    blurRadius={6}
                />
                <FastImage
                    style={[blurStyles.image, blurStyles.gap]}
                    source={source}
                    blurRadius={off ? 0 : 6}
                    {...offHandlers}
                />
                <FastImage
                    style={[blurStyles.image, blurStyles.next]}
                    source={source}
                />
            </View>
            <View style={blurStyles.status}>
                <CaseStatus
                    id="blur-change"
                    status={
                        late.length > 0
                            ? `fired again: ${late.join(', ')}`
                            : done
                              ? 'OK'
                              : 'waiting'
                    }
                    description="blurRadius changed after load: 0 → 6 (like the second), 6 → 0 (like the fourth), without load events"
                />
            </View>
        </View>
    )
}

// resizeMode="center" shows a small image at its own size. A large radius
// blurs a smaller copy, which must still show at that size.
function BlurCenterCase() {
    const [status, onLoad] = useLoadedThenOk(2)
    const source = { uri: imageUrl('picsum/1020-120x120.jpg') }
    return (
        <View style={blurStyles.stacked}>
            <View style={blurStyles.images}>
                <FastImage
                    style={blurStyles.large}
                    resizeMode="center"
                    source={source}
                    onLoad={onLoad}
                />
                <FastImage
                    style={[blurStyles.large, blurStyles.next]}
                    resizeMode="center"
                    source={source}
                    blurRadius={30}
                    onLoad={onLoad}
                />
            </View>
            <View style={blurStyles.status}>
                <CaseStatus
                    id="blur-center"
                    status={status}
                    description='resizeMode="center" with blurRadius={30}: a 120 px image at its own size, blurred the same size as the sharp one'
                />
            </View>
        </View>
    )
}

// defaultSource isn't blurred, as with React Native's Image.
function BlurDefaultSourceCase() {
    const [failed, setFailed] = useState(false)
    return (
        <View style={styles.row}>
            <FastImage
                style={blurStyles.image}
                source={{ uri: MISSING }}
                defaultSource={DEFAULT}
                blurRadius={6}
                onError={() => setFailed(true)}
            />
            <CaseStatus
                id="blur-default-source"
                status={failed ? 'OK' : 'waiting'}
                description="blurRadius with a source that fails: defaultSource shows, sharp"
            />
        </View>
    )
}

const blurStyles = StyleSheet.create({
    image: { width: 64, height: 64, backgroundColor: '#eee' },
    large: { width: 140, height: 140, backgroundColor: '#eee' },
    next: { marginLeft: 4 },
    gap: { marginLeft: 16 },
    // The images, then the status under them (CaseStatus's text is indented).
    stacked: { marginBottom: 12 },
    images: { flexDirection: 'row', marginBottom: 4 },
    status: { flexDirection: 'row', marginLeft: -12 },
})

// downsample (iOS, the default; Android always decodes at about the view's
// size). Each image is next to the same one with downsample false, which
// should look the same (or, for the stripes, smoother), and onLoad reports
// the full image's size.
function DownsampleCase({
    id,
    description,
    image,
    size,
    style,
    resizeMode = 'cover',
}: {
    id: string
    description: string
    image: string
    size: string
    style: { width: number; height: number }
    resizeMode?: FastImageProps['resizeMode']
}) {
    const [sizes, setSizes] = useState<string[]>([])
    const onLoad = (e: { nativeEvent: { width: number; height: number } }) => {
        // Read now: the event is reused after the handler.
        const size = `${e.nativeEvent.width}x${e.nativeEvent.height}`
        setSizes((s) => [...s, size])
    }
    const done = sizes.length === 2
    return (
        <View style={styles.row}>
            <FastImage
                style={style}
                resizeMode={resizeMode}
                source={{ uri: imageUrl(image) }}
                downsample
                onLoad={onLoad}
            />
            <FastImage
                style={[style, styles.gap]}
                resizeMode={resizeMode}
                source={{ uri: imageUrl(image) }}
                downsample={false}
                onLoad={onLoad}
            />
            <CaseStatus
                id={id}
                status={
                    !done
                        ? 'waiting'
                        : sizes.every((s) => s === size)
                          ? 'OK'
                          : `${sizes.join(', ')}, expected ${size}`
                }
                description={description}
            />
        </View>
    )
}

// A small view of a large image, then a larger one of the same image (like a
// list and a detail screen): the larger one is decoded again from the disk
// cache, at its own size (sharp), not downloaded again.
const DETAIL_PATH = `/picsum/1016-2048x2048.jpg?downsample=${RUN}`
function DownsampleDetailCase() {
    const [loads, setLoads] = useState(0)
    const [requests, setRequests] = useState<number>()
    useEffect(() => {
        if (loads !== 2) return
        fetch(imageUrl(`requests?path=${encodeURIComponent(DETAIL_PATH)}`))
            .then((response) => response.json())
            .then((json) => setRequests(json.count))
            .catch(() => setRequests(-1))
    }, [loads])
    const source = { uri: imageUrl(DETAIL_PATH.slice(1)) }
    const onLoad = () => setLoads((n) => n + 1)
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={source}
                downsample
                onLoad={onLoad}
            />
            {loads >= 1 ? (
                <FastImage
                    style={[downsampleStyles.large, styles.gap]}
                    source={source}
                    downsample
                    onLoad={onLoad}
                />
            ) : (
                <View style={[downsampleStyles.large, styles.gap]} />
            )}
            <CaseStatus
                id="downsample-detail"
                status={
                    requests === undefined
                        ? 'waiting'
                        : requests === 1
                          ? 'OK'
                          : `requested ${requests} times`
                }
                description="downsample: a larger view of the same image decodes it again (sharp) without downloading it again"
            />
        </View>
    )
}

// A view that grows after its image loaded: the image is decoded again for
// the new size (the text is sharp, not enlarged from the small one), without
// sending the load events again.
function DownsampleGrowCase() {
    const [large, setLarge] = useState(false)
    const [done, setDone] = useState(false)
    const events = useRef({ loadStart: 0, load: 0 })
    const [counts, setCounts] = useState('')
    useEffect(() => {
        if (!large) return
        const t = setTimeout(() => {
            const { loadStart, load } = events.current
            setCounts(`${loadStart} onLoadStart, ${load} onLoad`)
            setDone(true)
        }, 1000)
        return () => clearTimeout(t)
    }, [large])
    return (
        <View style={styles.row}>
            <FastImage
                style={large ? downsampleStyles.large : styles.image}
                source={{ uri: imageUrl('text-page.png') }}
                downsample
                onLoadStart={() => {
                    events.current.loadStart++
                }}
                onLoad={() => {
                    events.current.load++
                    setTimeout(() => setLarge(true), 300)
                }}
            />
            <CaseStatus
                id="downsample-grow"
                status={
                    !done
                        ? 'waiting'
                        : counts === '1 onLoadStart, 1 onLoad'
                          ? 'OK'
                          : counts
                }
                description="downsample: a view that grows after loading decodes the image again for its size (sharp text), without load events"
            />
        </View>
    )
}

// A view without a size until its image loads (sized from onLoad): it still
// loads, at full size.
function DownsampleNoSizeCase() {
    const [size, setSize] = useState<{ width: number; height: number }>()
    // Passes once the view has been laid out at that size (the screenshot
    // then shows the image).
    const [laidOut, setLaidOut] = useState(false)
    return (
        <View style={styles.row}>
            <View style={styles.image}>
                <FastImage
                    style={size}
                    source={{ uri: imageUrl('picsum/1018-600x300.jpg') }}
                    downsample
                    onLayout={(e) => {
                        if (e.nativeEvent.layout.width > 0) setLaidOut(true)
                    }}
                    onLoad={(e) =>
                        setSize({
                            width: 48,
                            height:
                                (48 * e.nativeEvent.height) /
                                e.nativeEvent.width,
                        })
                    }
                />
            </View>
            <CaseStatus
                id="downsample-no-size"
                status={laidOut ? 'OK' : 'waiting'}
                description="downsample: an image in a view sized from onLoad (no size before) still loads"
            />
        </View>
    )
}

// A downsampled view of an image that's still being preloaded (from the slow
// server, about a second here; the view loads 300 ms after the preload): on
// iOS it shares the preload's download (one request; it downloaded it again),
// its image is decoded to cover it (cropped, not stretched to the view's
// shape), and onLoad reports the full size. SDWebImage decodes each load of a
// download with the first load's image class. Android (Glide) downloads it
// again for the view, which has another size, so the requests aren't checked
// there.
const PRELOADING_GROUP = `downsample-preloading-${RUN}`
const PRELOADING = {
    uri: slowImageUrl(`text-page.png?delay=120&group=${PRELOADING_GROUP}`),
    headers: { 'x-token': 'fast-image' },
}
function DownsamplePreloadingCase() {
    const [size, setSize] = useState<string>()
    const [requests, setRequests] = useState<number>()
    // The view loads once the preload has started downloading.
    const [shown, setShown] = useState(false)
    useEffect(() => {
        FastImage.preload([PRELOADING])
        const t = setTimeout(() => setShown(true), 300)
        return () => clearTimeout(t)
    }, [])
    return (
        <View style={styles.row}>
            {shown ? (
                <FastImage
                    style={downsampleStyles.tall}
                    source={PRELOADING}
                    downsample
                    onLoad={(e) => {
                        setSize(
                            `${e.nativeEvent.width}x${e.nativeEvent.height}`,
                        )
                        fetch(imageUrl(`requests?group=${PRELOADING_GROUP}`))
                            .then((response) => response.json())
                            .then((json) => setRequests(json.count))
                            .catch(() => setRequests(-1))
                    }}
                />
            ) : (
                <View style={downsampleStyles.tall} />
            )}
            <CaseStatus
                id="downsample-preloading"
                status={
                    size === undefined || requests === undefined
                        ? 'waiting'
                        : size !== '1600x1000'
                          ? `${size}, expected 1600x1000`
                          : Platform.OS === 'ios' && requests !== 1
                            ? `requested ${requests} times`
                            : 'OK'
                }
                description="downsample: an image that's still being preloaded is downloaded once (iOS), and cropped to cover the view, not stretched; onLoad reports its full size"
            />
        </View>
    )
}

// An animated image, decoded smaller (it animates, so it's masked). In a
// small view: an image is only downsampled when it's at least twice the size
// the view needs.
const JELLYFISH_SIZE = '500x281'
function DownsampleGifCase() {
    const [size, setSize] = useState<string>()
    return (
        <View style={styles.row}>
            <Masked>
                <FastImage
                    style={downsampleStyles.small}
                    source={{ uri: imageUrl('jellyfish.gif') }}
                    downsample
                    onLoad={(e) =>
                        setSize(
                            `${e.nativeEvent.width}x${e.nativeEvent.height}`,
                        )
                    }
                />
            </Masked>
            <CaseStatus
                id="downsample-gif"
                status={
                    size === undefined
                        ? 'waiting'
                        : size === JELLYFISH_SIZE
                          ? 'OK'
                          : `${size}, expected ${JELLYFISH_SIZE}`
                }
                description={`downsample: an animated GIF loads and plays; onLoad reports its full size (${JELLYFISH_SIZE}; masked)`}
            />
        </View>
    )
}

// Images that are downsampled (so each view waits for its size) and not
// cached, mounted together: they start loading in the order the views are
// (left to right), which is the order they download in. On the New
// Architecture iOS started them as UIKit laid the views out, last first. Only
// checked there: on the legacy architecture the views have their size with
// their props and start loading in the order React Native sets those, and
// Android (which doesn't wait for the size) loads in another order too; with
// or without downsample, in both.
const ORDER_COUNT = 6
const CHECKS_ORDER =
    Platform.OS === 'ios' &&
    (globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager !=
        null
function DownsampleOrderCase() {
    const [order, setOrder] = useState<number[]>([])
    const [loaded, setLoaded] = useState(0)
    const started = (index: number) => () =>
        setOrder((o) => (o.includes(index) ? o : [...o, index]))
    // Once they've all loaded too, so the screenshot shows them.
    const done = order.length === ORDER_COUNT && loaded === ORDER_COUNT
    return (
        <View style={styles.row}>
            {Array.from({ length: ORDER_COUNT }, (_, index) => (
                // Each in a cell, as in a grid.
                <View
                    key={index}
                    collapsable={false}
                    style={[downsampleStyles.small, index > 0 && styles.gap]}
                >
                    <FastImage
                        style={downsampleStyles.fill}
                        source={{
                            uri: imageUrl(
                                `picsum/1016-2048x2048.jpg?order=${RUN}-${index}`,
                            ),
                        }}
                        downsample
                        onLoadStart={started(index)}
                        onLoad={() => setLoaded((n) => n + 1)}
                    />
                </View>
            ))}
            <CaseStatus
                id="downsample-order"
                status={
                    !done
                        ? 'waiting'
                        : !CHECKS_ORDER ||
                            order.every((index, i) => index === i)
                          ? 'OK'
                          : `started ${order.join(', ')}`
                }
                description="downsample: images mounted together start loading in order, left to right (iOS, New Architecture)"
            />
        </View>
    )
}

const downsampleStyles = StyleSheet.create({
    large: { width: 96, height: 96, backgroundColor: '#eee' },
    stripes: { width: 48, height: 48 },
    small: { width: 32, height: 32, backgroundColor: '#eee' },
    fill: { flex: 1 },
    tall: { width: 40, height: 96 },
    rotated: { width: 64, height: 96 },
})

// Photo library images (ph://, iOS, with SDWebImagePhotosPlugin, which the
// example apps add): a photo from the simulator's library by its id, listed
// by the example's ExamplePhotos module. It's decoded at about the view's
// size, and onLoad reports the photo's own size.
type LibraryPhoto = { id: string; width: number; height: number; type: string }
const libraryPhotos = (): Promise<{
    authorized: boolean
    photos: LibraryPhoto[]
}> => NativeModules.ExamplePhotos.photos()

function PhotoLibraryCase({
    id,
    type,
    description,
}: {
    id: string
    type: string
    description: string
}) {
    const [photo, setPhoto] = useState<LibraryPhoto>()
    const [status, setStatus] = useState('listing the photo library')
    useEffect(() => {
        libraryPhotos().then(
            ({ authorized, photos }) => {
                if (!authorized) return setStatus('no photo library access')
                const found = photos.find((p) => p.type === type)
                if (!found) return setStatus(`no ${type} photo in the library`)
                setPhoto(found)
                setStatus('loading')
            },
            (error) => setStatus(`${error}`),
        )
    }, [type])
    return (
        <View style={styles.row}>
            {photo ? (
                <FastImage
                    style={styles.image}
                    source={{ uri: `ph://${photo.id}` }}
                    onLoad={(e) => {
                        const { width, height } = e.nativeEvent
                        setStatus(
                            width === photo.width && height === photo.height
                                ? 'OK'
                                : `onLoad ${width}x${height}, the photo is ${photo.width}x${photo.height}`,
                        )
                    }}
                    onError={(e) => setStatus(`error: ${e.nativeEvent.error}`)}
                />
            ) : (
                <View style={styles.image} />
            )}
            <CaseStatus id={id} status={status} description={description} />
        </View>
    )
}

// Finds a photo of a type in the library, or says why there's none.
function useLibraryPhoto(type: string) {
    const [photo, setPhoto] = useState<LibraryPhoto>()
    const [status, setStatus] = useState('listing the photo library')
    useEffect(() => {
        libraryPhotos().then(
            ({ authorized, photos }) => {
                if (!authorized) return setStatus('no photo library access')
                const found = photos.find((p) => p.type === type)
                if (!found) return setStatus(`no ${type} photo in the library`)
                setPhoto(found)
                setStatus('loading')
            },
            (error) => setStatus(`${error}`),
        )
    }, [type])
    return [photo, status, setStatus] as const
}

// A photo shown again after the memory cache was cleared (in a new view):
// onLoad still has the photo's own size, not the size it was decoded at.
function PhotoLibraryAgainCase() {
    const [photo, status, setStatus] = useLibraryPhoto('public.jpeg')
    const [again, setAgain] = useState(false)
    const onLoad =
        (second: boolean) =>
        async (e: { nativeEvent: { width: number; height: number } }) => {
            if (!photo) return
            const { width, height } = e.nativeEvent
            if (width !== photo.width || height !== photo.height) {
                return setStatus(
                    `onLoad ${width}x${height}${second ? ' the second time' : ''}, the photo is ${photo.width}x${photo.height}`,
                )
            }
            if (second) return setStatus('OK')
            await FastImage.clearMemoryCache()
            setAgain(true)
        }
    return (
        <View style={styles.row}>
            {photo && !again ? (
                <FastImage
                    key="first"
                    style={styles.image}
                    source={{ uri: `ph://${photo.id}` }}
                    onLoad={onLoad(false)}
                    onError={(e) => setStatus(`error: ${e.nativeEvent.error}`)}
                />
            ) : photo ? (
                <FastImage
                    key="again"
                    style={styles.image}
                    source={{ uri: `ph://${photo.id}` }}
                    onLoad={onLoad(true)}
                    onError={(e) => setStatus(`error: ${e.nativeEvent.error}`)}
                />
            ) : (
                <View style={styles.image} />
            )}
            <CaseStatus
                id="photo-library-again"
                status={status}
                description="A photo shown again after clearMemoryCache (in a new view): onLoad still has the photo's own size"
            />
        </View>
    )
}

// A GIF from the photo library animates: loop-forever.gif (red, then blue),
// which verify.mts adds to the simulator's library. Paused on its first frame
// (red) until the recording starts, then played once, ending on blue.
const RED = '#ff0000'
const BLUE = '#0000ff'
function PhotoLibraryGifCase() {
    const sample = useContext(SampleContext)
    const view = useRef<React.ComponentRef<typeof View>>(null)
    const [photo, status, setStatus] = useLibraryPhoto('com.compuserve.gif')
    const [playing, setPlaying] = useState(false)
    const started = useRef(false)
    const expect = [RED, BLUE]
    const onLoad = async () => {
        if (started.current) return
        started.current = true
        const area = await measureView(view.current)
        if (!area) return setStatus('not on screen')
        setStatus('recording')
        const result = await sample(
            {
                name: 'photo-library-gif',
                area,
                durationMs: 3000,
                expect,
                palette: [RED, BLUE, BLANK],
            },
            (done) => {
                setPlaying(true)
                // One play takes 0.8 s.
                setTimeout(done, 1500)
            },
        )
        setStatus(sampleStatus(result, expect))
    }
    return (
        <View style={styles.row}>
            <View ref={view} collapsable={false}>
                {photo ? (
                    <FastImage
                        style={styles.image}
                        source={{ uri: `ph://${photo.id}` }}
                        paused={!playing}
                        loop={false}
                        onLoad={onLoad}
                        onError={(e) =>
                            setStatus(`error: ${e.nativeEvent.error}`)
                        }
                    />
                ) : (
                    <View style={styles.image} />
                )}
            </View>
            <CaseStatus
                id="photo-library-gif"
                status={status}
                description="A GIF from the photo library animates (recorded: red, then blue)"
            />
        </View>
    )
}

// A photo library source that can't load fails with a message that says why.
function PhotoLibraryErrorCase({
    id,
    uri,
    expected,
    description,
}: {
    id: string
    uri: string
    expected: string
    description: string
}) {
    const [status, setStatus] = useState('waiting')
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={{ uri }}
                onLoad={() => setStatus('loaded')}
                onError={(e) => {
                    const { error } = e.nativeEvent
                    setStatus(
                        error.includes(expected) ? 'OK' : `error: ${error}`,
                    )
                }}
            />
            <CaseStatus id={id} status={status} description={description} />
        </View>
    )
}

export type { RegressionGroup }

// resizeMode repeat: the image repeated from the top-left at its own size, as
// React Native's Image (right) does: a 20px tile of four colors (red, green,
// blue, yellow), and a 200px photo larger than the view, scaled down to fit.
// The image's own size is in pixels. On Android, React Native's Image is left
// out of the screenshot: it tiles with one Matrix shared by every Image
// (ReactImageView's tileMatrix) on Fresco's threads, so Images tiled at the
// same time sometimes draw with each other's scale.
const QUADRANTS = imageUrl('quadrants.png')
function RepeatCase({
    id,
    uri,
    tintColor,
    description,
}: {
    id: string
    uri: string
    tintColor?: string
    description: string
}) {
    const [status, onLoad] = useLoadedThenOk(2)
    const image = (
        <Image
            style={[repeatStyles.image, { tintColor }]}
            resizeMode="repeat"
            source={{ uri }}
            onLoad={onLoad}
        />
    )
    return (
        <View style={styles.row}>
            <FastImage
                style={repeatStyles.image}
                resizeMode="repeat"
                source={{ uri }}
                tintColor={tintColor}
                onLoad={onLoad}
            />
            {Platform.OS === 'android' ? (
                <Masked style={styles.gap}>{image}</Masked>
            ) : (
                <View style={styles.gap}>{image}</View>
            )}
            <CaseStatus id={id} status={status} description={description} />
        </View>
    )
}

// An animated image repeats its first frame (still): a GIF of two colors.
function RepeatGifCase() {
    const [status, onLoad] = useLoadedThenOk(1)
    return (
        <View style={styles.row}>
            <FastImage
                style={repeatStyles.image}
                resizeMode="repeat"
                source={{ uri: imageUrl('loop-forever.gif') }}
                onLoad={onLoad}
            />
            <CaseStatus
                id="repeat-gif"
                status={status}
                description="repeat with a GIF (80px, larger than the view's height): its first frame, still, scaled down and repeated"
            />
        </View>
    )
}

// resizeMode changed after the image loaded (left) matches the view that had
// it from the start (right): to repeat, and from repeat to cover.
function RepeatChangeCase({ to }: { to: 'repeat' | 'cover' }) {
    const [status, onLoad] = useLoadedThenOk(2)
    const [changed, setChanged] = useState(false)
    const from = to === 'repeat' ? 'cover' : 'repeat'
    return (
        <View style={styles.row}>
            <FastImage
                style={repeatStyles.image}
                resizeMode={changed ? to : from}
                source={{ uri: QUADRANTS }}
                onLoad={() => {
                    if (!changed) setTimeout(() => setChanged(true), 300)
                    onLoad()
                }}
            />
            <FastImage
                style={[repeatStyles.image, styles.gap]}
                resizeMode={to}
                source={{ uri: QUADRANTS }}
                onLoad={onLoad}
            />
            <CaseStatus
                id={`to-${to}`}
                status={changed ? status : 'waiting'}
                description={`resizeMode ${from} changed to ${to} after loading (left) matches ${to} from the start (right)`}
            />
        </View>
    )
}

const repeatStyles = StyleSheet.create({
    image: { width: 120, height: 60, backgroundColor: '#eeeeee' },
})

// Several sources (source as an array of sizes): the view loads the one whose
// size in pixels is closest to its own. Solid colors so the screenshot shows
// which: 100 px red, 300 px green, 900 px blue. Each case checks onLoad's
// size against the same rule worked out here for the view's size.
const SIZES = [100, 300, 900]
const sizedSources = (id: string) =>
    SIZES.map((size) => ({
        uri: imageUrl(`sized-${size}.png?${id}=${RUN}`),
        width: size,
        height: size,
    }))
// The size a view of this size (in points) picks: the closest pixel count, or
// the largest for a view with no size.
function expectedSize(width: number, height: number) {
    const scale = PixelRatio.get()
    const viewPixels = Math.round(width * scale) * Math.round(height * scale)
    if (viewPixels === 0) return SIZES[SIZES.length - 1]
    const fit = (size: number) => Math.abs(1 - (size * size) / viewPixels)
    return SIZES.reduce((best, size) => (fit(size) < fit(best) ? size : best))
}

function SeveralSourcesCase({ id, size }: { id: string; size: number }) {
    const [status, setStatus] = useState('loading')
    const expected = expectedSize(size, size)
    return (
        <View style={styles.row}>
            <FastImage
                style={{ width: size, height: size }}
                source={sizedSources(id)}
                onLoad={(e) =>
                    setStatus(
                        e.nativeEvent.width === expected
                            ? 'OK'
                            : `picked ${e.nativeEvent.width} px, expected ${expected} px`,
                    )
                }
                onError={(e) => setStatus(`error: ${e.nativeEvent.error}`)}
            />
            <CaseStatus
                id={id}
                status={status}
                description={`several sources (100, 300, 900 px) in a ${size} pt view: loads the ${expected} px one (red 100, green 300, blue 900)`}
            />
        </View>
    )
}

// The view grows after its image loaded: it loads the size that fits better.
function SeveralSourcesResizeCase() {
    const [big, setBig] = useState(false)
    const [status, setStatus] = useState('loading')
    const small = 40
    const large = 200
    return (
        <View style={styles.row}>
            <FastImage
                style={
                    big
                        ? { width: large, height: large }
                        : { width: small, height: small }
                }
                source={sizedSources('several-resize')}
                onLoad={(e) => {
                    const width = e.nativeEvent.width
                    if (!big) {
                        if (width !== expectedSize(small, small)) {
                            setStatus(`first picked ${width} px`)
                        } else {
                            setBig(true)
                        }
                    } else {
                        setStatus(
                            width === expectedSize(large, large)
                                ? 'OK'
                                : `after growing picked ${width} px`,
                        )
                    }
                }}
                onError={(e) => setStatus(`error: ${e.nativeEvent.error}`)}
            />
            <CaseStatus
                id="several-resize"
                status={status}
                description={`several sources: a ${small} pt view that grows to ${large} pt after loading loads the ${expectedSize(large, large)} px size`}
            />
        </View>
    )
}

// An array of one is a plain source (not picked by size), and a view with no
// size loads the largest of several.
function SeveralSourcesEdgeCase() {
    const [one, setOne] = useState('loading')
    const [none, setNone] = useState('loading')
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={[sizedSources('several-one')[2]]}
                onLoad={(e) =>
                    setOne(
                        e.nativeEvent.width === 900
                            ? 'OK'
                            : `${e.nativeEvent.width} px`,
                    )
                }
            />
            <FastImage
                style={{ width: 0, height: 0 }}
                source={sizedSources('several-no-size')}
                onLoad={(e) =>
                    setNone(
                        e.nativeEvent.width === 900
                            ? 'OK'
                            : `${e.nativeEvent.width} px`,
                    )
                }
            />
            <CaseStatus
                id="several-edge"
                status={
                    one === 'OK' && none === 'OK'
                        ? 'OK'
                        : `one: ${one}; no size: ${none}`
                }
                description="an array of one source loads it as it is (blue), and a view with no size loads the largest"
            />
        </View>
    )
}

// Image formats, for the README's table of them. The samples in the image
// server's images/formats/ are the same picture in each format (red, green,
// blue and yellow quadrants, 80x80), and the animated ones are red, then blue,
// 400 ms each, looping. A case passes when the format does what `expected`
// says on this platform, so a change in what's supported fails it (and the
// table needs updating). Check the screenshot: four flat quadrants.
type FormatResult = 'loads' | 'fails'
function FormatCase({
    id,
    file,
    expected,
    description,
}: {
    id: string
    file: string
    expected: FormatResult
    description: string
}) {
    const [status, setStatus] = useState('waiting')
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                resizeMode="contain"
                source={{ uri: imageUrl(`formats/${file}`) }}
                onLoad={(e) => {
                    const { width, height } = e.nativeEvent
                    setStatus(
                        expected === 'fails'
                            ? `loaded (${width}x${height}), expected it to fail`
                            : width === 80 && height === 80
                              ? 'OK'
                              : `loaded at ${width}x${height}, expected 80x80`,
                    )
                }}
                onError={(e) =>
                    setStatus(
                        expected === 'fails'
                            ? 'OK'
                            : `error: ${e.nativeEvent.error}`,
                    )
                }
            />
            <CaseStatus id={id} status={status} description={description} />
        </View>
    )
}

// An animated format: it animates (red and blue are both recorded), shows only
// its first frame (red), or fails to load. It loops, so a recording can start
// on either frame: what was seen is classified here rather than matched.
type AnimationResult = 'animates' | 'first frame' | 'fails'
function FormatAnimationCase({
    id,
    file,
    expected,
    description,
}: {
    id: string
    file: string
    expected: AnimationResult
    description: string
}) {
    const sample = useContext(SampleContext)
    const view = useRef<React.ComponentRef<typeof View>>(null)
    const [status, setStatus] = useState('waiting')
    const started = useRef(false)
    const onLoad = async () => {
        if (started.current) return
        started.current = true
        if (expected === 'fails')
            return setStatus('loaded, expected it to fail')
        const area = await measureView(view.current)
        if (!area) return setStatus('not on screen')
        setStatus('recording')
        const result = await sample(
            {
                name: id,
                area,
                durationMs: 3000,
                expect: [RED, BLUE],
                palette: [RED, BLUE, BLANK],
            },
            // Two plays (0.8 s each).
            (done) => setTimeout(done, 1600),
        )
        const { seen } = result
        const got =
            seen.includes(RED) && seen.includes(BLUE)
                ? 'animates'
                : seen.length === 1 && seen[0] === RED
                  ? 'first frame'
                  : (result.detail ?? `saw ${seen.join(', ') || 'nothing'}`)
        setStatus(
            got === expected
                ? 'OK'
                : got === 'animates' || got === 'first frame'
                  ? `${got === 'animates' ? 'animates' : 'shows its first frame'}, expected: ${expected}`
                  : got,
        )
    }
    return (
        <View style={styles.row}>
            <Masked>
                <View ref={view} collapsable={false}>
                    <FastImage
                        style={styles.image}
                        source={{ uri: imageUrl(`formats/${file}`) }}
                        onLoad={onLoad}
                        onError={(e) =>
                            setStatus(
                                expected === 'fails'
                                    ? 'OK'
                                    : `error: ${e.nativeEvent.error}`,
                            )
                        }
                    />
                </View>
            </Masked>
            <CaseStatus id={id} status={status} description={description} />
        </View>
    )
}

// SVG images (the example apps have SDWebImageSVGCoder on iOS and AndroidSVG
// on Android: the main app's androidsvg-aar package, the legacy app's
// androidsvg). onLoad has the SVG's own size (its width and height, or its
// viewBox's). Check the screenshot: flat colors, sharp edges.
function SvgCase({
    id,
    source,
    style,
    expected,
    resizeMode,
    tintColor,
    downsample,
    description,
}: {
    id: string
    source: Source | number
    style: { width: number; height: number }
    expected: [number, number]
    resizeMode?: FastImageProps['resizeMode']
    tintColor?: string
    downsample?: boolean
    description: string
}) {
    const [status, setStatus] = useState('loading')
    return (
        <View style={styles.row}>
            <FastImage
                style={[style, { backgroundColor: '#eee' }]}
                source={source}
                resizeMode={resizeMode}
                tintColor={tintColor}
                downsample={downsample}
                onLoad={(e) => {
                    const { width, height } = e.nativeEvent
                    setStatus(
                        width === expected[0] && height === expected[1]
                            ? 'OK'
                            : `onLoad ${width}x${height}, expected ${expected[0]}x${expected[1]}`,
                    )
                }}
                onError={(e) => setStatus(`error: ${e.nativeEvent.error}`)}
            />
            <CaseStatus id={id} status={status} description={description} />
        </View>
    )
}

// The same SVG small and large: the large one drawn at its size (thin, sharp
// rings), not scaled up from a small bitmap.
function SvgSharpCase() {
    const [loaded, setLoaded] = useState(0)
    const [error, setError] = useState<string>()
    const source = { uri: imageUrl('svg-rings.svg') }
    const onLoad = () => setLoaded((n) => n + 1)
    const onError = (e: { nativeEvent: { error: string } }) =>
        setError(e.nativeEvent.error)
    return (
        <View style={styles.row}>
            <FastImage
                style={{ width: 24, height: 24 }}
                source={source}
                onLoad={onLoad}
                onError={onError}
            />
            <FastImage
                style={[{ width: 160, height: 160 }, styles.gap]}
                source={source}
                onLoad={onLoad}
                onError={onError}
            />
            <CaseStatus
                id="svg-sharp"
                status={
                    error ? `error: ${error}` : loaded >= 2 ? 'OK' : 'loading'
                }
                description="An SVG at 24 and 160: the large one has thin, sharp rings"
            />
        </View>
    )
}

export const REGRESSION_GROUPS: RegressionGroup[] = [
    {
        name: 'load-end',
        cases: [
            <LoadEndResultCase
                key="load-end-ok"
                id="load-end-ok"
                uri={LOGO}
                description="onLoadEnd gets ok and the size onLoad got"
            />,
            <LoadEndResultCase
                key="load-end-error"
                id="load-end-error"
                uri={MISSING}
                description="onLoadEnd gets not ok and the error onError got (a 404)"
            />,
        ],
    },
    {
        name: 'events',
        cases: [
            <EventCase
                key="tint-remote"
                id="tint-remote"
                description="#1082: tintColor on a remote image with no defaultSource"
                event="onLoad"
                source={{ uri: LOGO }}
                tintColor="green"
            />,
            <EventCase
                key="tint-404"
                id="tint-404"
                description="#1082: tintColor on an image that fails to load"
                event="onError"
                source={{ uri: MISSING }}
                tintColor="green"
            />,
            <EventCase
                key="remove-onLoad"
                id="remove-onLoad"
                description="#1088: onLoad removed after it fires"
                event="onLoad"
                removeAfter
                source={{ uri: LOGO }}
            />,
            <EventCase
                key="remove-onLoadEnd"
                id="remove-onLoadEnd"
                description="#1088: onLoadEnd removed after it fires"
                event="onLoadEnd"
                removeAfter
                source={{ uri: LOGO }}
            />,
            <EventCase
                key="remove-onError"
                id="remove-onError"
                description="#1088: onError removed after it fires"
                event="onError"
                removeAfter
                source={{ uri: MISSING }}
            />,
        ],
    },
    {
        name: 'errors',
        cases: [
            <EventCase
                key="error-invalid-data-uri"
                id="error-invalid-data-uri"
                description="A data: uri that isn't an image fires onError (iOS fired onLoad with 0x0)"
                event="onError"
                source={{ uri: 'data:image/png;base64,bm90IGFuIGltYWdl' }}
            />,
            <EventCase
                key="error-empty-uri"
                id="error-empty-uri"
                description="#1028: an empty uri fires onError (Android didn't)"
                event="onError"
                source={{ uri: '' }}
            />,
            <EventCase
                key="error-null-uri-default"
                id="error-null-uri-default"
                description="#945: a null uri fires onError and shows defaultSource (Android showed nothing)"
                event="onError"
                source={{ uri: null as unknown as string }}
                defaultSource={DEFAULT}
            />,
            <EventCase
                key="error-null-uri-downsample"
                id="error-null-uri-downsample"
                description="a null uri with downsample fires onError (iOS crashed)"
                event="onError"
                source={{ uri: null as unknown as string }}
                downsample
            />,
            <ErrorMessageCase key="error-message" />,
        ],
    },
    {
        name: 'no-crash',
        cases: [
            <NoCrashCase
                key="default-no-source"
                id="default-no-source"
                description="#973: defaultSource with no source (Android crashed)"
            >
                <FastImage style={styles.image} defaultSource={DEFAULT} />
            </NoCrashCase>,
            <NoCrashCase
                key="preload-no-uri"
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
            />,
            <NoCrashCase
                key="preload-unresolved"
                id="preload-unresolved"
                description="#849: preload with a uri that can't be resolved (Android crashed)"
                onMount={() =>
                    FastImage.preload([{ uri: 'not-a-real-image.jpg' }])
                }
            />,
            Platform.OS === 'android' ? (
                <EventCase
                    key="asset-uri"
                    id="asset-uri"
                    description="#1068: an asset:/ uri (a file in the app's Android assets) loads"
                    event="onLoad"
                    source={{ uri: 'asset:/fastimage-logo.png' }}
                />
            ) : (
                <NoCrashCase
                    key="asset-uri"
                    id="asset-uri"
                    description="#1068: asset:/ uris are Android only"
                />
            ),
            <EventCase
                key="zero-size"
                id="zero-size"
                description="#865: a 0×0 image still loads (Android never did)"
                event="onLoad"
                source={{ uri: imageUrl('picsum/1020-120x120.jpg') }}
                style={{ width: 0, height: 0 }}
            />,
            <EventCase
                key="zero-height"
                id="zero-height"
                description="#865: an image with a width but no height still loads"
                event="onLoad"
                source={{ uri: imageUrl('picsum/1021-120x120.jpg') }}
                style={{ width: 60, height: 0 }}
            />,
        ],
    },
    {
        name: 'layout',
        cases: [
            <LayoutCase key="layout" id="layout" />,
            <LayoutCase key="layout-fallback" id="layout-fallback" fallback />,
            <EventCase
                key="fallback-require"
                id="fallback-require"
                description="#1044: fallback with a require()d image (should show the logo)"
                event="onLoad"
                source={require('./images/logo.png')}
                fallback
            />,
            <EventCase
                key="tint-style"
                id="tint-style"
                description="#946: tintColor in style (should be green)"
                event="onLoad"
                source={{ uri: LOGO }}
                style={[styles.image, { tintColor: 'green' }]}
            />,
            <SourceSizeCase
                key="source-size"
                id="source-size"
                description="#608: onLoad reports the image's size, not the size decoded for the view (600x300)"
                uri={imageUrl('picsum/1018-600x300.jpg')}
                width={600}
                height={300}
            />,
            <SourceSizeCase
                key="source-size-gif"
                id="source-size-gif"
                description="#608: the same for a GIF (500x281)"
                uri={imageUrl('jellyfish.gif')}
                width={500}
                height={281}
            />,
            <SourceSizeCachedCase key="source-size-cached" />,
        ],
    },
    {
        // Checked by screenshot as much as by status.
        name: 'visual',
        cases: [
            <ClearTintCase key="clear-tint" />,
            <ResizeModeChangeCase key="resize-mode" />,
            <CenterCase key="resize-center" />,
            <NoCrashCase
                key="gif-loop-once"
                id="gif-loop-once"
                description="#651: a GIF without a loop count plays once and stops on cyan (Android looped every GIF forever)"
            >
                <FastImage
                    style={styles.image}
                    source={{ uri: imageUrl('loop-once.gif') }}
                />
            </NoCrashCase>,
            <SizeChangeCase key="size-change" />,
        ],
    },
    {
        name: 'gif-loop',
        cases: [
            <GifLoopCase
                key="gif-loop-false"
                id="gif-loop-false"
                description="loop={false}: a GIF that loops forever by itself plays once and stops on blue"
                loop={false}
                plays={1}
                source="loop-forever.gif"
            />,
            <GifLoopCase
                key="gif-loop-count"
                id="gif-loop-count"
                description="loop={2}: a GIF that loops forever by itself plays twice and stops on purple"
                loop={2}
                plays={2}
                source="loop-forever-2.gif"
            />,
            <GifLoopCase
                key="gif-loop-true"
                id="gif-loop-true"
                description="loop: a GIF that plays once by itself keeps looping (yellow and green; masked)"
                loop
                plays={1}
                source="loop-once-2.gif"
                animates
            />,
            <GifLoopChangeCase key="gif-loop-change" />,
            <GifPausedCase key="gif-paused" />,
            <GifPausedCase key="gif-resume" resume />,
            <GifResumeFinishedCase key="gif-resume-finished" />,
        ],
    },
    {
        name: 'image-rendering',
        cases: [<ImageRenderingCase key="image-rendering" />],
    },
    {
        name: 'blur',
        cases: [
            <BlurCase key="blur" />,
            <BlurKindsCase key="blur-kinds" />,
            <BlurChangeCase key="blur-change" />,
            <BlurDefaultSourceCase key="blur-default-source" />,
        ],
    },
    {
        name: 'blur-center',
        cases: [
            <BlurCenterCase key="blur-center" />,
            <BlurTintChangeCase key="blur-tint-change" />,
        ],
    },
    {
        name: 'repeat',
        cases: [
            <RepeatCase
                key="repeat-tile"
                id="repeat-tile"
                uri={QUADRANTS}
                description="resizeMode repeat: a 20px tile (red, green, blue, yellow) repeated from the top-left, as Image (right)"
            />,
            <RepeatCase
                key="repeat-big"
                id="repeat-big"
                uri={imageUrl('picsum/1025-200x200.jpg')}
                description="repeat with an image larger than the view: scaled down to fit, then repeated, as Image (right)"
            />,
            <RepeatCase
                key="repeat-tint"
                id="repeat-tint"
                uri={imageUrl('sprite-12.png')}
                tintColor="#9324c3"
                description="repeat with tintColor: the tile tinted, then repeated, as Image (right)"
            />,
        ],
    },
    {
        name: 'repeat-change',
        cases: [
            <RepeatGifCase key="repeat-gif" />,
            <RepeatChangeCase key="to-repeat" to="repeat" />,
            <RepeatChangeCase key="to-cover" to="cover" />,
        ],
    },
    {
        name: 'downsampling',
        cases: [
            <DownsampleCase
                key="downsample-stripes"
                id="downsample-stripes"
                description="downsample (left): 1px stripes (1024px) in a 48 view decode to an even gray on iOS, not the stripes drawn smaller (right). Android: both black (Glide keeps every nth pixel of a PNG)"
                image="stripes.png"
                size="1024x1024"
                style={downsampleStyles.stripes}
            />,
            <DownsampleCase
                key="downsample-cover"
                id="downsample-cover"
                description="downsample (left) with cover: a wide page of text in a tall view is as sharp as without (right), decoded to cover the view, not fit in it"
                image="text-page.png"
                size="1600x1000"
                style={downsampleStyles.tall}
            />,
            <DownsampleCase
                key="downsample-orientation"
                id="downsample-orientation"
                description="downsample (left): a JPEG stored sideways with an EXIF orientation shows upright and as sharp as without (right)"
                image="exif-rotated.jpg"
                size="800x1200"
                style={downsampleStyles.rotated}
                resizeMode="contain"
            />,
        ],
    },
    {
        name: 'downsampling-reload',
        cases: [
            <DownsampleDetailCase key="downsample-detail" />,
            <DownsampleGrowCase key="downsample-grow" />,
            <DownsampleNoSizeCase key="downsample-no-size" />,
            <DownsampleGifCase key="downsample-gif" />,
            <DownsamplePreloadingCase key="downsample-preloading" />,
            <DownsampleOrderCase key="downsample-order" />,
        ],
    },
    {
        name: 'loading',
        cases: [
            <NoReloadCase key="no-reload" />,
            <SourceSwapCase key="source-swap" />,
            <LoadStartOnceCase key="load-start-once" />,
            <ProgressCase key="progress" />,
            <ProgressUnknownSizeCase key="progress-unknown-size" />,
            <ProgressGzipCase key="progress-gzip" />,
            <WebCacheCase key="web-cache" />,
            <CookiesCase key="cookies" />,
        ],
    },
    {
        // Clears the caches, so on its own.
        name: 'web-cache-clear',
        cases: [<WebCacheClearCase key="web-cache-clear" />],
    },
    {
        // The slow ones: the slow server takes about 1 s per image here, and
        // preload-limit loads 4 of them, 3 at a time.
        name: 'preload',
        cases: [
            <PreloadCase key="preload" />,
            <PreloadHeadersCase key="preload-headers" />,
            <PreloadReuseCase key="preload-reuse" />,
            <PreloadResultsCase key="preload-results" />,
            <PreloadLimitCase key="preload-limit" />,
            <PreloadDiskCase key="preload-disk" />,
            <PreloadCacheOnlyCase key="preload-cache-only" />,
            <PreloadRetryCase key="preload-retry" id="preload-retry" />,
        ],
    },
    {
        name: 'bad-responses',
        cases: [
            <PreloadRetryCase
                key="preload-retry-web"
                id="preload-retry-web"
                web
            />,
            <ViewRetryCase key="view-retry" />,
            <MislabeledCase key="mislabeled" />,
            <Web404Case key="web-404" />,
        ],
    },
    {
        name: 'cache-key',
        cases: [
            <CacheKeyCase
                key="cache-key"
                id="cache-key"
                description="#524: source.cacheKey: the same image with another token in its url comes from the cache (the new url isn't requested)"
            />,
            <CacheKeyCase
                key="cache-key-preload"
                id="cache-key-preload"
                preload
                description="source.cacheKey with preload: a preloaded image is found under its cacheKey"
            />,
            <CacheKeyCase
                key="cache-key-downsample"
                id="cache-key-downsample"
                downsample
                description="source.cacheKey with downsample: the downloaded file is found under the cacheKey"
            />,
            <MemoryCacheOffCase key="memory-cache-off" />,
        ],
    },
    {
        name: 'cache-path',
        cases: [
            <CachePathCase
                key="cache-path"
                id="cache-path"
                loaded
                description="getCachePath for an image a view loaded: its file (right)"
            />,
            <CachePathCase
                key="cache-path-key"
                id="cache-path-key"
                loaded
                byCacheKey
                description="getCachePath for an image with a cacheKey: its file"
            />,
            <CachePathCase
                key="cache-path-download"
                id="cache-path-download"
                description="getCachePath for an image that wasn't loaded: downloads it (one request) and gives its file"
            />,
            <CachePathCase
                key="cache-path-cache-only"
                id="cache-path-cache-only"
                cacheOnly
                description="getCachePath with cache 'cacheOnly' for an image that wasn't loaded: not ok, no request"
            />,
            <CachePathCase
                key="cache-path-404"
                id="cache-path-404"
                missing
                description="getCachePath for a url that 404s: not ok, with the status"
            />,
            <CachePathCase
                key="cache-path-space"
                id="cache-path-space"
                loaded
                space
                description="getCachePath for a url with a space: its file"
            />,
        ],
    },
    {
        name: 'cache-path-more',
        cases: [
            <CachePathCase
                key="cache-path-web"
                id="cache-path-web"
                loaded
                web
                description="getCachePath for an image with cache 'web' (on Android, in the HTTP cache)"
            />,
            <CachePathCase
                key="cache-path-web-cache-only"
                id="cache-path-web-cache-only"
                loaded
                web
                cacheOnly
                description="getCachePath with cache 'cacheOnly' for an image loaded with cache 'web': its file, on both platforms"
            />,
            <CachePathCase
                key="cache-path-key-only"
                id="cache-path-key-only"
                loaded
                keyOnly
                description="getCachePath with only a cacheKey (no uri), for an image a view loaded: its file"
            />,
            <CachePathCase
                key="cache-path-key-only-missing"
                id="cache-path-key-only-missing"
                keyOnly
                description="getCachePath with only a cacheKey that isn't cached: not ok, no request"
            />,
            <CachePathCase
                key="cache-path-while-loading"
                id="cache-path-while-loading"
                whileLoading
                description="getCachePath while a view is still downloading the image: its file"
            />,
        ],
    },
    {
        name: 'write-to-cache',
        cases: [
            <WriteToCacheCase
                key="write-to-cache"
                id="write-to-cache"
                description="writeToCache: a url shows the stored file (green), without a request"
            />,
            <WriteToCacheCase
                key="write-to-cache-key"
                id="write-to-cache-key"
                byCacheKey
                description="writeToCache with a cacheKey: the url shows the stored file"
            />,
            <WriteToCacheCase
                key="write-to-cache-key-only"
                id="write-to-cache-key-only"
                keyOnly
                description="writeToCache with only a cacheKey (no uri): the url with that cacheKey shows the stored file"
            />,
            <WriteToCacheCase
                key="write-to-cache-cached"
                id="write-to-cache-cached"
                cached
                description="writeToCache for a url that's cached: not replaced"
            />,
            <WriteToCacheCase
                key="write-to-cache-missing"
                id="write-to-cache-missing"
                missing
                description="writeToCache with a file that doesn't exist: not ok"
            />,
            <WriteToCacheCase
                key="write-to-cache-web"
                id="write-to-cache-web"
                web
                description="writeToCache for a cache 'web' source: not ok"
            />,
        ],
    },
    {
        name: 'source-change',
        cases: [
            <SourceChangeWhileLoadingCase
                key="source-change-loading"
                id="source-change-loading"
            />,
            <SourceChangeWhileLoadingCase
                key="source-change-keep-previous"
                id="source-change-keep-previous"
                keepPrevious
            />,
            <SourceChangeWhileLoadingCase
                key="source-change-data"
                id="source-change-data"
                toData
            />,
            <SourceClearedWhileLoadingCase
                key="source-cleared"
                id="source-cleared"
            />,
        ],
    },
    {
        // Recorded (video samples).
        name: 'fade',
        cases: [
            <FadeCase
                key="fade"
                id="fade"
                from="download"
                fades
                description="transition: a downloaded image fades in over 1 s (recorded: black, half cyan, cyan)"
            />,
            <FadeCase
                key="fade-memory"
                id="fade-memory"
                from="memory"
                fades={false}
                description="transition: the same image from the memory cache (right) shows at once (recorded: black, then cyan)"
            />,
            <FadeCase
                key="fade-memory-none"
                id="fade-memory-none"
                from="memory"
                skipOnCacheHit="none"
                fades
                description="transition with skipOnCacheHit none: the same image from the memory cache (right) fades in (recorded: black, half cyan, cyan)"
            />,
            <FadeCase
                key="fade-blur"
                id="fade-blur"
                from="download"
                blurRadius={6}
                fades
                description="transition with blurRadius: a downloaded image fades in once it's blurred (recorded: black, half cyan, cyan; blurring a flat color keeps it)"
            />,
        ],
    },
    {
        // Recorded (video samples).
        name: 'fade-source',
        cases: [
            <FadeCase
                key="fade-change"
                id="fade-change"
                from="change"
                fades={false}
                description="transition: a new source from the memory cache shows at once over the image showing, as in a reused list row (right; recorded: magenta, then cyan)"
            />,
            <FadeCase
                key="fade-file"
                id="fade-file"
                from="file"
                fades
                description="transition: a local file:// image fades in (right; the file getCachePath gives for the left one; recorded: black, half cyan, cyan)"
            />,
            <FadeCase
                key="fade-bundled"
                id="fade-bundled"
                from="bundled"
                fades
                description="transition: a bundled require() image fades in, as with Glide and Coil (recorded: black, half cyan, cyan)"
            />,
        ],
    },
    {
        // Recorded (video samples).
        name: 'fade-between',
        cases: [
            <FadeCase
                key="fade-change-download"
                id="fade-change-download"
                from="change-download"
                fades={false}
                description="transition: a new source that downloads replaces the image showing at once, once it has loaded (recorded: magenta, then cyan)"
            />,
            <FadeCase
                key="fade-between"
                id="fade-between"
                from="change-download"
                betweenImages
                fades
                description="transition with betweenImages: a new source that downloads cross-dissolves from the image showing (recorded: magenta, blue-violet, cyan)"
            />,
            <FadeCase
                key="fade-between-memory"
                id="fade-between-memory"
                from="change"
                betweenImages
                skipOnCacheHit="none"
                fades
                description="transition with betweenImages and skipOnCacheHit none: a new source from the memory cache cross-dissolves from the image showing (right; recorded: magenta, blue-violet, cyan)"
            />,
        ],
    },
    {
        // Recorded. Clears the memory cache, so on its own.
        name: 'fade-disk',
        cases: [
            <FadeCase
                key="fade-disk"
                id="fade-disk"
                from="disk"
                fades
                description="transition: an image from the disk cache fades in (right; recorded: black, half cyan, cyan)"
            />,
            <FadeCase
                key="fade-disk-all"
                id="fade-disk-all"
                from="disk"
                skipOnCacheHit="all"
                fades={false}
                description="transition with skipOnCacheHit all: an image from the disk cache shows at once (right; recorded: black, then cyan)"
            />,
        ],
    },
    {
        // Recorded (video samples).
        name: 'keep-previous',
        cases: [
            <KeepPreviousCase key="keep-previous" id="keep-previous" />,
            <KeepPreviousCase key="recycling-key" id="recycling-key" recycle />,
            <KeepPreviousCase
                key="keep-previous-no-memory"
                id="keep-previous-no-memory"
                memoryCache={false}
            />,
        ],
    },
    {
        // Recorded (video samples).
        name: 'tint',
        cases: [
            <TintSampleCase
                key="tint-gif"
                id="tint-gif"
                uri="blink-once.gif"
                change="play"
                expect={[GREEN, BLANK, GREEN]}
                description="A tinted GIF plays, tinted (recorded: green, blank, green)"
            />,
            <TintSampleCase
                key="tint-change"
                id="tint-change"
                uri="magenta.png"
                change="recolor"
                expect={[GREEN, CYAN]}
                description="tintColor changed after load (recorded: green, then cyan)"
            />,
            <TintSampleCase
                key="tint-gif-clear"
                id="tint-gif-clear"
                uri="blink-once.gif"
                change="clear"
                expect={[GREEN, MAGENTA]}
                description="tintColor removed from a paused GIF (recorded: green, then its magenta first frame)"
            />,
        ],
    },
    {
        name: 'several-sources',
        cases: [
            <SeveralSourcesCase key="several-48" id="several-48" size={48} />,
            <SeveralSourcesCase
                key="several-120"
                id="several-120"
                size={120}
            />,
            <SeveralSourcesEdgeCase key="several-edge" />,
        ],
    },
    {
        // Large views, on their own.
        name: 'several-sources-large',
        cases: [
            <SeveralSourcesCase
                key="several-240"
                id="several-240"
                size={240}
            />,
            <SeveralSourcesResizeCase key="several-resize" />,
        ],
    },
    {
        name: 'image-background',
        cases: [<ImageBackgroundCase key="image-background" />],
    },
    {
        name: 'formats',
        cases: [
            <FormatCase
                key="format-jpeg"
                id="format-jpeg"
                file="quadrants.jpg"
                expected="loads"
                description="JPEG loads"
            />,
            <FormatCase
                key="format-png"
                id="format-png"
                file="quadrants.png"
                expected="loads"
                description="PNG loads"
            />,
            <FormatCase
                key="format-gif"
                id="format-gif"
                file="quadrants.gif"
                expected="loads"
                description="GIF (a still one) loads"
            />,
            <FormatCase
                key="format-webp"
                id="format-webp"
                file="quadrants.webp"
                expected="loads"
                description="WebP loads"
            />,
            <FormatCase
                key="format-avif"
                id="format-avif"
                file="quadrants.avif"
                expected="loads"
                description="AVIF loads"
            />,
            <FormatCase
                key="format-heic"
                id="format-heic"
                file="quadrants.heic"
                expected="loads"
                description="HEIC loads"
            />,
            <FormatCase
                key="format-bmp"
                id="format-bmp"
                file="quadrants.bmp"
                expected="loads"
                description="BMP loads"
            />,
            <FormatCase
                key="format-ico"
                id="format-ico"
                file="quadrants.ico"
                expected="loads"
                description="ICO loads"
            />,
            <FormatCase
                key="format-tiff"
                id="format-tiff"
                file="quadrants.tiff"
                expected={Platform.OS === 'ios' ? 'loads' : 'fails'}
                description="TIFF: loads on iOS, fails on Android"
            />,
        ],
    },
    {
        name: 'formats-animated',
        cases: [
            <FormatAnimationCase
                key="format-animated-gif"
                id="format-animated-gif"
                file="animated.gif"
                expected="animates"
                description="An animated GIF animates (red and blue; masked)"
            />,
            <FormatAnimationCase
                key="format-animated-apng"
                id="format-animated-apng"
                file="animated.png"
                expected={Platform.OS === 'ios' ? 'animates' : 'first frame'}
                description="An APNG: animates on iOS, shows its first frame (red) on Android (masked)"
            />,
            <FormatAnimationCase
                key="format-animated-webp"
                id="format-animated-webp"
                file="animated.webp"
                expected={Platform.OS === 'ios' ? 'animates' : 'first frame'}
                description="An animated WebP: animates on iOS, shows its first frame (red) on Android (masked)"
            />,
            <FormatAnimationCase
                key="format-animated-webp-downsampled"
                id="format-animated-webp-downsampled"
                file="animated-large.webp"
                expected={Platform.OS === 'ios' ? 'animates' : 'first frame'}
                description="A large animated WebP, downsampled: animates on iOS, shows its first frame (red) on Android (masked)"
            />,
            // loop and paused with an animated WebP, which only animates on
            // iOS.
            ...(Platform.OS === 'ios'
                ? [
                      <GifLoopCase
                          key="webp-loop-false"
                          id="webp-loop-false"
                          description="loop={false}: an animated WebP that loops forever by itself plays once and stops on blue"
                          loop={false}
                          plays={1}
                          source="formats/animated.webp"
                      />,
                      <GifPausedCase
                          key="webp-paused"
                          name="WebP"
                          source="formats/animated.webp"
                      />,
                      <GifPausedCase
                          key="webp-resume"
                          name="WebP"
                          source="formats/animated.webp"
                          resume
                      />,
                  ]
                : []),
            <FormatAnimationCase
                key="format-animated-avif"
                id="format-animated-avif"
                file="animated.avif"
                expected="first frame"
                description="An animated AVIF shows its first frame (red; masked)"
            />,
        ],
    },
    {
        name: 'svg',
        cases: [
            <SvgCase
                key="svg-remote"
                id="svg-remote"
                source={{ uri: imageUrl('svg-flag.svg') }}
                style={{ width: 100, height: 50 }}
                expected={[100, 50]}
                description="A remote SVG loads (red and blue halves); onLoad has its size"
            />,
            <SvgCase
                key="svg-bundled"
                id="svg-bundled"
                source={require('./images/svg-flag.svg')}
                style={{ width: 100, height: 50 }}
                expected={[100, 50]}
                description="A bundled (require()d) SVG loads, also in release builds"
            />,
            <SvgCase
                key="svg-viewbox"
                id="svg-viewbox"
                source={{ uri: imageUrl('svg-viewbox.svg') }}
                style={{ width: 60, height: 30 }}
                expected={[60, 30]}
                description="An SVG with only a viewBox (green and yellow): onLoad has the viewBox's size"
            />,
            <SvgCase
                key="svg-nosize"
                id="svg-nosize"
                source={{ uri: imageUrl('svg-nosize.svg') }}
                style={{ width: 60, height: 30 }}
                expected={[300, 150]}
                description="An SVG with no size or viewBox is 300x150 (cyan and magenta)"
            />,
            <SvgCase
                key="svg-mislabeled"
                id="svg-mislabeled"
                source={{ uri: imageUrl('mislabeled/svg-flag.svg') }}
                style={{ width: 100, height: 50 }}
                expected={[100, 50]}
                description="An SVG sent as text/plain loads"
            />,
            <SvgCase
                key="svg-tint"
                id="svg-tint"
                source={{ uri: imageUrl('svg-icon.svg') }}
                style={{ width: 48, height: 48 }}
                expected={[24, 24]}
                tintColor="green"
                description="tintColor on an SVG icon: a green ring"
            />,
            <SvgCase
                key="svg-downsample"
                id="svg-downsample"
                source={{ uri: imageUrl('svg-flag.svg') }}
                style={{ width: 100, height: 50 }}
                expected={[100, 50]}
                downsample
                description="An SVG with downsample stays a vector image (sharp); onLoad has its size (iOS drew it into a bitmap the view's size)"
            />,
        ],
    },
    {
        name: 'svg-sizes',
        cases: [
            <SvgCase
                key="svg-contain"
                id="svg-contain"
                source={{ uri: imageUrl('svg-flag.svg') }}
                style={{ width: 64, height: 64 }}
                expected={[100, 50]}
                resizeMode="contain"
                description="contain: the whole SVG, with gray above and below"
            />,
            <SvgCase
                key="svg-cover"
                id="svg-cover"
                source={{ uri: imageUrl('svg-flag.svg') }}
                style={{ width: 64, height: 64 }}
                expected={[100, 50]}
                resizeMode="cover"
                description="cover: the middle of the SVG, half red and half blue, filling the view"
            />,
            <SvgSharpCase key="svg-sharp" />,
            <SvgCase
                key="svg-repeat"
                id="svg-repeat"
                source={{ uri: imageUrl('svg-rings.svg') }}
                style={{ width: 120, height: 60 }}
                expected={[20, 20]}
                resizeMode="repeat"
                description="repeat: the 20x20 SVG tiled at its own size in pixels, as other images are"
            />,
        ],
    },
    {
        name: 'photo-library',
        cases:
            Platform.OS === 'ios'
                ? [
                      <PhotoLibraryCase
                          key="photo-library-jpeg"
                          id="photo-library-jpeg"
                          type="public.jpeg"
                          description="#410: a JPEG from the photo library (ph://) loads; onLoad has the photo's own size"
                      />,
                      <PhotoLibraryCase
                          key="photo-library-heic"
                          id="photo-library-heic"
                          type="public.heic"
                          description="#410: a HEIC photo from the photo library (ph://) loads; onLoad has the photo's own size"
                      />,
                      <PhotoLibraryAgainCase key="photo-library-again" />,
                      <PhotoLibraryGifCase key="photo-library-gif" />,
                      <PhotoLibraryErrorCase
                          key="photo-library-missing"
                          id="photo-library-missing"
                          uri="ph://00000000-0000-0000-0000-000000000000/L0/001"
                          expected="localIdentifier"
                          description="A ph:// id that isn't in the library fails with onError"
                      />,
                      <PhotoLibraryErrorCase
                          key="photo-library-assets-library"
                          id="photo-library-assets-library"
                          uri="assets-library://asset/asset.JPG?id=00000000-0000-0000-0000-000000000000&ext=JPG"
                          expected="ph://"
                          description="#314: an assets-library:// url fails with onError, pointing to ph:// urls"
                      />,
                  ]
                : [
                      <NoCrashCase
                          key="photo-library"
                          id="photo-library"
                          description="Photo library (ph://) urls are iOS only; Android's photo pickers give content:// urls, which load"
                      />,
                  ],
    },
    {
        // Empties the disk cache on iOS, so it's near the end.
        name: 'configure-cache',
        cases: [<ConfigureCacheCase key="configure-cache" />],
    },
    {
        // Tapped by scripts/verify.mts (maestro/touch.yaml) while it's shown.
        // Last, so starting maestro-runner doesn't hold up the others.
        name: 'touch',
        cases: [
            <TouchableCase key="touchable" />,
            <PointerEventsCase key="pointer-events" />,
        ],
    },
]

export default function RegressionExample() {
    const statusBarHeight = useStatusBarHeight()
    return (
        <ScrollView
            style={{ marginTop: statusBarHeight }}
            contentContainerStyle={styles.container}
        >
            <Text style={styles.title}>Regression checks</Text>
            <BackgroundCases />
            {REGRESSION_GROUPS.map((group) => (
                <React.Fragment key={group.name}>
                    <Text style={styles.group}>{group.name}</Text>
                    {group.cases}
                </React.Fragment>
            ))}
        </ScrollView>
    )
}
