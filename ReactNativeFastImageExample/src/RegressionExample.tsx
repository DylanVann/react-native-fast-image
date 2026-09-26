import React, { useContext, useEffect, useRef, useState } from 'react'
import {
    AppState,
    Image,
    PixelRatio,
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
import { imageUrl, slowImageUrl } from './imageServer'
import { Masked, SnapshotContext, useReport } from './RunnerContext'

// Cases for bugs that have been fixed. Each shows "<id>: OK" once its expected
// event arrives. The cases that need no touch are in REGRESSION_GROUPS, which
// the regression runner (RegressionRunner.tsx) shows a group at a time and
// reports over a WebSocket to scripts/verify.mts; the Regression tab shows all
// of them at once for a look by hand, plus the cases a flow has to touch
// (maestro/touch.yaml, maestro/background.yaml). A crash fails the run because
// the app is gone.

// A case's status line ("<id>: <status>", OK when it passed) and description.
// The runner is told the status too (RunnerContext.tsx).
function CaseStatus({
    id,
    status,
    description,
}: {
    id: string
    status: string
    description: React.ReactNode
}) {
    useReport(id, status)
    return (
        <View style={styles.text}>
            <Text testID={`regression-${id}`} style={styles.status}>
                {id}: {status}
            </Text>
            <Text style={styles.description}>{description}</Text>
        </View>
    )
}

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
            <CaseStatus
                id="touchable"
                status={pressed ? 'OK' : 'tap the image'}
                description="#1020: FastImage as a Touchable's direct child (iOS crashed)"
            />
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

// Loads an image the server sends without a Content-Length, so its size is
// unknown while it loads, and passes if no onProgress event had a total of 0
// or less (both platforms sent -1, which made loaded / total negative).
const CHUNKED = imageUrl(`chunked/picsum/1015-2048x2048.jpg?run=${RUN}`)
function ProgressUnknownSizeCase() {
    const [badTotal, setBadTotal] = useState<number>()
    const [loaded, setLoaded] = useState(false)
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={{ uri: CHUNKED }}
                onProgress={(e) => {
                    if (e.nativeEvent.total <= 0)
                        setBadTotal(e.nativeEvent.total)
                }}
                onLoad={() => setLoaded(true)}
            />
            <CaseStatus
                id="progress-unknown-size"
                status={
                    !loaded
                        ? 'waiting'
                        : badTotal === undefined
                          ? 'OK'
                          : `onProgress total ${badTotal}`
                }
                description="No onProgress with an unknown total (no Content-Length)"
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
// still loading when the app leaves (the slow server takes about 7 s), and has
// to finish after it returns (#758), still sending the source's header (the
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
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'background') wentAway.current = true
            if (state === 'active' && wentAway.current) setReturned(true)
        })
        return () => subscription.remove()
    }, [])
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
                              uri: slowImageUrl(path),
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

// Shows a magenta image, then changes the source to a cyan one that takes
// about 2 s (the slow server, 300 ms between parts). While it loads, the view
// should keep showing magenta (it flashed blank, #747); with `recycle`,
// recyclingKey changes too, and it should be blank instead (for views reused
// for other content). The runner is asked for a screenshot then (see
// RunnerContext.tsx); check it against its reference. Passes when the cyan
// one has loaded.
function KeepPreviousCase({ id, recycle }: { id: string; recycle?: boolean }) {
    const [step, setStep] = useState<'first' | 'second' | 'done'>('first')
    const snapshot = useContext(SnapshotContext)
    useEffect(() => {
        if (step !== 'second') return
        // Half a second in: the slow image takes about 2 s.
        const timer = setTimeout(() => snapshot(id), 500)
        return () => clearTimeout(timer)
    }, [step, snapshot, id])
    const status = {
        first: 'loading the first image',
        second: 'loading the second image',
        done: 'OK',
    }[step]
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={
                    step === 'first'
                        ? { uri: imageUrl(`magenta.png?${id}=${RUN}`) }
                        : {
                              uri: slowImageUrl(
                                  `cyan.png?${id}=${RUN}&delay=300`,
                              ),
                              headers: BACKGROUND_SLOW_HEADERS,
                          }
                }
                recyclingKey={
                    recycle ? (step === 'first' ? 'first' : 'second') : null
                }
                onLoad={() =>
                    setStep((s) => (s === 'first' ? 'second' : 'done'))
                }
            />
            <CaseStatus
                id={id}
                status={status}
                description={
                    recycle
                        ? 'recyclingKey: changing it with the source clears the image (magenta) while the new one (cyan) loads'
                        : '#747: changing the source keeps the image (magenta) until the new one (cyan) has loaded (it flashed blank)'
                }
            />
        </View>
    )
}

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
                `picsum/1020-120x120.jpg?group=${PRELOAD_LIMIT_GROUP}&i=${i}&delay=300`,
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
// blue). Paused from the start, it stays on its first frame (red). Paused, then
// resumed with loop={false}, it plays once and stops on its last frame (blue);
// if resuming didn't play it, it would still be red.
function GifPausedCase({ resume }: { resume?: boolean }) {
    const [paused, setPaused] = useState(true)
    const [ok, setOk] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
    useEffect(() => () => clearTimeout(timer.current), [])
    const id = resume ? 'gif-resume' : 'gif-paused'
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                paused={paused}
                loop={resume ? false : undefined}
                source={{ uri: imageUrl('loop-forever.gif') }}
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
                        ? 'paused, then paused={false} with loop={false}: plays once and stops on blue'
                        : 'paused: a GIF that loops forever by itself stays on its first frame (red)'
                }
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
                                    onLoad={onLoad}
                                />
                            </View>
                        ))}
                    </View>
                </View>
            ))}
            <CaseStatus
                id="image-rendering"
                status={loads >= total ? 'OK' : `loaded ${loads}/${total}`}
                description="imageRendering: each image at its own size, then auto, smooth and pixelated"
            />
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

export type RegressionGroup = { name: string; cases: React.ReactElement[] }

export const REGRESSION_GROUPS: RegressionGroup[] = [
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
        ],
    },
    {
        name: 'image-rendering',
        cases: [<ImageRenderingCase key="image-rendering" />],
    },
    {
        name: 'loading',
        cases: [
            <NoReloadCase key="no-reload" />,
            <SourceSwapCase key="source-swap" />,
            <LoadStartOnceCase key="load-start-once" />,
            <ProgressUnknownSizeCase key="progress-unknown-size" />,
            <WebCacheCase key="web-cache" />,
            <CookiesCase key="cookies" />,
        ],
    },
    {
        // The slow ones: the slow server takes about 2 s per image here, and
        // preload-limit loads 4 of them, 3 at a time.
        name: 'preload',
        cases: [
            <PreloadCase key="preload" />,
            <PreloadHeadersCase key="preload-headers" />,
            <PreloadReuseCase key="preload-reuse" />,
            <PreloadResultsCase key="preload-results" />,
            <PreloadLimitCase key="preload-limit" />,
        ],
    },
    {
        // On their own: their screenshots are taken while they load, and
        // other cases' status lines would still be changing.
        name: 'keep-previous',
        cases: [
            <KeepPreviousCase key="keep-previous" id="keep-previous" />,
            <KeepPreviousCase key="recycling-key" id="recycling-key" recycle />,
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
            <TouchableCase />
            <PointerEventsCase />
            {REGRESSION_GROUPS.map((group) => (
                <React.Fragment key={group.name}>
                    <Text style={styles.group}>{group.name}</Text>
                    {group.cases}
                </React.Fragment>
            ))}
        </ScrollView>
    )
}
