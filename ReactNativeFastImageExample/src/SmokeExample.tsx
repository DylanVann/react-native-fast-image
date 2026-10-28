import React, { useContext, useEffect, useRef, useState } from 'react'
import { PixelRatio, Platform, View } from 'react-native'
import FastImage, {
    FastImageBackground,
    FastImageRef,
    LoadResult,
} from 'react-native-fast-image'
import { CaseStatus, caseStyles as styles } from './CaseStatus'
import { imageUrl, slowImageUrl } from './imageServer'
import {
    Masked,
    measureView,
    SampleContext,
    sampleStatus,
    type Description,
    type RegressionGroup,
} from './RunnerContext'

// A few cases that check FastImage works at all in an app (the Expo example,
// ReactNativeFastImageExampleExpo, on iOS, Android and the web): an image
// loads, a missing one fails, one that failed loads with reload(), a bundled
// one loads, one of several sizes is
// picked for the view, preload reports its results, and the cache methods answer (on the web, that they aren't
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
                description={{
                    checks: 'A remote image loads: onLoad with its size, then onLoadEnd with ok: true and the same size.',
                    steps: "Loads the 200×200 photo of a pug in a blanket from the image server (a new url each run). Passes when onLoad gave 200×200 and onLoadEnd's result is { ok: true, width: 200, height: 200 }.",
                    shows: 'The pug photo in a small square.',
                }}
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
                description={{
                    checks: 'A missing image fails: onError with a message, then onLoadEnd with ok: false and an error.',
                    steps: "Loads a url the image server answers with a 404. Passes when onError's error isn't empty and onLoadEnd's result is { ok: false, error } with an error that isn't empty.",
                    shows: 'An empty gray square: the image never loads.',
                }}
            />
        </View>
    )
}

// An image whose first request fails (a 503) loads with the ref's reload().
function ReloadCase() {
    const image = useRef<FastImageRef>(null)
    const [status, setStatus] = useState('loading')
    const failed = useRef(false)
    return (
        <View style={styles.row}>
            <FastImage
                ref={image}
                style={styles.image}
                source={{
                    uri: imageUrl(
                        `fail-once/picsum/1025-200x200.jpg?smoke-reload=${RUN}`,
                    ),
                }}
                onError={() => {
                    if (failed.current) return setStatus('failed again')
                    failed.current = true
                    if (!image.current?.reload) return setStatus('no reload()')
                    image.current.reload()
                }}
                onLoad={() =>
                    setStatus(failed.current ? 'OK' : 'loaded without failing')
                }
            />
            <CaseStatus
                id="smoke-reload"
                status={status}
                description={{
                    checks: 'reload() on the ref loads an image again after its request failed.',
                    steps: "Loads the pug photo from a url the image server answers with a 503 the first time and the image after. On onError, calls the ref's reload(). Passes on the onLoad that follows; a second onError, or a ref without reload(), fails.",
                    shows: 'The pug photo in a small square. A failure leaves an empty gray square.',
                }}
            />
        </View>
    )
}

// A url placeholder that failed is requested again by reload(), with the
// image.
const RELOAD_PLACEHOLDER_PATH = `/fail-once/picsum/1025-200x200.jpg?smoke-reload-placeholder=${RUN}`
function ReloadPlaceholderCase() {
    const image = useRef<FastImageRef>(null)
    const [status, setStatus] = useState('loading')
    const failed = useRef(false)
    return (
        <View style={styles.row}>
            <FastImage
                ref={image}
                style={styles.image}
                source={{
                    uri: imageUrl(
                        `fail-once/picsum/1025-200x200.jpg?smoke-reload-image=${RUN}`,
                    ),
                }}
                placeholder={{
                    uri: imageUrl(RELOAD_PLACEHOLDER_PATH.slice(1)),
                }}
                onError={() => {
                    if (failed.current) return setStatus('failed again')
                    failed.current = true
                    if (!image.current?.reload) return setStatus('no reload()')
                    image.current.reload()
                }}
                onLoad={() =>
                    fetch(
                        imageUrl(
                            `requests?path=${encodeURIComponent(RELOAD_PLACEHOLDER_PATH)}`,
                        ),
                    )
                        .then((response) => response.json())
                        .then((json: { count: number }) =>
                            setStatus(
                                json.count === 2
                                    ? 'OK'
                                    : `placeholder requested ${json.count} times`,
                            ),
                        )
                        .catch((e) => setStatus(`error: ${e}`))
                }
            />
            <CaseStatus
                id="smoke-reload-placeholder"
                status={status}
                description={{
                    checks: 'reload() also requests a url placeholder again when it had failed, with the image.',
                    steps: "Loads the pug photo with a url placeholder (the pug photo again), both from urls the image server answers with a 503 the first time. On onError, calls the ref's reload(). On onLoad, asks the image server how many times the placeholder's url was requested; passes on 2.",
                    shows: 'The pug photo in a small square.',
                }}
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
                description={{
                    checks: 'A bundled image (require()) loads, at the size of its file.',
                    steps: "Shows require('./images/logo.png'), the 1000×1000 React logo. Passes when onLoad's size is 1000×1000.",
                    shows: 'The light blue React logo on a small gray square.',
                }}
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
                description={{
                    checks: 'FastImage.preload resolves with a result per source: ok with the size for an image that loads, not ok for a missing one.',
                    steps: "Preloads a 120×120 photo and a url the image server answers with a 404, when it mounts. Passes when the first result is { ok: true, width: 120, height: 120 } and the second isn't ok.",
                    shows: 'An empty gray square: the images are only preloaded, not shown.',
                }}
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
                        ? {
                              checks: 'FastImage.getCachePath on the web resolves not ok with "Not supported on the web".',
                              steps: "Loads a 120×120 photo of the northern lights; on onLoad, calls FastImage.getCachePath with the same source. Passes when the result is { ok: false, error: 'Not supported on the web' }.",
                              shows: 'The northern lights photo (green sky over a dark tree) in a small square.',
                          }
                        : {
                              checks: 'FastImage.getCachePath gives the file of an image a view has loaded.',
                              steps: 'Loads a 120×120 photo of the northern lights; on onLoad, calls FastImage.getCachePath with the same source. Passes when the result is ok with a path.',
                              shows: 'The northern lights photo (green sky over a dark tree) in a small square.',
                          }
                }
            />
        </View>
    )
}

// The cache limits the app's config sets (app.config.js, through FastImage's
// Expo config plugin), as configureCache reports them. Android only has the
// disk size limit, which FastImage's AppGlideModule applies: the Expo example
// has expo-image, whose AppGlideModule the app uses instead (FastImage leaves
// its own out), so there it reports none.
export const EXPO_CACHE_LIMITS = {
    maxDiskSize: 150 * 1024 * 1024,
    maxDiskAge: 7 * 24 * 60 * 60,
    maxMemorySize: 50 * 1024 * 1024,
}

function CacheLimitsCase() {
    const [status, setStatus] = useState('loading')
    useEffect(() => {
        FastImage.configureCache().then((state) => {
            const ok =
                Platform.OS === 'ios'
                    ? Object.entries(EXPO_CACHE_LIMITS).every(
                          ([name, value]) =>
                              state[name as keyof typeof state] === value,
                      )
                    : Object.keys(state).length === 0
            setStatus(ok ? 'OK' : JSON.stringify(state))
        })
    }, [])
    return (
        <View style={styles.row}>
            <View style={styles.image} />
            <CaseStatus
                id="smoke-cache-limits"
                status={status}
                description={
                    Platform.OS === 'ios'
                        ? {
                              checks: "FastImage.configureCache() reports the cache limits the app's config sets with FastImage's Expo config plugin.",
                              steps: 'Calls FastImage.configureCache() without changes when it mounts. Passes when it reports maxDiskSize 150 MB, maxDiskAge 7 days and maxMemorySize 50 MB, as in app.config.js.',
                              shows: 'An empty gray square: nothing loads here.',
                          }
                        : {
                              checks: "FastImage.configureCache() reports no limits on Android in an app with expo-image: FastImage's AppGlideModule applies the disk size limit, and the app uses expo-image's instead.",
                              steps: 'Calls FastImage.configureCache() without changes when it mounts. Passes when it reports no values.',
                              shows: 'An empty gray square: nothing loads here.',
                          }
                }
            />
        </View>
    )
}

// Several sizes of an image: the view loads the one closest to its size in
// pixels (100, 300 or 900 px, for a 96 dp view at the screen's pixel ratio).
// On the web the browser picks from a srcset: the smallest at least as wide as
// the view in device pixels.
function SizesCase() {
    const [status, setStatus] = useState('loading')
    const sizes = [100, 300, 900]
    const view = 96
    const pixels = (view * PixelRatio.get()) ** 2
    const fit = (size: number) => Math.abs(1 - (size * size) / pixels)
    const expected =
        Platform.OS === 'web'
            ? (sizes.find((size) => size >= view * PixelRatio.get()) ??
              sizes[sizes.length - 1])
            : sizes.reduce((best, size) =>
                  fit(size) < fit(best) ? size : best,
              )
    return (
        <View style={styles.row}>
            <FastImage
                style={{ width: view, height: view }}
                source={sizes.map((size) => ({
                    uri: imageUrl(`sized-${size}.png?smoke=${RUN}`),
                    width: size,
                    height: size,
                }))}
                onLoad={(e) =>
                    setStatus(
                        e.nativeEvent.width === expected
                            ? 'OK'
                            : `loaded ${e.nativeEvent.width} px, expected ${expected} px`,
                    )
                }
                onError={(e) => setStatus(`error: ${e.nativeEvent.error}`)}
            />
            <CaseStatus
                id="smoke-sizes"
                status={status}
                description={{
                    checks: "A source of several sizes loads the one that fits the view: on iOS and Android the one closest to the view's size in pixels, on the web the smallest at least as wide (the browser picks it from a srcset).",
                    steps: "Gives a 96 dp view three sizes of a square from the image server: 100 px (red), 300 px (green) and 900 px (blue). Passes when onLoad's width is the size expected for the screen's pixel ratio: 300 px on the test phones (3× on iOS, 2.625× on Android) and on the web (its page is at 3×).",
                    shows: "A solid green square, larger than the other rows' images. Red or blue means the wrong size was loaded.",
                }}
            />
        </View>
    )
}

// FastImage's Glide components, which it registers itself on Android when
// the app's AppGlideModule isn't its own (expo-image's, in the Expo example):
// onProgress, `cache: 'web'`, writeToCache and SVG images.
function ProgressCase() {
    const [status, setStatus] = useState('loading')
    const last = useRef<string>(undefined)
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={{
                    uri: imageUrl(
                        `picsum/1025-200x200.jpg?smoke-progress=${RUN}`,
                    ),
                }}
                onProgress={(e) => {
                    last.current = `${e.nativeEvent.loaded}/${e.nativeEvent.total}`
                }}
                onLoad={() => {
                    const [loaded, total] = (last.current ?? '').split('/')
                    setStatus(
                        last.current && loaded === total
                            ? 'OK'
                            : `onProgress ${last.current ?? 'not sent'}`,
                    )
                }}
            />
            <CaseStatus
                id="smoke-progress"
                status={status}
                description={{
                    checks: 'onProgress comes while a remote image downloads, the last one with all of it loaded, before onLoad. On Android in an app with expo-image, it goes through the Glide components FastImage registers itself.',
                    steps: 'Loads the pug photo from the image server with onProgress. Passes on onLoad if the last onProgress had loaded equal to total.',
                    shows: 'The pug photo in a small square.',
                }}
            />
        </View>
    )
}

// Loaded twice from a url the server marks as cacheable: requested once, if
// the second load came from the HTTP cache of `cache: 'web'` images.
const WEB_PATH = `/max-age/picsum/1025-200x200.jpg?smoke-web=${RUN}`
function WebCacheCase() {
    const [loads, setLoads] = useState(0)
    const [status, setStatus] = useState('loading')
    useEffect(() => {
        if (loads !== 2) return
        fetch(imageUrl(`requests?path=${encodeURIComponent(WEB_PATH)}`))
            .then((response) => response.json())
            .then((json: { count: number }) =>
                setStatus(
                    json.count === 1 ? 'OK' : `requested ${json.count} times`,
                ),
            )
            .catch((e) => setStatus(`error: ${e}`))
    }, [loads])
    return (
        <View style={styles.row}>
            {loads < 2 ? (
                <FastImage
                    key={loads}
                    style={styles.image}
                    source={{ uri: imageUrl(WEB_PATH.slice(1)), cache: 'web' }}
                    onLoad={() => setLoads((n) => n + 1)}
                    onError={(e) => setStatus(`error: ${e.nativeEvent.error}`)}
                />
            ) : (
                <View style={styles.image} />
            )}
            <CaseStatus
                id="smoke-web-cache"
                status={status}
                description={{
                    checks: "A source with cache: 'web' uses the HTTP cache: loaded twice from a url the server marks as cacheable, it's requested once.",
                    steps: "Loads the pug photo with cache: 'web' from a url the image server sends with Cache-Control: max-age=3600, then mounts a new view for it once it has loaded. After the second onLoad, removes the view and asks the image server how many times the url was requested; passes on 1.",
                    shows: 'An empty gray square: the image view is gone after the second load.',
                }}
            />
        </View>
    )
}

function WriteToCacheCase() {
    const [status, setStatus] = useState('loading')
    const [shown, setShown] = useState(false)
    const source = {
        uri: imageUrl(`picsum/1025-200x200.jpg?smoke-write=${RUN}`),
    }
    useEffect(() => {
        const run = async () => {
            const file = await FastImage.getCachePath({
                uri: imageUrl(
                    `picsum/1022-120x120.jpg?smoke-write-file=${RUN}`,
                ),
            })
            if (!file.ok) return setStatus(`no file: ${file.error}`)
            const result = await FastImage.writeToCache(
                source,
                `file://${file.path}`,
            )
            if (!result.ok) return setStatus(`writeToCache: ${result.error}`)
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
                    source={{ ...source, cache: 'cacheOnly' }}
                    onLoad={(e) =>
                        setStatus(
                            e.nativeEvent.width === 120
                                ? 'OK'
                                : `shows ${e.nativeEvent.width}x${e.nativeEvent.height}, expected the stored 120x120`,
                        )
                    }
                    onError={(e) => setStatus(`error: ${e.nativeEvent.error}`)}
                />
            ) : (
                <View style={styles.image} />
            )}
            <CaseStatus
                id="smoke-write-to-cache"
                status={status}
                description={{
                    checks: "FastImage.writeToCache stores a file as a url's image, which a view then shows from the cache without downloading it.",
                    steps: "Downloads a 120×120 photo of the northern lights with FastImage.getCachePath, then calls FastImage.writeToCache with the pug photo's url and that file. Then shows the pug url with cache: 'cacheOnly'; passes when onLoad's width is 120 (the stored file, not the 200×200 pug).",
                    shows: 'The northern lights photo (green sky over a dark tree) in a small square. The pug, or an empty gray square, is a failure.',
                }}
            />
        </View>
    )
}

// SVG images. The Expo example's expo-image brings the SVG libraries too, so
// this only checks that SVG images load here; the main example, which doesn't
// add them, checks that FastImage includes them.
function SvgCase() {
    const [status, setStatus] = useState('loading')
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={{ uri: imageUrl(`svg-icon.svg?smoke=${RUN}`) }}
                onLoad={() => setStatus('OK')}
                onError={(e) => setStatus(`error: ${e.nativeEvent.error}`)}
            />
            <CaseStatus
                id="smoke-svg"
                status={status}
                description={{
                    checks: "An SVG image from a url loads. expo-image brings the SVG libraries into this app too, so this doesn't check that FastImage includes them (the main example does).",
                    steps: 'Loads a 24×24 SVG of a black ring from the image server. Passes on onLoad.',
                    shows: 'A thick black ring on a small gray square.',
                }}
            />
        </View>
    )
}

// An APNG (red, then blue, 400 ms each, looping) recorded for two plays: it
// animates, or with blurRadius shows its first frame (red), blurred and still,
// as Glide's "don't animate" option asks. In an app with expo-image, Glide
// also has APNG4Android's plugin for APNGs, which ignores that option.
const RED = '#ff0000'
const BLUE = '#0000ff'
const BLANK = '#eeeeee'
function ApngCase({ blur }: { blur?: boolean }) {
    const sample = useContext(SampleContext)
    const view = useRef<React.ComponentRef<typeof View>>(null)
    const [status, setStatus] = useState('loading')
    const started = useRef(false)
    const id = blur ? 'smoke-apng-blur' : 'smoke-apng'
    const expected = blur ? 'first frame' : 'animates'
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
                durationMs: 3000,
                expect: [RED, BLUE],
                palette: [RED, BLUE, BLANK],
            },
            (done) => setTimeout(done, 1600),
        )
        const { seen } = result
        const got =
            seen.includes(RED) && seen.includes(BLUE)
                ? 'animates'
                : seen.length === 1 && seen[0] === RED
                  ? 'first frame'
                  : (result.detail ?? `saw ${seen.join(', ') || 'nothing'}`)
        setStatus(got === expected ? 'OK' : `${got}, expected: ${expected}`)
    }
    return (
        <View style={styles.row}>
            <Masked>
                <View ref={view} collapsable={false}>
                    <FastImage
                        style={styles.image}
                        blurRadius={blur ? 4 : undefined}
                        source={{
                            uri: imageUrl(`formats/animated.png?${id}=${RUN}`),
                        }}
                        onLoad={onLoad}
                        onError={(e) =>
                            setStatus(`error: ${e.nativeEvent.error}`)
                        }
                    />
                </View>
            </Masked>
            <CaseStatus
                id={id}
                status={status}
                description={
                    blur
                        ? {
                              checks: "An animated PNG (APNG) with blurRadius shows its first frame, blurred and still. On Android in an app with expo-image, Glide also has APNG4Android's plugin for APNGs, which ignores Glide's \"don't animate\" option.",
                              steps: 'Loads an APNG of two frames, red then blue, 400 ms each and looping, with blurRadius 4. On onLoad, records the image for 1.6 s (two plays). Passes when the recording sees red only.',
                              shows: "A red square (animated images are masked, so it's not compared). The recording sees red only; never blue.",
                          }
                        : {
                              checks: 'An animated PNG (APNG) animates.',
                              steps: 'Loads an APNG of two frames, red then blue, 400 ms each and looping. On onLoad, records the image for 1.6 s (two plays). Passes when the recording sees both red and blue.',
                              shows: "A red or blue square (animated, so it's not compared). The recording sees red and blue in turn.",
                          }
                }
            />
        </View>
    )
}

// Web: several sizes, then the same sizes with a larger one added, where the
// browser keeps the file it shows (a 96 px view): the browser fires load
// again for the new sources, so onLoad and onLoadEnd come again.
function SizesChangeCase() {
    const [changed, setChanged] = useState(false)
    const [loads, setLoads] = useState(0)
    const [ends, setEnds] = useState(0)
    const [timedOut, setTimedOut] = useState(false)
    const sized = (size: number) => ({
        uri: imageUrl(`sized-${size}.png?smoke-sizes-change=${RUN}`),
        width: size,
        height: size,
    })
    const first = [sized(100), sized(300)]
    useEffect(() => {
        if (loads < 1 || changed) return
        const timer = setTimeout(() => setChanged(true), 300)
        return () => clearTimeout(timer)
    }, [loads, changed])
    useEffect(() => {
        if (!changed) return
        const timer = setTimeout(() => setTimedOut(true), 4000)
        return () => clearTimeout(timer)
    }, [changed])
    const status =
        loads >= 2 && ends >= 2
            ? 'OK'
            : timedOut
              ? `after the change: ${loads} onLoad, ${ends} onLoadEnd (expected 2 of each)`
              : 'loading'
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={changed ? [...first, sized(900)] : first}
                onLoad={() => setLoads((n) => n + 1)}
                onLoadEnd={() => setEnds((n) => n + 1)}
            />
            <CaseStatus
                id="smoke-sizes-change"
                status={status}
                description={{
                    checks: 'On the web, adding a larger size to a source of several sizes sends onLoad and onLoadEnd again, though the browser keeps showing the same file.',
                    steps: "Gives a 48 dp view two sizes of a square from the image server, 100 px (red) and 300 px (green); at the page's 3× scale the view is 144 pixels, so the browser shows the 300 px one. 300 ms after onLoad, adds the 900 px one (blue). Passes when onLoad and onLoadEnd have each come twice, within 4 s of the change.",
                    shows: 'The green square (the 300 px file), before and after the change.',
                }}
            />
        </View>
    )
}

// Web: with a placeholder, the image isn't hidden while it loads (the browser
// draws it over the placeholder as it arrives), and the placeholder goes once
// it has loaded. The <img>s are in the view's element (the ref).
function PlaceholderCase() {
    const view = useRef<any>(null)
    const [status, setStatus] = useState('loading')
    const whileLoading = useRef<string>(undefined)
    useEffect(() => {
        const images = view.current?.querySelectorAll?.('img') ?? []
        const image = images[images.length - 1]
        whileLoading.current =
            images.length === 2 && image
                ? (globalThis as any).getComputedStyle(image).opacity
                : `${images.length} images`
    }, [])
    return (
        <View style={styles.row}>
            <FastImage
                ref={view}
                style={styles.image}
                source={{
                    uri: imageUrl(
                        `picsum/1025-200x200.jpg?smoke-default=${RUN}`,
                    ),
                }}
                placeholder={require('./images/logo.png')}
                onLoad={() =>
                    // After React has removed the placeholder.
                    setTimeout(() => {
                        const left =
                            view.current?.querySelectorAll?.('img').length
                        setStatus(
                            whileLoading.current === '1' && left === 1
                                ? 'OK'
                                : `opacity while loading: ${whileLoading.current}, images after: ${left}`,
                        )
                    }, 100)
                }
            />
            <CaseStatus
                id="smoke-placeholder"
                status={status}
                description={{
                    checks: "On the web, with a placeholder the image isn't hidden while it loads (the browser draws it over the placeholder as it arrives), and the placeholder is removed once it has loaded.",
                    steps: "Loads the pug photo with the bundled React logo as placeholder. When it mounts, checks that the view has two img elements and the image's opacity is 1; 100 ms after onLoad, passes if one img is left.",
                    shows: 'The pug photo in a small square; the React logo shows only while it loads.',
                }}
            />
        </View>
    )
}

// The web version: a source's blurDataUri, a 2 × 2 PNG of red, green, blue
// and yellow quadrants, blurred by its SVG filter (in its own units, with the
// edges kept solid). The image fails, so it stays.
const QUADRANTS =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR42mN4Jicnt8qGQSPgzocTIgAh2AVH0x5+BQAAAABJRU5ErkJggg=='

function BlurDataUriCase() {
    const view = useRef<any>(null)
    const [status, setStatus] = useState('loading')
    return (
        <View style={styles.row}>
            <FastImage
                ref={view}
                style={{ width: 96, height: 72 }}
                source={{
                    uri: imageUrl(`does-not-exist.jpg?smoke-blur=${RUN}`),
                    blurDataUri: QUADRANTS,
                }}
                onError={() => {
                    const preview = view.current?.querySelector?.('img')
                    const filter = preview
                        ? (globalThis as any).getComputedStyle(preview).filter
                        : 'no image'
                    setStatus(
                        preview?.getAttribute('src') === QUADRANTS &&
                            /url\(/.test(filter)
                            ? 'OK'
                            : `filter: ${filter}`,
                    )
                }}
            />
            <CaseStatus
                id="smoke-blur-data-uri"
                status={status}
                description={{
                    checks: "On the web, a source's blurDataUri shows blurred (with an SVG filter) and stays when the image fails.",
                    steps: "Loads a url the image server answers with a 404, with a blurDataUri of a 2×2 PNG of red, green, blue and yellow quadrants. On onError, passes if the preview img's src is that data uri and its filter style is a url(…).",
                    shows: 'A 96×72 box of red, green, blue and yellow quadrants blurred into each other, with solid edges. Sharp quadrants mean the blur is missing.',
                }}
            />
        </View>
    )
}

// #436: a side the style leaves open follows the loaded image (its aspect
// ratio, or with neither side set its own size), as an <img>'s does. Passes
// once the image has loaded and the view's layout is `expected` (within half
// a point). objectFit="fill" stretches the image if the box is wrong.
function AutoSizeCase({
    id,
    source,
    style,
    expected,
    description,
}: {
    id: string
    source: React.ComponentProps<typeof FastImage>['source']
    style: React.ComponentProps<typeof FastImage>['style']
    expected: { width: number; height: number }
    description: Description
}) {
    const [loaded, setLoaded] = useState(false)
    const [layout, setLayout] = useState<{ width: number; height: number }>()
    const ok =
        loaded &&
        layout !== undefined &&
        Math.abs(layout.width - expected.width) < 0.5 &&
        Math.abs(layout.height - expected.height) < 0.5
    return (
        <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <FastImage
                    style={style}
                    objectFit="fill"
                    source={source}
                    onLayout={(e) => {
                        const { width, height } = e.nativeEvent.layout
                        setLayout({ width, height })
                    }}
                    onLoad={() => setLoaded(true)}
                />
            </View>
            <CaseStatus
                id={id}
                status={
                    ok
                        ? 'OK'
                        : !loaded || !layout
                          ? 'waiting'
                          : `${layout.width}x${layout.height}, expected ${expected.width}x${expected.height}`
                }
                description={description}
            />
        </View>
    )
}

// A size a FastImageBackground sets (absoluteFill's insets) isn't open: its
// image fills it after loading, whatever the image's shape.
function AutoSizeBackgroundCase() {
    const [loaded, setLoaded] = useState(false)
    const [layout, setLayout] = useState<{ width: number; height: number }>()
    const ok =
        loaded &&
        layout !== undefined &&
        Math.abs(layout.width - 160) < 0.5 &&
        Math.abs(layout.height - 160) < 0.5
    return (
        <View style={{ marginBottom: 12 }}>
            <FastImageBackground
                source={{ uri: imageUrl('picsum/1018-600x300.jpg') }}
                style={{ width: 160, height: 160 }}
                imageProps={{
                    onLayout: (e) => {
                        const { width, height } = e.nativeEvent.layout
                        setLayout({ width, height })
                    },
                    onLoad: () => setLoaded(true),
                }}
            />
            <CaseStatus
                id="auto-size-background"
                status={
                    ok
                        ? 'OK'
                        : !loaded || !layout
                          ? 'waiting'
                          : `${layout.width}x${layout.height}, expected 160x160`
                }
                description={{
                    checks: "A FastImageBackground's image fills it: its insets (absoluteFill) set its size, which doesn't follow the image.",
                    steps: 'Shows the 600x300 photo in a 160x160 FastImageBackground. Passes once it has loaded and the image is 160x160.',
                    shows: 'The photo covering a 160x160 square (its middle).',
                }}
            />
        </View>
    )
}

// The same text page at a fixed size, and with only a width, which follows
// the image to the same size: it's decoded for the view's size either way
// (on iOS, not at full size, which Core Animation would scale down).
function AutoSizeDownsampleCase() {
    const [loads, setLoads] = useState(0)
    return (
        <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <FastImage
                    source={{
                        uri: imageUrl(`text-page.png?auto-size-fixed=${RUN}`),
                    }}
                    style={{ width: 128, height: 80, marginRight: 8 }}
                    onLoad={() => setLoads((n) => n + 1)}
                />
                <FastImage
                    source={{
                        uri: imageUrl(`text-page.png?auto-size-open=${RUN}`),
                    }}
                    style={{ width: 128 }}
                    onLoad={() => setLoads((n) => n + 1)}
                />
            </View>
            <CaseStatus
                id="auto-size-downsample"
                status={loads >= 2 ? 'OK' : 'waiting'}
                description={{
                    checks: 'An image with only a width is decoded for its size, as one with both sides set is: they look the same.',
                    steps: 'Loads a 1600x1000 page of text at 128x80, and again (another url) with only a width of 128, which follows the image to 128x80. Passes once both have loaded.',
                    shows: 'The same text page twice, at 128x80, with the same sharpness. A blurrier or more aliased right one means it was decoded at another size.',
                }}
            />
        </View>
    )
}

// Cover (the default) with only a width: recorded at the view's left
// quarter, as it loads, the image is magenta there (its left third), never
// cyan (its middle), as it would be cropped to a size the view doesn't get.
// (The page's background before it shows matches neither.)
const MAGENTA = '#ff00ff'
const CYAN = '#00ffff'
function AutoSizeCoverCase() {
    const sample = useContext(SampleContext)
    const box = useRef<React.ComponentRef<typeof View>>(null)
    const [shown, setShown] = useState(false)
    const done = useRef(() => {})
    const [status, setStatus] = useState('waiting')
    useEffect(() => {
        const expect = [MAGENTA]
        const start = setTimeout(async () => {
            const area = await measureView(box.current)
            if (!area) return setStatus('not on screen')
            setStatus('recording')
            const result = await sample(
                {
                    name: 'auto-size-cover',
                    area: { ...area, width: area.width / 4 },
                    durationMs: 4000,
                    expect,
                    palette: [CYAN],
                },
                (sampleDone) => {
                    done.current = sampleDone
                    setShown(true)
                },
            )
            setStatus(sampleStatus(result, expect))
        }, 300)
        return () => clearTimeout(start)
    }, [sample])
    return (
        <View style={{ marginBottom: 12 }}>
            <View
                ref={box}
                collapsable={false}
                style={{ width: 240, height: 120 }}
            >
                {shown ? (
                    <FastImage
                        source={{
                            uri: imageUrl(`thirds.png?auto-size=${RUN}`),
                        }}
                        style={{ width: 240 }}
                        onLoad={() => setTimeout(() => done.current(), 1500)}
                    />
                ) : null}
            </View>
            <CaseStatus
                id="auto-size-cover"
                status={status}
                description={{
                    checks: "An image with only a width and objectFit cover shows the whole image as it loads, not a crop of its middle for a size the view doesn't get.",
                    steps: 'Records the left quarter of a 240x120 box, then loads a 600x300 image of magenta, cyan and magenta thirds into it with style { width: 240 }, until 1.5 s after onLoad. Passes when the recording sees magenta, and never cyan.',
                    shows: 'The image at 240x120: magenta, cyan and magenta thirds.',
                }}
            />
        </View>
    )
}

// A url placeholder, shown in a view with only a width (0 high until the image
// loads) and then, the same url, in one at a fixed size, which shows the copy
// the first decoded: decoded for the first view's width, not squeezed into a
// box 1 pixel high (iOS decodes for the side that's set). The images load from
// the slow server, so the placeholders stay.
const SLOW_HEADERS = { 'x-token': 'fast-image' }
function AutoSizePlaceholderCase() {
    const [second, setSecond] = useState(false)
    useEffect(() => {
        const timer = setTimeout(() => setSecond(true), 2500)
        return () => clearTimeout(timer)
    }, [])
    const placeholder = {
        uri: imageUrl(`thirds.png?auto-size-placeholder=${RUN}`),
    }
    const source = (name: string) => ({
        uri: slowImageUrl(
            `picsum/1018-600x300.jpg?auto-size-placeholder-${name}=${RUN}&delay=5000`,
        ),
        headers: SLOW_HEADERS,
    })
    return (
        <View style={{ marginBottom: 12 }}>
            <FastImage
                style={{ width: 240 }}
                source={source('open')}
                placeholder={placeholder}
            />
            {second ? (
                <FastImage
                    style={{ width: 128, height: 64 }}
                    source={source('fixed')}
                    placeholder={placeholder}
                />
            ) : (
                <View style={{ width: 128, height: 64 }} />
            )}
            <CaseStatus
                id="auto-size-placeholder"
                status={second ? 'OK' : 'waiting'}
                description={{
                    checks: 'A url placeholder of an image with only a width is decoded for that width, so another view showing the same placeholder shows it whole.',
                    steps: 'Shows a photo the slow server sends over about 35 s, with style { width: 240 } and a placeholder url of a 600x300 image of magenta, cyan and magenta thirds. 2.5 s later, a 128x64 view with another slow photo and the same placeholder mounts. Passes then.',
                    shows: 'The thirds at 128x64: magenta, cyan and magenta. A single smeared color means the placeholder was decoded 1 pixel high.',
                }}
            />
        </View>
    )
}

// A source change in a view with only a width (e.g. a recycled list cell):
// recorded near its top, as the view goes from a square photo's shape to a
// 2:1 image's, the image is magenta there (its top fifth), never cyan, as it
// would be cropped to the square the view had (then zoomed in).
function AutoSizeSourceChangeCase() {
    const sample = useContext(SampleContext)
    const box = useRef<React.ComponentRef<typeof View>>(null)
    const [uri, setUri] = useState(
        imageUrl(`picsum/1020-120x120.jpg?auto-size-change=${RUN}`),
    )
    const loads = useRef(0)
    const done = useRef(() => {})
    const [status, setStatus] = useState('waiting')
    const record = async () => {
        const area = await measureView(box.current)
        if (!area) return setStatus('not on screen')
        setStatus('recording')
        const expect = [MAGENTA]
        const result = await sample(
            {
                name: 'auto-size-source-change',
                area: { x: area.x + 110, y: area.y + 3, width: 20, height: 10 },
                durationMs: 4000,
                expect,
                palette: [CYAN],
            },
            (sampleDone) => {
                done.current = sampleDone
                setUri(imageUrl(`bands.png?auto-size-change=${RUN}`))
            },
        )
        setStatus(sampleStatus(result, expect))
    }
    return (
        <View style={{ marginBottom: 12 }}>
            <View
                ref={box}
                collapsable={false}
                style={{ width: 240, height: 240 }}
            >
                <FastImage
                    source={{ uri }}
                    style={{ width: 240 }}
                    onLoad={() => {
                        loads.current++
                        if (loads.current === 1) setTimeout(record, 500)
                        else setTimeout(() => done.current(), 1500)
                    }}
                />
            </View>
            <CaseStatus
                id="auto-size-source-change"
                status={status}
                description={{
                    checks: "An image with only a width and objectFit cover whose source changes to an image of another shape shows the whole new image, not a crop of it for the previous image's shape.",
                    steps: "Loads a 120x120 photo with style { width: 240 } (240x240), then records the point 8 points below the view's top while the source changes to a 600x300 image whose top fifth is magenta and the rest cyan, until 1.5 s after its onLoad. Passes when the recording sees magenta, and never cyan.",
                    shows: 'The 600x300 image at 240x120: a magenta band at the top over cyan.',
                }}
            />
        </View>
    )
}

// An image with only a width and padding: before it loads, the view is only
// its padding high, which it isn't laid out for. Recorded near its top, the
// image is magenta there (its top fifth), never cyan, as it would be cropped
// to the padding's strip (its middle).
function AutoSizePaddingCoverCase() {
    const sample = useContext(SampleContext)
    const box = useRef<React.ComponentRef<typeof View>>(null)
    const [shown, setShown] = useState(false)
    const done = useRef(() => {})
    const [status, setStatus] = useState('waiting')
    useEffect(() => {
        const expect = [MAGENTA]
        const start = setTimeout(async () => {
            const area = await measureView(box.current)
            if (!area) return setStatus('not on screen')
            setStatus('recording')
            const result = await sample(
                {
                    name: 'auto-size-padding-cover',
                    area: {
                        x: area.x + 110,
                        y: area.y + 5,
                        width: 20,
                        height: 10,
                    },
                    durationMs: 4000,
                    expect,
                    palette: [CYAN],
                },
                (sampleDone) => {
                    done.current = sampleDone
                    setShown(true)
                },
            )
            setStatus(sampleStatus(result, expect))
        }, 300)
        return () => clearTimeout(start)
    }, [sample])
    return (
        <View style={{ marginBottom: 12 }}>
            <View
                ref={box}
                collapsable={false}
                style={{ width: 240, height: 128 }}
            >
                {shown ? (
                    <FastImage
                        source={{
                            uri: imageUrl(
                                `bands.png?auto-size-padding-cover=${RUN}`,
                            ),
                        }}
                        style={{ width: 240, padding: 8 }}
                        onLoad={() => setTimeout(() => done.current(), 1500)}
                    />
                ) : null}
            </View>
            <CaseStatus
                id="auto-size-padding-cover"
                status={status}
                description={{
                    checks: "An image with only a width, padding and objectFit cover shows the whole image as it loads, not a crop of it for the padding's strip.",
                    steps: 'Records the point 10 points below the top of a 240x128 box, then loads a 600x300 image whose top fifth is magenta and the rest cyan into it with style { width: 240, padding: 8 }, until 1.5 s after onLoad. Passes when the recording sees magenta, and never cyan.',
                    shows: 'The image at 240x120: a magenta band at the top over cyan.',
                }}
            />
        </View>
    )
}

// Several sizes of an image, with only a width: the one for that width loads,
// not the largest (as for a view with no size) and then the one for the size
// it gets.
function AutoSizeSourcesCase() {
    const [status, setStatus] = useState('waiting')
    const small = `picsum/1018-256x256.jpg?auto-size-sources-small=${RUN}`
    const large = `picsum/1018-1024x1024.jpg?auto-size-sources-large=${RUN}`
    const count = async (path: string) =>
        (
            await (
                await fetch(
                    imageUrl(`requests?path=${encodeURIComponent('/' + path)}`),
                )
            ).json()
        ).count
    return (
        <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <FastImage
                    source={[
                        { uri: imageUrl(small), width: 256, height: 256 },
                        { uri: imageUrl(large), width: 1024, height: 1024 },
                    ]}
                    style={{ width: 64 }}
                    onLoad={() =>
                        setTimeout(async () => {
                            const [smallCount, largeCount] = [
                                await count(small),
                                await count(large),
                            ]
                            setStatus(
                                smallCount === 1 && largeCount === 0
                                    ? 'OK'
                                    : `the 256 px one loaded ${smallCount} times, the 1024 px one ${largeCount}`,
                            )
                        }, 2000)
                    }
                />
            </View>
            <CaseStatus
                id="auto-size-sources"
                status={status}
                description={{
                    checks: 'With several sizes of an image and only a width, the size for that width loads, and only that one.',
                    steps: 'Loads a 256x256 and a 1024x1024 size of a photo as source, with style { width: 64 } in a row. Passes when, 2 s after onLoad, the server got one request for the 256 px one and none for the 1024 px one.',
                    shows: 'The photo at 64x64 on the left.',
                }}
            />
        </View>
    )
}

// An image with only a width whose source changes to one that fails: the
// open side goes back to 0, as for an image that never loaded, rather than
// keeping the previous image's shape.
function AutoSizeFailedCase() {
    const [failing, setFailing] = useState(false)
    const [failed, setFailed] = useState(false)
    const [layout, setLayout] = useState<{ width: number; height: number }>()
    return (
        <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <FastImage
                    source={{
                        uri: imageUrl(
                            failing
                                ? `does-not-exist.jpg?auto-size-failed=${RUN}`
                                : `picsum/1018-600x300.jpg?auto-size-failed=${RUN}`,
                        ),
                    }}
                    style={{ width: 96 }}
                    onLoad={() => setTimeout(() => setFailing(true), 500)}
                    onError={() => setTimeout(() => setFailed(true), 1000)}
                    onLayout={(e) => setLayout(e.nativeEvent.layout)}
                />
            </View>
            <CaseStatus
                id="auto-size-failed"
                status={
                    !failed
                        ? 'waiting'
                        : layout?.width === 96 && layout.height === 0
                          ? 'OK'
                          : `${layout?.width}x${layout?.height} after onError`
                }
                description={{
                    checks: "An image with only a width whose source changes to one that fails is 0 high again, as before an image loaded, not the previous image's height.",
                    steps: 'Loads the 600x300 photo with style { width: 96 } in a row (96x48), then changes the source to a url that 404s. Passes when, 1 s after onError, its layout is 96x0.',
                    shows: 'Nothing: the image is 0 high.',
                }}
            />
        </View>
    )
}

// Shared with the main, minimum and tvOS apps' regression groups.
export const AUTO_SIZE_GROUPS: RegressionGroup[] = [
    {
        name: 'auto-size',
        description: {
            checks: "#436: a FastImage's open sides follow the loaded image, as an <img>'s do: the other side from its aspect ratio, or its own size with neither set.",
        },
        cases: [
            <AutoSizeCase
                key="auto-size-width"
                id="auto-size-width"
                source={{ uri: imageUrl('picsum/1018-600x300.jpg') }}
                style={{ width: 240 }}
                expected={{ width: 240, height: 120 }}
                description={{
                    checks: 'An image with only a width (in a row) gets the height its aspect ratio gives.',
                    steps: 'Loads a 600x300 photo with style { width: 240 } in a row. Passes once it has loaded and its layout is 240x120.',
                    shows: 'The photo at 240x120 on the left, not stretched.',
                }}
            />,
            <AutoSizeCase
                key="auto-size-height"
                id="auto-size-height"
                source={{ uri: imageUrl('picsum/1018-600x300.jpg') }}
                style={{ height: 64 }}
                expected={{ width: 128, height: 64 }}
                description={{
                    checks: 'An image with only a height (in a row) gets the width its aspect ratio gives.',
                    steps: 'Loads the 600x300 photo with style { height: 64 } in a row. Passes once it has loaded and its layout is 128x64.',
                    shows: 'The photo at 128x64 on the left.',
                }}
            />,
            <AutoSizeCase
                key="auto-size-natural"
                id="auto-size-natural"
                source={{ uri: imageUrl('picsum/1020-120x120.jpg') }}
                style={{}}
                expected={{ width: 120, height: 120 }}
                description={{
                    checks: 'An image with no size (in a row) is its own size: a 120x120 image is 120x120 points.',
                    steps: 'Loads a 120x120 photo with no style in a row. Passes once it has loaded and its layout is 120x120.',
                    shows: 'The 120x120 photo at 120x120 points on the left.',
                }}
            />,
            <AutoSizeCase
                key="auto-size-auto"
                id="auto-size-auto"
                source={{ uri: imageUrl('picsum/1018-600x300.jpg') }}
                style={{ width: 240, height: 'auto' }}
                expected={{ width: 240, height: 120 }}
                description={{
                    checks: "A height of 'auto' is open, as no height is.",
                    steps: "Loads the 600x300 photo with style { width: 240, height: 'auto' } in a row. Passes once it has loaded and its layout is 240x120.",
                    shows: 'The photo at 240x120 on the left.',
                }}
            />,
            <AutoSizeCase
                key="auto-size-scale"
                id="auto-size-scale"
                source={require('./images/center-dot.png')}
                style={{}}
                expected={{ width: 40, height: 40 }}
                description={{
                    checks: "A bundled @3x image with no size is its size in points: its pixels over its file's scale.",
                    steps: "Shows require('./images/center-dot.png'), only a 120x120 @3x file, with no style in a row. Passes once it has loaded and its layout is 40x40.",
                    shows: 'A 40x40 blue square on the left.',
                }}
            />,
        ],
    },
    {
        name: 'auto-size-more',
        description: {
            checks: "#436, continued: an SVG's own size, a FastImageBackground's image, and how an image with only a width is decoded and shown as it loads.",
        },
        cases: [
            <AutoSizeCase
                key="auto-size-svg"
                id="auto-size-svg"
                source={{ uri: imageUrl('svg-icon.svg?auto-size') }}
                style={{}}
                expected={{ width: 24, height: 24 }}
                description={{
                    checks: 'An SVG with no size is its own size: a 24x24 SVG is 24x24 points.',
                    steps: 'Loads a 24x24 SVG of a black ring with no style in a row. Passes once it has loaded and its layout is 24x24.',
                    shows: 'A 24x24 black ring on the left.',
                }}
            />,
            <AutoSizeBackgroundCase key="auto-size-background" />,
            <AutoSizeDownsampleCase key="auto-size-downsample" />,
            // Not on the web, where the browser crops it as it draws it (and
            // the runner doesn't record the screen).
            ...(Platform.OS === 'web'
                ? []
                : [<AutoSizeCoverCase key="auto-size-cover" />]),
        ],
    },
    {
        name: 'auto-size-styles',
        description: {
            checks: '#436, continued: padding, and a height a later style clears.',
        },
        cases: [
            <AutoSizeCase
                key="auto-size-padding"
                id="auto-size-padding"
                source={{ uri: imageUrl('picsum/1018-600x300.jpg') }}
                style={{ width: 96, padding: 8 }}
                expected={{ width: 96, height: 48 }}
                description={{
                    checks: "With padding, the image (which fills the view, padding included) has its aspect ratio: the padding isn't added to it.",
                    steps: 'Loads the 600x300 photo with style { width: 96, padding: 8 } in a row. Passes once it has loaded and its layout is 96x48.',
                    shows: 'The photo at 96x48 on the left.',
                }}
            />,
            // React Native Web keeps the earlier height.
            ...(Platform.OS === 'web'
                ? []
                : [
                      <AutoSizeCase
                          key="auto-size-cleared"
                          id="auto-size-cleared"
                          source={{ uri: imageUrl('picsum/1018-600x300.jpg') }}
                          style={[
                              { height: 200 },
                              { width: 96, height: undefined },
                          ]}
                          expected={{ width: 96, height: 48 }}
                          description={{
                              checks: 'A height a later style clears (height: undefined, as StyleSheet.flatten takes it) is open.',
                              steps: 'Loads the 600x300 photo with style [{ height: 200 }, { width: 96, height: undefined }] in a row. Passes once it has loaded and its layout is 96x48.',
                              shows: 'The photo at 96x48 on the left.',
                          }}
                      />,
                  ]),
            // Not on the web (see auto-size-cover).
            ...(Platform.OS === 'web'
                ? []
                : [<AutoSizePaddingCoverCase key="auto-size-padding-cover" />]),
        ],
    },
    {
        name: 'auto-size-changes',
        description: {
            checks: '#436, continued: a url placeholder, several sizes, a source change and a failed one, of an image with only a width.',
        },
        cases: [
            <AutoSizePlaceholderCase key="auto-size-placeholder" />,
            // Not on the web (see auto-size-cover).
            ...(Platform.OS === 'web'
                ? []
                : [<AutoSizeSourceChangeCase key="auto-size-source-change" />]),
            <AutoSizeSourcesCase key="auto-size-sources" />,
            <AutoSizeFailedCase key="auto-size-failed" />,
        ],
    },
]

export const SMOKE_GROUPS: RegressionGroup[] = [
    {
        name: 'smoke',
        // On the web, whether the browser asks for the missing image again
        // for reload() depends on timing.
        countWork: Platform.OS !== 'web',
        description: {
            checks: "FastImage works at all in an Expo app (the Expo example, on iOS, Android and the web): an image loads, a missing one fails, reload() after a failure, a bundled image, several sizes, preload, and the cache methods (on the web, that getCachePath isn't supported).",
        },
        cases: [
            <LoadCase key="load" />,
            <ErrorCase key="error" />,
            <ReloadCase key="reload" />,
            <BundledCase key="bundled" />,
            <SizesCase key="sizes" />,
            <PreloadCase key="preload" />,
            <CachePathCase key="cache-path" />,
            ...(Platform.OS === 'web'
                ? []
                : [<CacheLimitsCase key="cache-limits" />]),
        ],
    },
    ...AUTO_SIZE_GROUPS,
    ...(Platform.OS === 'web'
        ? [
              {
                  name: 'smoke-web',
                  description: {
                      checks: "The web version's own behavior: onLoad when the sizes change, a placeholder while loading, reload() of a failed url placeholder, and a blurDataUri.",
                  },
                  cases: [
                      <SizesChangeCase key="sizes-change" />,
                      <PlaceholderCase key="placeholder" />,
                      <ReloadPlaceholderCase key="reload-placeholder" />,
                      <BlurDataUriCase key="blur-data-uri" />,
                  ],
              },
          ]
        : [
              {
                  name: 'smoke-glide',
                  description: {
                      checks: "Features that on Android go through the Glide components FastImage registers itself when the app's AppGlideModule is expo-image's: onProgress, cache: 'web', writeToCache, SVG and APNG images. iOS runs the same cases.",
                  },
                  cases: [
                      <ProgressCase key="progress" />,
                      <WebCacheCase key="web-cache" />,
                      <WriteToCacheCase key="write-to-cache" />,
                      <SvgCase key="svg" />,
                      <ApngCase key="apng" />,
                      <ApngCase key="apng-blur" blur />,
                  ],
              },
          ]),
]
