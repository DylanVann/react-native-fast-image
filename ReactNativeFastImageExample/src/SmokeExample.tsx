import React, { useContext, useEffect, useRef, useState } from 'react'
import { PixelRatio, Platform, View } from 'react-native'
import FastImage, { LoadResult } from 'react-native-fast-image'
import { CaseStatus, caseStyles as styles } from './CaseStatus'
import { imageUrl } from './imageServer'
import {
    Masked,
    measureView,
    SampleContext,
    type RegressionGroup,
} from './RunnerContext'

// A few cases that check FastImage works at all in an app (the Expo example,
// ReactNativeFastImageExampleExpo, on iOS, Android and the web): an image
// loads, a missing one fails, a bundled one loads, one of several sizes is
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
                        ? 'configureCache reports the limits the Expo config plugin set'
                        : "configureCache reports no disk size limit (the app's AppGlideModule is expo-image's)"
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
                description={`Several sizes (100, 300, 900 px): a ${view} dp view loads the ${expected} px one`}
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
                description="onProgress comes before onLoad, ending with all of it loaded"
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
                description="An image with cache 'web', loaded twice, is requested once (its HTTP cache)"
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
                description="writeToCache stores a file as a url's image, which then shows from the cache"
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
                description="An SVG image loads"
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
                        ? 'An APNG with blurRadius shows its first frame (red), still (masked)'
                        : 'An APNG animates (red and blue; masked)'
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
                description="Several sizes, then with a larger one added (the same file shown): onLoad and onLoadEnd again"
            />
        </View>
    )
}

// Web: with defaultSource, the image isn't hidden while it loads (the browser
// draws it over defaultSource as it arrives), and defaultSource goes once it
// has loaded. The <img>s are in the view's element (the ref).
function DefaultSourceCase() {
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
                defaultSource={require('./images/logo.png')}
                onLoad={() =>
                    // After React has removed defaultSource.
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
                id="smoke-default-source"
                status={status}
                description="With defaultSource, the image shows as it loads, and defaultSource goes once it has"
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
            <SizesCase key="sizes" />,
            <PreloadCase key="preload" />,
            <CachePathCase key="cache-path" />,
            ...(Platform.OS === 'web'
                ? [
                      <SizesChangeCase key="sizes-change" />,
                      <DefaultSourceCase key="default-source" />,
                  ]
                : [<CacheLimitsCase key="cache-limits" />]),
        ],
    },
    ...(Platform.OS === 'web'
        ? []
        : [
              {
                  name: 'smoke-glide',
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
