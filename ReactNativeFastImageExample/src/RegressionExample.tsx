import React, {
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import {
    AppState,
    Image,
    LogBox,
    NativeModules,
    PixelRatio,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    View,
} from 'react-native'
import FastImage, {
    CachePathResult,
    ClearCacheResult,
    FastImageBackground,
    FastImageProps,
    FastImageRef,
    LoadResult,
    OnErrorEvent,
    OnProgressEvent,
    PreloadResult,
    Source,
    Transition,
} from 'react-native-fast-image'
import {
    CaseStatus,
    caseStyles,
    DescriptionText,
    DetailsContext,
} from './CaseStatus'
import { useStatusBarHeight } from './StatusBarUnderlay'
import { imageUrl, slowImageUrl } from './imageServer'
import {
    Description,
    InRunnerContext,
    Masked,
    measureView,
    RegressionGroup,
    SampleContext,
    sampleStatus,
} from './RunnerContext'

// Cases for bugs that have been fixed. Each reports OK once its expected event
// arrives (the Regression tab shows "<id>: OK"). They're in REGRESSION_GROUPS,
// which the regression runner (RegressionRunner.tsx) shows a group at a time
// and reports over a WebSocket to scripts/verify.mts (which taps the `touch`
// group's cases with maestro/touch.yaml); the Regression tab shows all of
// them at once for a look by hand, plus the cases that send the app to the
// background (maestro/background.yaml). A crash fails the run because the app
// is gone.

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
    description: Description
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
                objectFit="contain"
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
    description: Description
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
function LayoutCase({ id }: { id: string }) {
    const [x, setX] = useState<number>()
    const [loaded, setLoaded] = useState(false)
    const ok = loaded && x !== undefined && Math.abs(x - 10) < 1
    return (
        <View style={styles.row}>
            <FastImage
                style={[styles.image, { marginLeft: 10 }]}
                source={{ uri: LOGO }}
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
                description={{
                    checks: "onLayout reports the image's position in its parent (#992: it came from the inner native view, which reported 0).",
                    steps: 'Loads the logo with marginLeft: 10 and onLayout. Passes once the image has loaded and onLayout has reported x = 10.',
                    shows: 'The React logo (light blue) on a gray square, 10 dp in from the left.',
                }}
            />
        </View>
    )
}

// FastImage's and FastImageBackground's refs are the view the image fills
// (#1254): measure and measureInWindow, called through them once the images
// have loaded, report those views' sizes (48x48 and 96x48).
function RefMeasureCase() {
    const image = useRef<React.ComponentRef<typeof FastImage>>(null)
    const background =
        useRef<React.ComponentRef<typeof FastImageBackground>>(null)
    const [loads, setLoads] = useState(0)
    const [status, setStatus] = useState('waiting')
    useEffect(() => {
        if (loads < 2) return
        const size = (width: number, height: number) =>
            `${Math.round(width)}x${Math.round(height)}`
        const measure = (ref: {
            current: React.ComponentRef<typeof FastImageBackground> | null
        }) =>
            new Promise<string>((resolve) =>
                ref.current
                    ? ref.current.measure((_x, _y, width, height) =>
                          resolve(size(width, height)),
                      )
                    : resolve('no ref'),
            )
        const measureInWindow = (ref: {
            current: React.ComponentRef<typeof FastImageBackground> | null
        }) =>
            new Promise<string>((resolve) =>
                ref.current
                    ? ref.current.measureInWindow((_x, _y, width, height) =>
                          resolve(size(width, height)),
                      )
                    : resolve('no ref'),
            )
        Promise.all([
            measure(image),
            measureInWindow(image),
            measure(background),
            measureInWindow(background),
        ]).then((sizes) => {
            const expected = ['48x48', '48x48', '96x48', '96x48']
            setStatus(
                sizes.every((s, i) => s === expected[i])
                    ? 'OK'
                    : `measured ${sizes.join(', ')}, expected ${expected.join(', ')}`,
            )
        })
    }, [loads])
    const onLoad = () => setLoads((n) => n + 1)
    return (
        <View style={styles.row}>
            <FastImage
                ref={image}
                style={styles.image}
                source={{ uri: LOGO }}
                onLoad={onLoad}
            />
            <FastImageBackground
                ref={background}
                style={[styles.image, styles.gap, { width: 96 }]}
                source={{ uri: LOGO }}
                onLoad={onLoad}
            />
            <CaseStatus
                id="ref-measure"
                status={status}
                description={{
                    checks: "measure and measureInWindow, called through FastImage's and FastImageBackground's refs, report the size of the view the image fills (#1254 typed these refs; this checks they reach that view).",
                    steps: 'Loads the logo in a 48×48 FastImage and a 96×48 FastImageBackground, each with a ref. Once both have loaded, calls measure and measureInWindow through each ref. Passes if they report 48x48, 48x48, 96x48 and 96x48.',
                    shows: 'The React logo on a gray square, then the logo in a wide box, scaled up to its width and cropped at the top and bottom (cover).',
                }}
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
                objectFit="contain"
                source={{ uri: LOGO }}
            />
            <FastImage
                style={[styles.image, { marginLeft: 8 }]}
                objectFit="contain"
                source={{ uri: LOGO }}
                tintColor={tinted ? 'green' : undefined}
                onLoad={() => setTinted(false)}
            />
            <CaseStatus
                id="clear-tint"
                status={done ? 'OK' : 'waiting'}
                description={{
                    checks: 'tintColor removed after the image has loaded shows it untinted again (#586: iOS kept the tint).',
                    steps: 'Loads the logo twice: the right one with tintColor green, removed in its onLoad. Passes 500 ms later.',
                    shows: 'Two identical light blue React logos. A green right one is the bug.',
                }}
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
                description={{
                    checks: "FastImage as a Touchable's direct child, which passes its onClick to the image (#1020: iOS crashed with an unrecognized selector, setOnClick:).",
                    steps: 'Shows the logo inside a TouchableWithoutFeedback; the touch flow taps the image. Passes when onPress fires.',
                    shows: 'The React logo (light blue) on the gray square.',
                }}
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
                description={{
                    checks: 'pointerEvents="none" on FastImage lets touches through to the view under it (#393: the prop went to the image inside FastImage\'s wrapper, which still took the touch).',
                    steps: 'Shows the logo with pointerEvents="none" over a Pressable of the same size; the touch flow taps there. Passes when the Pressable gets the press.',
                    shows: 'The React logo (light blue) on the gray square (the Pressable under it).',
                }}
            />
        </View>
    )
}

// A FastImage with pointerEvents="box-none" over a Pressable. maestro/touch.yaml
// taps the Pressable's position; passes when it gets the press. FastImage is
// a single view without children, so box-none leaves nothing to touch.
function PointerEventsBoxNoneCase() {
    const [pressed, setPressed] = useState(false)
    return (
        <View style={styles.row}>
            <View>
                <Pressable
                    testID="regression-box-none-target"
                    style={styles.image}
                    onPress={() => setPressed(true)}
                />
                <FastImage
                    pointerEvents="box-none"
                    style={[styles.image, StyleSheet.absoluteFill]}
                    source={{ uri: LOGO }}
                />
            </View>
            <CaseStatus
                id="pointer-events-box-none"
                status={pressed ? 'OK' : 'tap the image'}
                description={{
                    checks: 'pointerEvents="box-none" on FastImage lets touches through to the view under it: FastImage is a single view without children, so there\'s nothing left to touch.',
                    steps: 'Shows the logo with pointerEvents="box-none" over a Pressable of the same size; the touch flow taps there. Passes when the Pressable gets the press.',
                    shows: 'The React logo (light blue) on the gray square (the Pressable under it).',
                }}
            />
        </View>
    )
}

// A FastImage with an accessibility label, which maestro/touch.yaml finds by
// that label and taps; it takes the touch with responder props (View props,
// on the image's own view). (Maestro finds it by its label whether or not iOS
// treats it as an accessibility element, so this doesn't check `accessible`.)
function AccessibleCase() {
    const [pressed, setPressed] = useState(false)
    return (
        <View style={styles.row}>
            <FastImage
                accessible
                accessibilityLabel="regression accessible image"
                onStartShouldSetResponder={() => true}
                onResponderRelease={() => setPressed(true)}
                style={styles.image}
                source={{ uri: LOGO }}
            />
            <CaseStatus
                id="accessible"
                status={pressed ? 'OK' : 'tap the image'}
                description={{
                    checks: "accessibilityLabel and the responder props (onStartShouldSetResponder, onResponderRelease) work on FastImage's own view: it can be found by its label and touched.",
                    steps: 'Shows the logo with accessible, an accessibilityLabel and responder props; the touch flow finds it by that label and taps it. Passes on onResponderRelease.',
                    shows: 'The React logo (light blue) on the gray square.',
                }}
            />
        </View>
    )
}

// AccessibleCase with aria-label instead of accessibilityLabel and
// `accessible` (which aria-label implies on iOS): React Native's views don't
// read the aria props, so FastImage maps them in JS, as View and Image do.
// maestro/touch.yaml finds it by that label and taps it.
function AriaLabelCase() {
    const [pressed, setPressed] = useState(false)
    return (
        <View style={styles.row}>
            <FastImage
                aria-label="regression aria-label image"
                onStartShouldSetResponder={() => true}
                onResponderRelease={() => setPressed(true)}
                style={styles.image}
                source={{ uri: LOGO }}
            />
            <CaseStatus
                id="aria-label"
                status={pressed ? 'OK' : 'tap the image'}
                description={{
                    checks: "aria-label is the image's accessibility label (React Native's views don't read the aria props, so FastImage maps them; before, the image had no label).",
                    steps: 'Shows the logo with aria-label and responder props; the touch flow finds it by that label and taps it. Passes on onResponderRelease.',
                    shows: 'The React logo (light blue) on the gray square.',
                }}
            />
        </View>
    )
}

// A FastImage with hitSlop to its right and responder props. maestro/touch.yaml
// taps the gray square beside it, which has pointerEvents="none" (the touch
// goes to what's under it, the image's slop); passes when the image gets it.
function HitSlopCase() {
    const [pressed, setPressed] = useState(false)
    return (
        <View style={styles.row}>
            <View style={touchStyles.hitSlopArea}>
                <FastImage
                    hitSlop={{ right: 40 }}
                    onStartShouldSetResponder={() => true}
                    onResponderRelease={() => setPressed(true)}
                    style={styles.image}
                    source={{ uri: LOGO }}
                />
                <View
                    testID="regression-hit-slop-target"
                    accessible
                    pointerEvents="none"
                    style={touchStyles.hitSlopMarker}
                />
            </View>
            <CaseStatus
                id="hit-slop"
                status={pressed ? 'OK' : 'tap beside the image'}
                description={{
                    checks: 'hitSlop on FastImage: a touch beside the image, inside its slop, reaches it.',
                    steps: 'Shows the logo with hitSlop={{ right: 40 }} and responder props, and a small gray square to its right (pointerEvents="none") inside the slop; the touch flow taps the square. Passes when the image gets onResponderRelease.',
                    shows: 'The React logo (light blue) on the gray square, then a smaller, slightly darker gray square to its right (the tap target).',
                }}
            />
        </View>
    )
}

// onFocus and onBlur on a focusable FastImage, from keyboard focus (Android:
// React Native's base view manager sends them for any view). maestro/touch.yaml
// taps the text field before the image and presses Tab twice, which moves
// focus to the image and on to the 1-point view after it (so it lands there,
// not wherever the search wraps to, and the screenshot doesn't show it);
// passes when it got onFocus, then onBlur. Not on
// iOS, where React Native sends them only for focus moved from code, behind a
// feature flag.
function FocusCase() {
    const [events, setEvents] = useState<string[]>([])
    return (
        <View style={styles.row}>
            {/* Without the soft keyboard, which would cover the screenshot. */}
            <TextInput
                testID="regression-focus-input"
                showSoftInputOnFocus={false}
                style={touchStyles.focusInput}
            />
            <FastImage
                focusable
                onFocus={() => setEvents((e) => [...e, 'focus'])}
                onBlur={() => setEvents((e) => [...e, 'blur'])}
                style={styles.image}
                source={{ uri: LOGO }}
            />
            <View focusable style={touchStyles.focusNext} />
            <CaseStatus
                id="focus"
                status={
                    events[0] === 'focus' && events[1] === 'blur'
                        ? 'OK'
                        : `focus with Tab (${events.join(', ') || 'none yet'})`
                }
                description={{
                    checks: 'A focusable FastImage gets onFocus and onBlur as keyboard focus moves to it and on (Android only: on iOS React Native sends them only for focus moved from code).',
                    steps: 'Shows a text field (without the soft keyboard), the logo with focusable, onFocus and onBlur, and a 1-point focusable view after it. The touch flow taps the text field and presses Tab twice, moving focus to the image and on. Passes once onFocus, then onBlur, fired.',
                    shows: 'An empty text field (a white square with a gray border), then the React logo (light blue) on the gray square.',
                }}
            />
        </View>
    )
}

const touchStyles = StyleSheet.create({
    // The image (48) and its slop (40).
    hitSlopArea: { width: 88 },
    hitSlopMarker: {
        position: 'absolute',
        left: 58,
        top: 14,
        width: 20,
        height: 20,
        backgroundColor: '#ddd',
    },
    focusInput: {
        width: 48,
        height: 48,
        marginRight: 4,
        borderWidth: 1,
        borderColor: '#999',
    },
    focusNext: { width: 1, height: 1 },
})

// A wide image in square boxes: the left one is contain; the right one loads
// as cover, then switches to contain. Both should match (checked by
// screenshot). Android kept showing the cover crop (#762).
// A stable source object: a new one on each render re-sends the source prop,
// which reloaded the image and hid the bug.
const WIDE = { uri: imageUrl('picsum/1018-600x300.jpg') }
function ObjectFitChangeCropCase() {
    const [fit, setFit] = useState<'cover' | 'contain'>('cover')
    const [done, setDone] = useState(false)
    useEffect(() => {
        if (fit === 'cover') return
        const timer = setTimeout(() => setDone(true), 750)
        return () => clearTimeout(timer)
    }, [fit])
    return (
        <View style={styles.row}>
            <FastImage style={styles.image} objectFit="contain" source={WIDE} />
            <FastImage
                style={[styles.image, { marginLeft: 8 }]}
                objectFit={fit}
                source={WIDE}
                onLoad={() => setFit('contain')}
            />
            <CaseStatus
                id="fit-change"
                status={done ? 'OK' : 'waiting'}
                description={{
                    checks: 'objectFit changed from cover to contain after the image has loaded (#762: Android kept showing the cover crop).',
                    steps: 'Loads a 600×300 photo in two squares: the left with objectFit="contain", the right with cover, switched to contain in its onLoad (the same source object throughout: a new one reloaded the image, which hid the bug). Passes 750 ms later.',
                    shows: 'Two identical photos of green cliffs, letterboxed: gray above and below. A right one that fills its square is the bug.',
                }}
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
                description={{
                    checks: "Changing a prop that doesn't affect loading doesn't load the image again (Android reloaded it on every prop update).",
                    steps: "Loads a 600x300 photo; once it has loaded, changes accessibilityLabel every 200 ms for a second. Passes if onLoadStart didn't fire again.",
                    shows: 'A photo of green hills, cropped to the square.',
                }}
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
                description={{
                    checks: 'Changing source over and over keeps loading each new image (#384: Android kept the view in its progress list under every url it had loaded, which kept the view and its Activity alive).',
                    steps: 'Loads three 120x120 photos in turn in one view, moving to the next on each onLoad, four times, so it ends on the second. Passes when the last one loads.',
                    shows: 'A black and white photo of a misty forest.',
                }}
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
                description={{
                    checks: 'onLoadStart fires once per load (iOS sent it twice when source and onLoadStart were set in the same update).',
                    steps: 'Loads a 200x200 photo with onLoadStart and onLoad set from the first render. Passes once onLoad has fired, if onLoadStart fired once.',
                    shows: 'A photo of a pug wrapped in a blanket.',
                }}
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
                description={{
                    checks: 'FastImage.preload, then a view of the same image, which loads.',
                    steps: "Preloads a photo, and half a second later shows it in a view. Passes on the view's onLoad.",
                    shows: 'A photo of a pug in a blanket.',
                }}
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
                description={{
                    checks: "Headers given to FastImage.preload aren't sent with other images (#571: iOS set them on the shared downloader, so every later request sent them).",
                    steps: 'Preloads an image with the header x-token, then half a second later shows another image from a url the server answers with a 400 if the request has an x-token header. Passes on onLoad; onError fails it.',
                    shows: "A green aurora over a tree. An empty gray square means the image's request had the preload's header (the server answers it with a 400).",
                }}
            />
        </View>
    )
}

// `headers` that isn't an object of strings: null (e.g. a header object
// built only when signed in), an array, and values native can't send (null,
// an object) next to a string one. The private urls fail without the string
// header, so they check it's still sent: iOS dropped every header when one
// wasn't a string, and Android crashed on all of these. (Numbers and booleans
// are sent as strings, converted in JS: src/index.test.tsx's headers tests.)
const INVALID_HEADERS = {
    'x-token': 'fast-image',
    'x-null': null,
    'x-object': {},
} as unknown as { [key: string]: string }
const HEADERS_PRIVATE = imageUrl(
    `private/picsum/1020-120x120.jpg?invalid-headers=${RUN}`,
)
const HEADERS_PRELOAD_PRIVATE = imageUrl(
    `private/picsum/1021-120x120.jpg?invalid-headers-preload=${RUN}`,
)
// The logo preloaded twice, each with a url of its own: with one url, whether
// iOS decodes it once or twice depends on whether the second preload joins
// the first's download (see scripts/verify.mts's work counts).
const HEADERS_PRELOAD_NULL = imageUrl('logo.png?preload-headers-null')
const HEADERS_PRELOAD_ARRAY = imageUrl('logo.png?preload-headers-array')
function PreloadInvalidHeadersCase() {
    const [status, setStatus] = useState('waiting')
    useEffect(() => {
        FastImage.preload([
            { uri: HEADERS_PRELOAD_NULL, headers: null as unknown as {} },
            {
                uri: HEADERS_PRELOAD_ARRAY,
                headers: ['x-token'] as unknown as {},
            },
            { uri: HEADERS_PRELOAD_PRIVATE, headers: INVALID_HEADERS },
        ])
            .then((results) => {
                const failed = results.findIndex((result) => !result.ok)
                const result = results[failed]
                setStatus(
                    result && !result.ok
                        ? `source ${failed + 1} failed: ${result.error}`
                        : 'OK',
                )
            })
            .catch((e) => setStatus(`error: ${e}`))
    }, [])
    return (
        <View style={styles.row}>
            <View style={styles.image} />
            <CaseStatus
                id="headers-invalid-preload"
                status={status}
                description={{
                    checks: "FastImage.preload with headers: null, headers as an array, or header values that aren't strings preloads each source, and sends the string headers (Android crashed).",
                    steps: "Preloads three sources: the logo with headers: null; the logo with headers: ['x-token']; a photo from the /private/ path (403 without x-token: fast-image) with a string x-token next to a null and an object value. Passes when every result is ok.",
                    shows: 'An empty gray square: preload shows no image.',
                }}
            />
        </View>
    )
}

// React Native's RawEventEmitter, which gets each native event before React
// looks for its handler (it's there for performance monitoring). Not in React
// Native's types. Its deep import logs a warning in development, which would
// show in the screenshots.
LogBox.ignoreLogs([
    "Deep imports from the 'react-native' package are deprecated ('react-native/Libraries/Core/RawEventEmitter')",
])
const RawEventEmitter: {
    addListener(
        type: '*',
        listener: (event: {
            eventName: string
            nativeEvent: { target?: number }
        }) => void,
    ): { remove(): void }
} = require('react-native/Libraries/Core/RawEventEmitter').default

type ViewRef = React.ComponentRef<typeof View>

// The tag of a FastImage's native view (its ref), which its events have as
// nativeEvent.target.
function imageViewTag(view: ViewRef | null): number | undefined {
    return (view as any)?.__nativeTag
}

// Counts the events that reach JS from two images without handlers, until a
// third with the same source and onLoadEnd has loaded (and a moment after);
// passes if there were none (and the third's onLoadEnd was seen, so the count
// works). Images without handlers sent onLoadStart, onLoad and onLoadEnd.
const NO_HANDLERS = imageUrl(`picsum/1025-200x200.jpg?no-handlers=${RUN}`)
function NoHandlersCase() {
    // The two images without handlers, then the one with onLoadEnd.
    const wrappers = useRef<(ViewRef | null)[]>([])
    const counts = useRef([0, 0, 0])
    const [status, setStatus] = useState('waiting')
    useEffect(() => {
        const subscription = RawEventEmitter.addListener(
            '*',
            ({ eventName, nativeEvent }) => {
                if (!eventName.startsWith('topFastImage')) return
                const i = wrappers.current
                    .map(imageViewTag)
                    .indexOf(nativeEvent.target)
                if (nativeEvent.target != null && i >= 0) counts.current[i]++
            },
        )
        return () => subscription.remove()
    }, [])
    const onLoadEnd = () =>
        setTimeout(() => {
            const [a, b, handled] = counts.current
            setStatus(
                wrappers.current.map(imageViewTag).includes(undefined)
                    ? "the image views' tags weren't found"
                    : handled === 0
                      ? "the third image's onLoadEnd wasn't seen"
                      : a + b > 0
                        ? `${a + b} events reached JS without a handler`
                        : 'OK',
            )
        }, 500)
    return (
        <View style={styles.row}>
            {[0, 1, 2].map((i) => (
                <FastImage
                    key={i}
                    ref={(view) => {
                        wrappers.current[i] = view
                    }}
                    style={[styles.image, i > 0 && styles.gap]}
                    source={{ uri: NO_HANDLERS }}
                    onLoadEnd={i === 2 ? onLoadEnd : undefined}
                />
            ))}
            <CaseStatus
                id="no-handlers"
                status={status}
                description={{
                    checks: 'Images without event handlers send no events to JS (they sent onLoadStart, onLoad and onLoadEnd anyway, work for nothing on the JS thread).',
                    steps: "Loads one photo in three images: the first two have no handlers, the third has onLoadEnd. Counts every Fast Image event React Native receives from the first two. Passes if, half a second after the third's onLoadEnd, none arrived.",
                    shows: 'Three copies of the same photo (a pug in a blanket).',
                }}
            />
        </View>
    )
}

// Loads an image into a 48×48 view and checks onLoad reports the image's own
// size, as iOS does. Android reported the size of the bitmap it decoded to fit
// the view. An animated one is masked (its frame differs between runs).
function SourceSizeCase({
    id,
    description,
    uri,
    width,
    height,
    animated = false,
}: {
    id: string
    description: Description
    uri: string
    width: number
    height: number
    animated?: boolean
}) {
    const [size, setSize] = useState<string>()
    const expected = `${width}x${height}`
    const image = (
        <FastImage
            style={styles.image}
            objectFit="contain"
            source={{ uri }}
            onLoad={(e) =>
                setSize(`${e.nativeEvent.width}x${e.nativeEvent.height}`)
            }
        />
    )
    return (
        <View style={styles.row}>
            {animated ? <Masked>{image}</Masked> : image}
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
                    objectFit="contain"
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
                description={{
                    checks: "onLoad reports the image's own size when the image comes from a cache, too.",
                    steps: "Loads the 1000×1000 logo (on Android from the app's assets, so the third load comes from Glide's disk cache of resized images, which it only uses for local images) three times: decoded, from the memory cache, and after FastImage.clearMemoryCache(). Passes if every onLoad reported 1000x1000; the image is removed after the third.",
                    shows: 'An empty gray square: the image is removed once its third load has been checked.',
                }}
            />
        </View>
    )
}

// Loads an image with `cache: 'web'` from a url the server marks as cacheable
// for an hour, loads it again, then asks the server how many times it was
// requested: once, if the second load came from the HTTP cache. Android sent
// every request to the network (#280). `avif`: an AVIF, which iOS didn't keep
// in the HTTP cache (SDWebImage's format check doesn't know AVIF).
const WEB_PATH = `/max-age/picsum/1025-200x200.jpg?web=${RUN}`
const WEB_AVIF_PATH = `/max-age/formats/quadrants.avif?web-avif=${RUN}`
function WebCacheCase({ avif }: { avif?: boolean }) {
    const path = avif ? WEB_AVIF_PATH : WEB_PATH
    const [loads, setLoads] = useState(0)
    const [requests, setRequests] = useState<number>()
    useEffect(() => {
        if (loads !== 2) return
        fetch(imageUrl(`requests?path=${encodeURIComponent(path)}`))
            .then((response) => response.json())
            .then((json) => setRequests(json.count))
            .catch(() => setRequests(-1))
    }, [loads, path])
    return (
        <View style={styles.row}>
            {loads < 2 ? (
                <FastImage
                    key={loads}
                    style={styles.image}
                    source={{
                        uri: imageUrl(path.slice(1)),
                        cache: 'web',
                    }}
                    onLoad={() => setLoads((n) => n + 1)}
                />
            ) : (
                <View style={styles.image} />
            )}
            <CaseStatus
                id={avif ? 'web-cache-avif' : 'web-cache'}
                status={
                    requests === undefined
                        ? 'waiting'
                        : requests === 1
                          ? 'OK'
                          : `requested ${requests} times`
                }
                description={
                    avif
                        ? {
                              checks: "cache: 'web' keeps an AVIF in the HTTP cache (iOS requested it again: SDWebImage's format check doesn't know AVIF).",
                              steps: "Loads an AVIF of four colored quadrants with cache: 'web' from the image server's max-age/ path (cacheable for an hour), then mounts a new view that loads it again, then replaces it with an empty view. Passes if the server got one request for it.",
                              shows: 'An empty gray square: the image view is gone by the end.',
                          }
                        : {
                              checks: "cache: 'web' follows the server's caching headers (#280: Android sent every request to the network).",
                              steps: "Loads a 200x200 photo with cache: 'web' from the image server's max-age/ path (cacheable for an hour), then mounts a new view that loads it again, then replaces it with an empty view. Passes if the server got one request for it.",
                              shows: 'An empty gray square: the image view is gone by the end.',
                          }
                }
            />
        </View>
    )
}

// Clears the memory and disk caches. Resolves with the first one's error, or
// undefined if both cleared.
async function clearCaches() {
    const results = await Promise.all([
        FastImage.clearMemoryCache(),
        FastImage.clearDiskCache(),
    ])
    for (const result of results) {
        if (!result.ok) return result.error
    }
    return undefined
}

// Loads an image with `cache: 'web'` that the server marks as cacheable for an
// hour, clears the caches, and loads it again: the server should get a second
// request. clearDiskCache left the HTTP cache of `web` images (Android's, and
// on iOS the app's shared NSURLCache), so it came from there. Both clear
// functions must resolve ok. A url of its own each time it mounts, so the
// runner's retry counts its own requests.
function WebCacheClearCase() {
    const [webClearPath] = useState(
        () => `/max-age/picsum/1025-200x200.jpg?web-clear=${RUN}-${Date.now()}`,
    )
    const [step, setStep] = useState<'first' | 'cleared' | 'done'>('first')
    const [requests, setRequests] = useState<number>()
    const [clearError, setClearError] = useState<string>()
    useEffect(() => {
        if (step !== 'done') return
        fetch(imageUrl(`requests?path=${encodeURIComponent(webClearPath)}`))
            .then((response) => response.json())
            .then((json) => setRequests(json.count))
            .catch(() => setRequests(-1))
    }, [step, webClearPath])
    return (
        <View style={styles.row}>
            <FastImage
                // A new view for the second load, which stays (showing the
                // image) once it's done.
                key={step === 'first' ? 'first' : 'second'}
                style={styles.image}
                source={{
                    uri: imageUrl(webClearPath.slice(1)),
                    cache: 'web',
                }}
                onLoad={() => {
                    if (step === 'first') {
                        clearCaches().then((error) => {
                            if (error) setClearError(error)
                            setStep('cleared')
                        })
                    } else setStep('done')
                }}
            />
            <CaseStatus
                id="web-cache-clear"
                status={
                    clearError
                        ? `clear failed: ${clearError}`
                        : requests === undefined
                          ? step
                          : requests === 2
                            ? 'OK'
                            : `requested ${requests} times`
                }
                description={{
                    checks: "FastImage.clearDiskCache also clears the HTTP cache of cache: 'web' images, so the image is downloaded again (clearDiskCache left that cache, Android's and on iOS the app's shared NSURLCache, so the image came from there).",
                    steps: "Loads a photo with cache: 'web' from a url the server marks as cacheable for an hour, then calls FastImage.clearMemoryCache and FastImage.clearDiskCache and loads it again in a new view. Passes when both clears resolved ok and the server got two requests for it.",
                    shows: 'A photo of a pug in a blanket (the second load). An empty gray square means the second load never finished.',
                }}
            />
        </View>
    )
}

// Preloads a `cache: 'web'` image, clears the caches and preloads it again as
// soon as the clears resolve, 10 times: each image must be requested twice.
// On iOS, the HTTP cache's removal took effect a few milliseconds after
// clearDiskCache resolved, and a load in that time got the old response.
function WebCacheClearPreloadCase() {
    const [status, setStatus] = useState('waiting')
    useEffect(() => {
        const run = async () => {
            for (let round = 0; round < 10; round++) {
                const path = `/max-age/picsum/1025-200x200.jpg?web-clear-preload=${RUN}-${Date.now()}-${round}`
                const source = {
                    uri: imageUrl(path.slice(1)),
                    cache: 'web' as const,
                }
                const [first] = await FastImage.preload([source])
                if (!first.ok)
                    return setStatus(
                        `round ${round + 1}: the first preload failed`,
                    )
                const clearError = await clearCaches()
                if (clearError) return setStatus(`clear failed: ${clearError}`)
                const [second] = await FastImage.preload([source])
                if (!second.ok)
                    return setStatus(
                        `round ${round + 1}: the second preload failed`,
                    )
                const response = await fetch(
                    imageUrl(`requests?path=${encodeURIComponent(path)}`),
                )
                const { count } = (await response.json()) as { count: number }
                if (count !== 2)
                    return setStatus(
                        `round ${round + 1}: requested ${count} times`,
                    )
            }
            setStatus('OK')
        }
        run().catch((e) => setStatus(`error: ${e}`))
    }, [])
    return (
        <View style={styles.row}>
            <View style={styles.image} />
            <CaseStatus
                id="web-cache-clear-preload"
                status={status}
                description={{
                    checks: "A cache: 'web' image preloaded right after FastImage.clearDiskCache resolves is downloaded again (on iOS, the HTTP cache's removal took effect a few milliseconds after clearDiskCache resolved, and a load in that time got the old response).",
                    steps: "Ten times, with a new url each time that the server marks as cacheable for an hour: preloads the photo with cache: 'web', clears the memory and disk caches, preloads it again as soon as the clears resolve, and asks the server how many times it was requested. Passes when every preload and clear succeeded and each url was requested twice.",
                    shows: 'An empty gray square: the case only preloads.',
                }}
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
                description={{
                    checks: 'onProgress events have a progress (loaded / total, 0 to 1), and the last one is 1.',
                    steps: 'Loads a 2048x2048 photo (a new url each run) that the server sends with a Content-Length. Each onProgress must have a total above 0, loaded between 0 and the total and never going down, and progress equal to loaded / total; passes at onLoad if there was at least one and the last had everything loaded and progress 1.',
                    shows: 'A photo of a fjord seen from a cliff.',
                }}
            />
        </View>
    )
}

// Loads an image the server sends without a Content-Length, so its size is
// unknown while it loads (Android sent a total of -1 and iOS -1 or 0, which
// made loaded / total negative or infinite), and checks its onProgress events.
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
                description={{
                    checks: 'onProgress for an image whose size is unknown (no Content-Length): none sent, or each with a real total (Android sent a total of -1 and iOS -1 or 0, so loaded / total was negative or infinite).',
                    steps: "Loads the 2048x2048 photo from the image server's chunked/ path, which sends it without a Content-Length. Passes at onLoad if there were no onProgress events, or each had a total above 0, loaded between 0 and the total, and the last one 1.",
                    shows: 'A photo of a fjord seen from a cliff.',
                }}
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
                description={{
                    checks: 'onProgress for an image sent gzip-compressed, whose Content-Length is smaller than the image the client ends up with: loaded never goes past the total.',
                    steps: "Loads the 2048x2048 photo from the image server's gzip/ path. Passes at onLoad if each onProgress had loaded between 0 and the total and the last one was 1 (or there were none).",
                    shows: 'A photo of a fjord seen from a cliff.',
                }}
            />
        </View>
    )
}

// Many images with onProgress load one url from the slow server while more of
// them, on the same url, mount and unmount every frame, for several rounds (a
// new url each). A round ends once each of the images has loaded; passes when
// every round does with no onError, and each image got onProgress before its
// onLoad, never going back, the last 1, and none after, and each mount of the
// churned ones got onLoadStart before any onProgress. Android went through
// the url's list of views on the download's thread to send progress, while the
// UI thread added and removed views: that threw a
// ConcurrentModificationException, which failed the download (every image on
// the url got onError). And a view that mounted while the url's progress was
// waiting to be sent could get it before its own onLoadStart, which was
// posted after it.
const SHARED_URL_ROUNDS = 8
const SHARED_URL_VIEWS = 40
const SHARED_URL_CHURN = 10
function ProgressSharedUrlCase() {
    const [round, setRound] = useState(0)
    const [error, setError] = useState<string>()
    const [problem, setProblem] = useState<string>()
    const [frame, setFrame] = useState(0)
    // This round: the images that loaded, and each image's last onProgress.
    const loaded = useRef(new Set<number>())
    const progress = useRef(new Map<number, number>())
    const done =
        round >= SHARED_URL_ROUNDS ||
        error !== undefined ||
        problem !== undefined
    const source = useMemo(
        () => ({
            uri: slowImageUrl(
                `picsum/1015-2048x2048.jpg?shared-url=${round}-${RUN}&delay=100`,
            ),
            headers: { 'x-token': 'fast-image' },
        }),
        [round],
    )
    useEffect(() => {
        if (done) return
        let id = requestAnimationFrame(function step() {
            setFrame((f) => f + 1)
            id = requestAnimationFrame(step)
        })
        return () => cancelAnimationFrame(id)
    }, [done])
    const fail = (message: string) =>
        setProblem((previous) => previous ?? message)
    const onProgress = (view: number, e: OnProgressEvent) => {
        const last = progress.current.get(view)
        if (loaded.current.has(view)) {
            fail(`image ${view + 1}: onProgress after onLoad`)
        } else if (last !== undefined && e.nativeEvent.progress < last) {
            fail(`image ${view + 1}: onProgress went back`)
        }
        progress.current.set(view, e.nativeEvent.progress)
    }
    const onLoad = (view: number) => {
        const last = progress.current.get(view)
        if (last === undefined) {
            fail(`image ${view + 1}: no onProgress before onLoad`)
        } else if (last !== 1) {
            fail(`image ${view + 1}: last onProgress ${last}, not 1`)
        }
        loaded.current.add(view)
        if (loaded.current.size === SHARED_URL_VIEWS) {
            loaded.current.clear()
            progress.current.clear()
            setRound((r) => r + 1)
        }
    }
    const onError = (e: OnErrorEvent) => {
        const message = String(e.nativeEvent.error)
        setError((previous) => previous ?? message)
    }
    return (
        <View style={styles.row}>
            <View style={sharedUrlStyles.images}>
                {!done &&
                    Array.from({ length: SHARED_URL_VIEWS }, (_, i) => (
                        <FastImage
                            key={`view-${i}`}
                            style={sharedUrlStyles.image}
                            source={source}
                            onProgress={(e) => onProgress(i, e)}
                            onLoad={() => onLoad(i)}
                            onError={onError}
                        />
                    ))}
                {/* Mounted every other frame. */}
                {!done &&
                    frame % 2 === 0 &&
                    Array.from({ length: SHARED_URL_CHURN }, (_, i) => (
                        <SharedUrlChurnImage
                            key={`churn-${round}-${i}`}
                            source={source}
                            onError={onError}
                            fail={fail}
                        />
                    ))}
            </View>
            <CaseStatus
                id="progress-shared-url"
                status={
                    error !== undefined
                        ? `onError: ${error}`
                        : problem !== undefined
                          ? problem
                          : done
                            ? 'OK'
                            : `round ${round + 1} of ${SHARED_URL_ROUNDS}`
                }
                description={{
                    checks: "onProgress for many images on one url while others on it mount and unmount: every image loads, with onProgress only after its onLoadStart and before its onLoad (Android went through the url's list of views on the download thread while the UI thread changed it, which threw and failed the download for every image; and a view that mounted while progress was waiting to be sent could get it before its own onLoadStart).",
                    steps: 'Forty 6-point images with onProgress load one url from the slow server while ten more on that url mount and unmount every other frame, for eight rounds, a new url each round; a round ends once the forty have loaded. Passes after the eight rounds if there was no onError, each of the forty got onProgress before onLoad, never going back, ending at 1 and none after, and no mounted image got onProgress before its onLoadStart.',
                    shows: 'Nothing: the images are removed once it has passed, leaving an empty area.',
                }}
            />
        </View>
    )
}

// One of ProgressSharedUrlCase's churned images, a new one each mount (and
// each round): its onProgress mustn't come before its onLoadStart.
function SharedUrlChurnImage({
    source,
    onError,
    fail,
}: {
    source: Source
    onError: (e: OnErrorEvent) => void
    fail: (message: string) => void
}) {
    const started = useRef(false)
    return (
        <FastImage
            style={sharedUrlStyles.image}
            source={source}
            onLoadStart={() => {
                started.current = true
            }}
            onProgress={() => {
                if (!started.current) {
                    fail('a mounted image: onProgress before onLoadStart')
                }
            }}
            onError={onError}
        />
    )
}

const sharedUrlStyles = StyleSheet.create({
    images: { width: 64, height: 64, flexDirection: 'row', flexWrap: 'wrap' },
    image: { width: 6, height: 6 },
})

// An image with onProgress loads a url from the slow server; once it has
// loaded, another image downloads the same url again (both with
// `cache: 'web'`, and the slow server's responses have no cache headers, so
// it isn't cached). Passes when the first image gets no onProgress after its
// onLoad, and the second gets some. Android sent a url's progress to every
// image that had loaded it, until it loaded another source, so the first
// image got the second download's.
const AFTER_LOAD_URL = slowImageUrl(
    `picsum/1025-200x200.jpg?after-load=${RUN}&delay=100`,
)
function ProgressAfterLoadCase() {
    const firstLoaded = useRef(false)
    const [secondStarted, setSecondStarted] = useState(false)
    const [secondLoaded, setSecondLoaded] = useState(false)
    const [late, setLate] = useState(0)
    const [secondProgress, setSecondProgress] = useState(0)
    // The slow server only sends images with it.
    const headers = { 'x-token': 'fast-image' }
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={{ uri: AFTER_LOAD_URL, headers, cache: 'web' }}
                onProgress={() => {
                    if (firstLoaded.current) setLate((n) => n + 1)
                }}
                onLoad={() => {
                    firstLoaded.current = true
                    setSecondStarted(true)
                }}
            />
            {secondStarted && (
                <FastImage
                    style={styles.image}
                    source={{ uri: AFTER_LOAD_URL, headers, cache: 'web' }}
                    onProgress={() => setSecondProgress((n) => n + 1)}
                    onLoad={() => setSecondLoaded(true)}
                />
            )}
            <CaseStatus
                id="progress-after-load"
                status={
                    late > 0
                        ? `onProgress after onLoad (${late} times)`
                        : !secondLoaded
                          ? 'waiting'
                          : secondProgress === 0
                            ? 'no onProgress for the second download'
                            : 'OK'
                }
                description={{
                    checks: "An image gets no onProgress after its onLoad when another image downloads the same url (Android sent a url's progress to every image that had loaded it, until it loaded another source).",
                    steps: "Loads a 200x200 photo from the slow server with cache: 'web' (the slow server sends no cache headers, so it isn't cached) and onProgress; once it loads, a second image downloads the same url. Passes once the second has loaded, if it got onProgress and the first got none after its onLoad.",
                    shows: 'Two photos of a pug wrapped in a blanket, side by side.',
                }}
            />
        </View>
    )
}

// An image with onProgress loads a slow server url written with its scheme in
// capitals (HTTP://). Passes when it gets onProgress, ending at 1. Android
// looked images up by their url as written, while downloads reported it as
// OkHttp writes it (a lowercase scheme and host, no default port), so these
// urls got no onProgress.
const UPPERCASE_SCHEME_URL = slowImageUrl(
    `picsum/1025-200x200.jpg?url-form=${RUN}&delay=100`,
).replace(/^http:/, 'HTTP:')
function ProgressUrlFormCase() {
    const check = useProgressCheck(true)
    const [loaded, setLoaded] = useState(false)
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={{
                    uri: UPPERCASE_SCHEME_URL,
                    // The slow server only sends images with it.
                    headers: { 'x-token': 'fast-image' },
                }}
                onProgress={check.onProgress}
                onLoad={() => {
                    check.onLoad()
                    setLoaded(true)
                }}
            />
            <CaseStatus
                id="progress-url-form"
                status={!loaded ? 'waiting' : (check.problem ?? 'OK')}
                description={{
                    checks: 'onProgress for a url with its scheme in capitals (HTTP://) (Android looked images up by their url as written, while downloads reported it as OkHttp writes it, lowercase, so these urls got no onProgress).',
                    steps: 'Loads a 200x200 photo from the slow server at a url starting with HTTP://. Passes at onLoad if there was at least one onProgress, each with a total above 0, loaded never going down and progress equal to loaded / total, and the last one 1.',
                    shows: 'A photo of a pug wrapped in a blanket.',
                }}
            />
        </View>
    )
}

// Two images with onProgress, at different sizes, load different urls with the
// same cacheKey (the slow server ignores the query) at the same time. Passes
// when each image got onProgress before its onLoad, never going back, the last
// 1, and none after, and the server got one request on Android, which shares
// downloads by cache key (two on iOS, where SDWebImage shares them by url).
// Android looked images up by their own url, so the image whose url wasn't
// downloaded got no progress, and it downloaded each size.
const CACHE_KEY_GROUP = `progress-cache-key-${RUN}`
const cacheKeyUrl = (token: string) =>
    slowImageUrl(
        `picsum/1025-200x200.jpg?group=${CACHE_KEY_GROUP}&token=${token}&delay=100`,
    )
function ProgressCacheKeyCase() {
    // Each image's last onProgress, and the images that loaded.
    const progress = useRef(new Map<number, number>())
    const loaded = useRef(new Set<number>())
    const [loadedCount, setLoadedCount] = useState(0)
    const [problem, setProblem] = useState<string>()
    const [requests, setRequests] = useState<number>()
    useEffect(() => {
        if (loadedCount < 2) return
        groupRequests(CACHE_KEY_GROUP)
            .then(setRequests)
            .catch((e) => setProblem(String(e)))
    }, [loadedCount])
    const fail = (message: string) =>
        setProblem((previous) => previous ?? message)
    const expected = Platform.OS === 'ios' ? 2 : 1
    return (
        <View style={styles.row}>
            {[sharedStyles.small, sharedStyles.large].map((style, i) => (
                <FastImage
                    key={i}
                    style={style}
                    source={{
                        uri: cacheKeyUrl(String(i)),
                        headers: SLOW_HEADERS,
                        cacheKey: CACHE_KEY_GROUP,
                    }}
                    onProgress={(e) => {
                        const value = e.nativeEvent.progress
                        const last = progress.current.get(i)
                        if (loaded.current.has(i)) {
                            fail(`image ${i + 1}: onProgress after onLoad`)
                        } else if (last !== undefined && value < last) {
                            fail(`image ${i + 1}: onProgress went back`)
                        }
                        progress.current.set(i, value)
                    }}
                    onLoad={() => {
                        const last = progress.current.get(i)
                        if (last === undefined) {
                            fail(`image ${i + 1}: no onProgress before onLoad`)
                        } else if (last !== 1) {
                            fail(
                                `image ${i + 1}: last onProgress ${last}, not 1`,
                            )
                        }
                        loaded.current.add(i)
                        setLoadedCount((n) => n + 1)
                    }}
                    onError={(e) => {
                        // Read the event now: the updater runs later.
                        const error = String(e.nativeEvent.error)
                        fail(`onError: ${error}`)
                    }}
                />
            ))}
            <CaseStatus
                id="progress-cache-key"
                status={
                    problem ??
                    (requests === undefined
                        ? 'waiting'
                        : requests === expected
                          ? 'OK'
                          : `requested ${requests} times, expected ${expected}`)
                }
                description={{
                    checks: "onProgress for two images of different sizes and urls with the same cacheKey, loading at the same time (Android looked images up by their own url, so the image whose url wasn't downloaded got no onProgress, and it downloaded each size).",
                    steps: 'A 32-point and a 64-point image load the same 200x200 photo from the slow server at two urls (another query) with one cacheKey. Passes once both have loaded, if each got onProgress before its onLoad, never going back, ending at 1 and none after, and the server got one request on Android (which shares downloads by cache key) or two on iOS (SDWebImage shares them by url).',
                    shows: 'Two photos of a pug wrapped in a blanket, small then larger, side by side.',
                }}
            />
        </View>
    )
}

// The slow server only sends images with it.
const SLOW_HEADERS = { 'x-token': 'fast-image' }

// An image with onProgress loads a url from the slow server, which sends the
// first of its 8 parts, then holds the rest until the case releases it: once
// onProgress came, or after 3 s. Passes when onProgress came while the rest
// was held, and the image loads. Android handed the bytes to the requests
// (and sent their progress) after the next ones arrived, so the first part's
// progress waited for the rest.
const HELD_PROGRESS_HOLD = `held-progress-${RUN}`
function ProgressHeldBytesCase() {
    const released = useRef(false)
    const [progressed, setProgressed] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [problem, setProblem] = useState<string>()
    const release = () => {
        if (released.current) return
        released.current = true
        fetch(imageUrl(`release?hold=${HELD_PROGRESS_HOLD}`)).catch((e) =>
            setProblem(String(e)),
        )
    }
    useEffect(() => {
        const timer = setTimeout(release, 3000)
        return () => clearTimeout(timer)
    }, [])
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={{
                    uri: slowImageUrl(
                        `picsum/1025-200x200.jpg?held-progress=${RUN}&hold=${HELD_PROGRESS_HOLD}&holdAfter=1&delay=100`,
                    ),
                    headers: SLOW_HEADERS,
                }}
                onProgress={() => {
                    if (released.current) return
                    setProgressed(true)
                    release()
                }}
                onLoad={() => setLoaded(true)}
                onError={(e) => {
                    // Read the event now: the updater runs later.
                    const error = String(e.nativeEvent.error)
                    setProblem((previous) => previous ?? `onError: ${error}`)
                }}
            />
            <CaseStatus
                id="progress-held-bytes"
                status={
                    problem ??
                    (!loaded
                        ? 'waiting'
                        : progressed
                          ? 'OK'
                          : 'no onProgress while the rest was held')
                }
                description={{
                    checks: "onProgress comes for the bytes that have arrived while the rest of the download is held up (Android sent the progress for bytes only once the next ones arrived, so the first part's progress waited for the rest).",
                    steps: 'Loads a 200x200 photo from the slow server, which sends the first of its 8 parts and holds the rest until the case releases it: on the first onProgress, or after 3 s. Passes once the image loads, if onProgress came before the release.',
                    shows: 'A photo of a pug wrapped in a blanket.',
                }}
            />
        </View>
    )
}

// The order the slow server got a group's requests in, among all of its
// requests (see the image server).
const groupOrder = (group: string) =>
    fetch(imageUrl(`requests?group=${group}`))
        .then((response) => response.json())
        .then((stats: { order: number[] }) => stats.order)

// Android only (iOS's downloads are SDWebImage's, which waits for its disk
// cache's queue before it queues a download, so the order there depends on
// timing). Sixteen images from the slow server download and are held halfway,
// so the next downloads wait to start (16 at a time). An image
// of another url with priority 'low' (as a preload's) waits; a view of that
// url with priority 'high' mounts and, a second later, unmounts; then a view
// of a third url (normal priority) mounts. The sixteen are released one at a
// time (so one waiting download starts at a time: several starting at once
// could reach the server in any order). Passes when the server got the normal
// view's request before the low one's.
// Android raised a waiting download's priority when a more urgent request
// joined it, and kept it once that request had gone, so the low one went
// first.
//
// queued-latest-url, with the same sixteen: an image of a url with a
// cacheKey waits; a second later, an image of another url with that cacheKey
// (at another size) mounts. Passes when, once released, the server got the
// second url's request and not the first's: a download that hasn't started
// takes the latest url for its key (e.g. a signed url with a fresh token).
// Android requested the first url.
const LOWERED_HOLD = `lowered-${RUN}`
// left-url-reverted, with the same sixteen: an image of a url with another
// cacheKey waits; a view of another url with that cacheKey mounts with the
// high-priority view, and unmounts with it. Passes when the server got the
// first url's request and not the one of the view that left: a waiting
// download goes back to the latest url of the requests left. Android kept
// the url of the request that left.
const LEFT_KEY = `left-url-${RUN}`
const LEFT_STAYS = `left-stays-${RUN}`
const LEFT_GONE = `left-gone-${RUN}`
const QUEUED_KEY = `queued-latest-${RUN}`
const QUEUED_OLD = `queued-old-${RUN}`
const QUEUED_NEW = `queued-new-${RUN}`
const LOWERED_RUNNING = `lowered-running-${RUN}`
const LOWERED_LOW = `lowered-low-${RUN}`
const LOWERED_NORMAL = `lowered-normal-${RUN}`
const loweredUrl = (group: string, extra = '') =>
    slowImageUrl(`picsum/1021-120x120.jpg?group=${group}${extra}&delay=50`)
function PriorityLoweredCase() {
    const [step, setStep] = useState<'running' | 'low' | 'high' | 'normal'>(
        'running',
    )
    const [status, setStatus] = useState('waiting')
    const [latestStatus, setLatestStatus] = useState('waiting')
    const [latestLoaded, setLatestLoaded] = useState(0)
    const [leftStatus, setLeftStatus] = useState('waiting')
    const [leftLoaded, setLeftLoaded] = useState(false)
    useEffect(() => {
        let stopped = false
        const run = async () => {
            while (!stopped && (await groupRequests(LOWERED_RUNNING)) < 16) {
                await sleep(100)
            }
            if (stopped) return
            setStep('low')
            await sleep(1000)
            if (stopped) return
            setStep('high')
            await sleep(1000)
            if (stopped) return
            setStep('normal')
            await sleep(1000)
            if (stopped) return
            for (let i = 0; i < 16 && !stopped; i++) {
                await fetch(imageUrl(`release?hold=${LOWERED_HOLD}-${i}`))
                await sleep(400)
            }
            let low: number[] = []
            let normal: number[] = []
            while (!stopped && (low.length === 0 || normal.length === 0)) {
                await sleep(100)
                ;[low, normal] = await Promise.all([
                    groupOrder(LOWERED_LOW),
                    groupOrder(LOWERED_NORMAL),
                ])
            }
            if (stopped) return
            setStatus(
                normal[0] < low[0]
                    ? 'OK'
                    : 'the low-priority image was downloaded before the normal-priority one',
            )
        }
        run().catch((e) => setStatus(String(e)))
        return () => {
            stopped = true
        }
    }, [])
    useEffect(() => {
        if (latestLoaded < 2) return
        Promise.all([groupRequests(QUEUED_OLD), groupRequests(QUEUED_NEW)])
            .then(([old, latest]) =>
                setLatestStatus(
                    old === 0 && latest === 1
                        ? 'OK'
                        : `requested the first url ${old} times and the latest ${latest}`,
                ),
            )
            .catch((e) => setLatestStatus(String(e)))
    }, [latestLoaded])
    useEffect(() => {
        if (!leftLoaded) return
        Promise.all([groupRequests(LEFT_STAYS), groupRequests(LEFT_GONE)])
            .then(([stays, gone]) =>
                setLeftStatus(
                    stays === 1 && gone === 0
                        ? 'OK'
                        : `requested the url left ${stays} times and the url of the view that left ${gone}`,
                ),
            )
            .catch((e) => setLeftStatus(String(e)))
    }, [leftLoaded])
    const leftSource = (group: string) => ({
        uri: loweredUrl(group),
        headers: SLOW_HEADERS,
        cacheKey: LEFT_KEY,
    })
    const latestSource = (group: string) => ({
        uri: loweredUrl(group),
        headers: SLOW_HEADERS,
        cacheKey: QUEUED_KEY,
    })
    const onLatestLoad = () => setLatestLoaded((n) => n + 1)
    return (
        <>
            <View style={styles.row}>
                <View style={sharedUrlStyles.images}>
                    {Array.from({ length: 16 }, (_, i) => (
                        <FastImage
                            key={i}
                            style={sharedUrlStyles.image}
                            source={{
                                uri: loweredUrl(
                                    LOWERED_RUNNING,
                                    `&n=${i}&hold=${LOWERED_HOLD}-${i}`,
                                ),
                                headers: SLOW_HEADERS,
                            }}
                        />
                    ))}
                    {step !== 'running' && (
                        <FastImage
                            style={sharedUrlStyles.image}
                            source={{
                                uri: loweredUrl(LOWERED_LOW),
                                headers: SLOW_HEADERS,
                                priority: 'low',
                            }}
                        />
                    )}
                    {step === 'high' && (
                        <View style={{ width: 12, height: 12 }}>
                            <FastImage
                                style={{ width: 12, height: 12 }}
                                source={{
                                    uri: loweredUrl(LOWERED_LOW),
                                    headers: SLOW_HEADERS,
                                    priority: 'high',
                                }}
                            />
                        </View>
                    )}
                    {step === 'normal' && (
                        <FastImage
                            style={sharedUrlStyles.image}
                            source={{
                                uri: loweredUrl(LOWERED_NORMAL),
                                headers: SLOW_HEADERS,
                            }}
                        />
                    )}
                    {step !== 'running' && (
                        <FastImage
                            style={sharedUrlStyles.image}
                            source={latestSource(QUEUED_OLD)}
                            onLoad={onLatestLoad}
                        />
                    )}
                    {(step === 'high' || step === 'normal') && (
                        <View style={{ width: 12, height: 12 }}>
                            <FastImage
                                style={{ width: 12, height: 12 }}
                                source={latestSource(QUEUED_NEW)}
                                onLoad={onLatestLoad}
                            />
                        </View>
                    )}
                    {step !== 'running' && (
                        <FastImage
                            style={sharedUrlStyles.image}
                            source={leftSource(LEFT_STAYS)}
                            onLoad={() => setLeftLoaded(true)}
                        />
                    )}
                    {step === 'high' && (
                        <View style={{ width: 12, height: 12 }}>
                            <FastImage
                                style={{ width: 12, height: 12 }}
                                source={leftSource(LEFT_GONE)}
                            />
                        </View>
                    )}
                </View>
                <CaseStatus
                    id="priority-lowered"
                    status={status}
                    description={{
                        checks: "A waiting download's priority goes back down when the more urgent request that joined it leaves (Android raised it for a priority: 'high' view and kept it after the view unmounted, so a priority: 'low' image was downloaded before a normal one).",
                        steps: "Sixteen images from the slow server start downloading and the server holds each halfway, so later downloads wait (Android runs 16 at once). Then an image with priority: 'low' waits; a view of its url with priority: 'high' mounts and, a second later, unmounts; then an image of a third url with normal priority mounts. The sixteen are released one at a time, and it passes when the server got the normal image's request before the low one's.",
                        shows: "The grid of tiny misty forest tiles: two rows (ten, then nine), then a larger tile and a small one. A blank spot in it is an image that didn't load.",
                    }}
                />
            </View>
            <View style={styles.row}>
                <View style={sharedUrlStyles.images} />
                <CaseStatus
                    id="queued-latest-url"
                    status={latestStatus}
                    description={{
                        checks: "A download that hasn't started yet takes the latest url requested for its cacheKey, as for a signed url with a fresh token (Android requested the first url).",
                        steps: "While the sixteen downloads above are held, an image of one url with a cacheKey waits; a second later, an image of another url with that cacheKey (at another size) mounts. Passes when both have loaded and the server got the second url's request and none for the first's.",
                        shows: "Blank: its two images are in the first row's grid, the last tile of its second row and the larger tile below it.",
                    }}
                />
            </View>
            <View style={styles.row}>
                <View style={sharedUrlStyles.images} />
                <CaseStatus
                    id="left-url-reverted"
                    status={leftStatus}
                    description={{
                        checks: 'When the request that switched a waiting download to its url leaves, the download goes back to the latest url of the requests left (Android kept the url of the request that had left).',
                        steps: "While the sixteen downloads above are held, an image of one url with a cacheKey waits; a view of another url with that cacheKey mounts with the priority: 'high' view and unmounts with it. Passes when the first image has loaded and the server got its url's request and none for the url of the view that left.",
                        shows: "Blank: its image is in the first row's grid, the small tile next to the larger one.",
                    }}
                />
            </View>
        </>
    )
}

// Three images share a cacheKey, at different sizes: the first url 404s (held
// until the other two have started loading), the second is fast and the third
// slow. Passes when each of the other two loads, gets onProgress 1 at most a
// second before its onLoad, the first gets onError (failedUrlEvents), and
// Android downloaded one of their urls (iOS, which shares downloads by url,
// both). Android downloaded both urls once the first had failed, and sent both
// downloads' progress to both images, so the slow one got 1 from the fast
// one's download while its own still came.
const RETRY_PROGRESS_KEY = `retry-progress-${RUN}`
const RETRY_PROGRESS_GROUP = `retry-progress-group-${RUN}`
function RetryProgressCase() {
    const [others, setOthers] = useState(false)
    const [firstDone, setFirstDone] = useState(false)
    const [loaded, setLoaded] = useState(0)
    const [problem, setProblem] = useState<string>()
    const [requests, setRequests] = useState<number>()
    // When each of the other two images first got onProgress 1.
    const done = useRef(new Map<number, number>())
    const fail = (message: string) =>
        setProblem((previous) => previous ?? message)
    useEffect(() => {
        let stopped = false
        const run = async () => {
            await groupRequested(RETRY_PROGRESS_GROUP, () => stopped)
            if (stopped) return
            setOthers(true)
            await sleep(1000)
            if (stopped) return
            await fetch(imageUrl(`release?hold=${RETRY_PROGRESS_KEY}`))
        }
        run().catch((e) => fail(String(e)))
        return () => {
            stopped = true
        }
    }, [])
    useEffect(() => {
        if (loaded < 2) return
        groupRequests(RETRY_PROGRESS_GROUP)
            .then(setRequests)
            .catch((e) => fail(String(e)))
    }, [loaded])
    const expected = Platform.OS === 'ios' ? 3 : 2
    const other = (i: number, path: string, style: object) => (
        <FastImage
            key={i}
            style={style}
            source={{
                uri: slowImageUrl(`${path}&group=${RETRY_PROGRESS_GROUP}`),
                headers: SLOW_HEADERS,
                cacheKey: RETRY_PROGRESS_KEY,
            }}
            onProgress={(e) => {
                if (e.nativeEvent.progress === 1 && !done.current.has(i)) {
                    done.current.set(i, Date.now())
                }
            }}
            onLoad={() => {
                const at = done.current.get(i)
                if (at !== undefined && Date.now() - at > 1000) {
                    fail(
                        `image ${i + 1}: onProgress 1 ${Date.now() - at} ms before its onLoad`,
                    )
                }
                setLoaded((n) => n + 1)
            }}
            onError={(e) => {
                // Read the event now: the updater runs later.
                const error = String(e.nativeEvent.error)
                fail(`image ${i + 1}: onError: ${error}`)
            }}
        />
    )
    return (
        <View style={styles.row}>
            <FastImage
                style={sharedStyles.small}
                source={{
                    uri: slowImageUrl(
                        `does-not-exist.jpg?group=${RETRY_PROGRESS_GROUP}&hold=${RETRY_PROGRESS_KEY}`,
                    ),
                    headers: SLOW_HEADERS,
                    cacheKey: RETRY_PROGRESS_KEY,
                }}
                {...failedUrlEvents(() => setFirstDone(true), fail)}
            />
            {others && [
                other(
                    1,
                    `picsum/1025-200x200.jpg?fast=${RUN}&delay=50`,
                    retryStyles.medium,
                ),
                other(
                    2,
                    `picsum/1025-200x200.jpg?slow=${RUN}&delay=500`,
                    sharedStyles.large,
                ),
            ]}
            <CaseStatus
                id="retry-progress"
                status={
                    problem ??
                    (!firstDone || requests === undefined
                        ? 'waiting'
                        : requests === expected
                          ? 'OK'
                          : `requested ${requests} times, expected ${expected}`)
                }
                description={{
                    checks: "After a cacheKey's first url fails, its other urls load from one download, and each image gets its own progress (Android downloaded both urls once the first had failed, and sent both downloads' progress to both images, so the slow one got 1 from the fast one's download while its own still came).",
                    steps: 'A small image loads a missing url from the slow server with a cacheKey (the 404 held); then a medium image of a fast url and a large image of a slow one mount with the same cacheKey, and a second later the 404 is sent. Passes when the small one has had onError, the other two have loaded, each got onProgress 1 at most a second before its onLoad, and the server got 2 requests on Android (one download for both) or 3 on iOS (which shares downloads by url).',
                    shows: 'Blank space where the 404 is (32 points), then a medium (48-point) and a large (64-point) photo of a pug in a blanket.',
                }}
            />
        </View>
    )
}

// Three images share a cacheKey, at different sizes: the first url 404s (held
// until the others have started loading), then images of two other urls
// mount, the second a moment after the first. Passes when the two load, the
// first gets onError (failedUrlEvents), and, on Android, the server got the
// latest url's request and not the other's: the retry of a failed download is
// of the latest url asked for (they're the same image). iOS shares downloads by url, so it downloads both. Android
// tried the other urls one at a time, the earliest first.
const RETRY_LATEST_KEY = `retry-latest-${RUN}`
const RETRY_LATEST_FAILS = `retry-latest-fails-${RUN}`
const RETRY_LATEST_EARLIER = `retry-latest-earlier-${RUN}`
const RETRY_LATEST_LATER = `retry-latest-later-${RUN}`
function RetryLatestUrlCase() {
    const [mounted, setMounted] = useState(0)
    const [firstDone, setFirstDone] = useState(false)
    const [loaded, setLoaded] = useState(0)
    const [problem, setProblem] = useState<string>()
    const [requests, setRequests] = useState<[number, number]>()
    const fail = (message: string) =>
        setProblem((previous) => previous ?? message)
    useEffect(() => {
        let stopped = false
        const run = async () => {
            await groupRequested(RETRY_LATEST_FAILS, () => stopped)
            if (stopped) return
            setMounted(1)
            await sleep(500)
            if (stopped) return
            setMounted(2)
            await sleep(1000)
            if (stopped) return
            await fetch(imageUrl(`release?hold=${RETRY_LATEST_FAILS}`))
        }
        run().catch((e) => fail(String(e)))
        return () => {
            stopped = true
        }
    }, [])
    useEffect(() => {
        if (loaded < 2) return
        Promise.all([
            groupRequests(RETRY_LATEST_EARLIER),
            groupRequests(RETRY_LATEST_LATER),
        ])
            .then(([earlier, later]) => setRequests([earlier, later]))
            .catch((e) => fail(String(e)))
    }, [loaded])
    const image = (i: number, group: string, style: object) => (
        <FastImage
            key={i}
            style={style}
            source={{
                uri: slowImageUrl(
                    `picsum/1025-200x200.jpg?group=${group}&delay=50`,
                ),
                headers: SLOW_HEADERS,
                cacheKey: RETRY_LATEST_KEY,
            }}
            onLoad={() => setLoaded((n) => n + 1)}
            onError={(e) => {
                // Read the event now: the updater runs later.
                const error = String(e.nativeEvent.error)
                fail(`image ${i + 1}: onError: ${error}`)
            }}
        />
    )
    const status =
        problem ??
        (requests === undefined || !firstDone
            ? 'waiting'
            : Platform.OS === 'ios' || (requests[0] === 0 && requests[1] === 1)
              ? 'OK'
              : `requested the earlier url ${requests[0]} times and the latest ${requests[1]}`)
    return (
        <View style={styles.row}>
            <FastImage
                style={sharedStyles.small}
                source={{
                    uri: slowImageUrl(
                        `does-not-exist.jpg?group=${RETRY_LATEST_FAILS}&hold=${RETRY_LATEST_FAILS}`,
                    ),
                    headers: SLOW_HEADERS,
                    cacheKey: RETRY_LATEST_KEY,
                }}
                {...failedUrlEvents(() => setFirstDone(true), fail)}
            />
            {mounted >= 1 && image(1, RETRY_LATEST_EARLIER, retryStyles.medium)}
            {mounted >= 2 && image(2, RETRY_LATEST_LATER, sharedStyles.large)}
            <CaseStatus
                id="retry-latest-url"
                status={status}
                description={{
                    checks: "After a cacheKey's url fails, the retry downloads the latest of its other urls, since they're the same image (Android tried the other urls one at a time, the earliest first).",
                    steps: "A small image loads a missing url from the slow server with a cacheKey (the 404 held); then a medium image of another url mounts with that cacheKey, and half a second later a large image of a third url. A second later the 404 is sent. Passes when the small one has had onError, the other two have loaded, and, on Android, the server got the latest url's request and none for the earlier one's (iOS shares downloads by url, so it downloads both).",
                    shows: 'Blank space where the 404 is (32 points), then a medium (48-point) and a large (64-point) photo of a pug in a blanket.',
                }}
            />
        </View>
    )
}

// Three images share a cacheKey, at different sizes: the first url 404s, and
// so does the second, which the first's retry downloads (both held until the
// next image has started loading); the third, a newer url that works, mounts
// while that retry is held. Passes when the third loads, and the first two get
// onError (their urls failed). Android retried a failed download once, so the
// newer url that joined the retry was never requested.
const RETRY_NEWER_KEY = `retry-newer-${RUN}`
const RETRY_NEWER_FIRST = `retry-newer-first-${RUN}`
const RETRY_NEWER_SECOND = `retry-newer-second-${RUN}`
function RetryNewerUrlCase() {
    const [mounted, setMounted] = useState(0)
    const [errors, setErrors] = useState(0)
    const [loaded, setLoaded] = useState(false)
    const [problem, setProblem] = useState<string>()
    const fail = (message: string) =>
        setProblem((previous) => previous ?? message)
    useEffect(() => {
        let stopped = false
        const run = async () => {
            await groupRequested(RETRY_NEWER_FIRST, () => stopped)
            if (stopped) return
            setMounted(1)
            await sleep(500)
            if (stopped) return
            await fetch(imageUrl(`release?hold=${RETRY_NEWER_FIRST}`))
            await groupRequested(RETRY_NEWER_SECOND, () => stopped)
            if (stopped) return
            setMounted(2)
            await sleep(1000)
            if (stopped) return
            await fetch(imageUrl(`release?hold=${RETRY_NEWER_SECOND}`))
        }
        run().catch((e) => fail(String(e)))
        return () => {
            stopped = true
        }
    }, [])
    const failing = (i: number, group: string, style: object) => (
        <FastImage
            key={i}
            style={style}
            source={{
                uri: slowImageUrl(
                    `does-not-exist.jpg?group=${group}&hold=${group}`,
                ),
                headers: SLOW_HEADERS,
                cacheKey: RETRY_NEWER_KEY,
            }}
            {...failedUrlEvents(() => setErrors((n) => n + 1), fail)}
        />
    )
    return (
        <View style={styles.row}>
            {failing(0, RETRY_NEWER_FIRST, sharedStyles.small)}
            {mounted >= 1 && failing(1, RETRY_NEWER_SECOND, retryStyles.medium)}
            {mounted >= 2 && (
                // Masked: it's drawn from one of two decodes, depending on how
                // the downloads raced (the case checks requests and events).
                <Masked>
                    <FastImage
                        style={sharedStyles.large}
                        source={{
                            uri: slowImageUrl(
                                `picsum/1025-200x200.jpg?retry-newer=${RUN}&delay=50`,
                            ),
                            headers: SLOW_HEADERS,
                            cacheKey: RETRY_NEWER_KEY,
                        }}
                        onLoad={() => setLoaded(true)}
                        onError={(e) => {
                            // Read the event now: the updater runs later.
                            const error = String(e.nativeEvent.error)
                            fail(`image 3: onError: ${error}`)
                        }}
                    />
                </Masked>
            )}
            <CaseStatus
                id="retry-newer-url"
                status={problem ?? (loaded && errors === 2 ? 'OK' : 'waiting')}
                description={{
                    checks: "A newer url that joins a cacheKey's retry is downloaded when the retry fails too (Android retried a failed download once, so the newer url was never requested).",
                    steps: "A small image loads a missing url from the slow server with a cacheKey (the 404 held); a medium image of a second missing url mounts with that cacheKey, and the first 404 is sent, so the retry downloads the second url (also held). While it's held, a large image of a url that works mounts with the cacheKey, then the second 404 is sent. Passes when the first two have had onError and the large one has loaded.",
                    shows: "Blank space twice (32 and 48 points, the two urls that 404), then a large (64-point) photo of a pug in a blanket, which isn't compared: it can come from either of two decodes.",
                }}
            />
        </View>
    )
}

const retryStyles = StyleSheet.create({
    medium: { width: 48, height: 48 },
})

// Twenty images from the slow server, each its own url, load with normal
// priority, and the server holds their responses; once it has their first
// request, one more loads with priority 'high', and half a second later the
// server sends the responses. Passes when at most 12 of the others were
// requested before it: those sent first (Android sends 5 to a host at once,
// as OkHttp does; iOS runs 6 downloads at once), and those started with it
// once responses arrived, which can reach the server first (7 to 9 before it
// in all, measured on both platforms). The others wait to start, most urgent
// first. Android handed 16 to OkHttp at once, which sends them in the order
// they came, so the high one was 17th.
const PRIORITY_NORMAL = `priority-normal-${RUN}`
const PRIORITY_HIGH = `priority-high-${RUN}`
const PRIORITY_COUNT = 20
const PRIORITY_BEFORE = 12
function DownloadPriorityCase() {
    const [high, setHigh] = useState(false)
    const [loaded, setLoaded] = useState(0)
    const [status, setStatus] = useState('waiting')
    useEffect(() => {
        let stopped = false
        const release = () => fetch(imageUrl(`release?hold=${PRIORITY_NORMAL}`))
        groupRequested(PRIORITY_NORMAL, () => stopped)
            .then(async () => {
                if (stopped) return
                setHigh(true)
                await sleep(500)
                await release()
            })
            .catch((e) => setStatus(String(e)))
        return () => {
            stopped = true
            release().catch(() => {})
        }
    }, [])
    useEffect(() => {
        if (loaded < PRIORITY_COUNT + 1) return
        Promise.all([groupOrder(PRIORITY_NORMAL), groupOrder(PRIORITY_HIGH)])
            .then(([normal, urgent]) => {
                const before = normal.filter((n) => n < urgent[0]).length
                setStatus(
                    before <= PRIORITY_BEFORE
                        ? 'OK'
                        : `the high-priority image was requested after ${before} of the others`,
                )
            })
            .catch((e) => setStatus(String(e)))
    }, [loaded])
    const onLoad = () => setLoaded((n) => n + 1)
    const onError = (e: OnErrorEvent) => {
        // Read the event now: the updater runs later.
        const error = String(e.nativeEvent.error)
        setStatus(`onError: ${error}`)
    }
    return (
        <View style={styles.row}>
            <View style={sharedUrlStyles.images}>
                {Array.from({ length: PRIORITY_COUNT }, (_, i) => (
                    <FastImage
                        key={i}
                        style={sharedUrlStyles.image}
                        source={{
                            uri: slowImageUrl(
                                `picsum/1020-120x120.jpg?group=${PRIORITY_NORMAL}&n=${i}&hold=${PRIORITY_NORMAL}&holdAfter=0&delay=50`,
                            ),
                            headers: SLOW_HEADERS,
                        }}
                        onLoad={onLoad}
                        onError={onError}
                    />
                ))}
                {high && (
                    <FastImage
                        style={sharedUrlStyles.image}
                        source={{
                            uri: slowImageUrl(
                                `picsum/1020-120x120.jpg?group=${PRIORITY_HIGH}&delay=50`,
                            ),
                            headers: SLOW_HEADERS,
                            priority: 'high',
                        }}
                        onLoad={onLoad}
                        onError={onError}
                    />
                )}
            </View>
            <CaseStatus
                id="download-priority"
                status={status}
                description={{
                    checks: "A priority: 'high' image that starts loading after twenty others is downloaded before most of them (Android handed 16 downloads to OkHttp at once, which sends them in the order they came, so the high one was 17th).",
                    steps: "Twenty images from the slow server, each its own url, load with normal priority, and the server holds their responses. Once it has their first request, one more image loads with priority: 'high', and half a second later the server sends the responses. Passes when all have loaded and at most 12 of the twenty were requested before the high one (those the platform sends at once, 5 or 6, and some started with it).",
                    shows: 'Twenty-one tiny tiles of the same photo (a bear on rocks, under a pale sky): two rows of ten, then one. A blank spot is an image that failed.',
                }}
            />
        </View>
    )
}

// The slow server's requests in a group (see the image server).
const groupRequests = (group: string) =>
    fetch(imageUrl(`requests?group=${group}`))
        .then((response) => response.json())
        .then((stats: { count: number }) => stats.count)

// Two images of one url from the slow server, at different sizes, load at the
// same time. Passes when the server got one request for it, and both images got
// onProgress before their onLoad, the last 1. Glide only shares a download
// between requests for the same size, so Android downloaded it twice.
const SHARED_SIZES_GROUP = `shared-sizes-${RUN}`
function SharedDownloadSizesCase() {
    // Each image's last onProgress.
    const progress = useRef(new Map<number, number>())
    const [loaded, setLoaded] = useState(0)
    const [problem, setProblem] = useState<string>()
    const [requests, setRequests] = useState<number>()
    useEffect(() => {
        if (loaded < 2) return
        groupRequests(SHARED_SIZES_GROUP)
            .then(setRequests)
            .catch((e) => setProblem(String(e)))
    }, [loaded])
    const source = {
        uri: slowImageUrl(
            `picsum/1025-200x200.jpg?group=${SHARED_SIZES_GROUP}&delay=100`,
        ),
        headers: SLOW_HEADERS,
    }
    return (
        <View style={styles.row}>
            {[sharedStyles.small, sharedStyles.large].map((style, i) => (
                <FastImage
                    key={i}
                    style={style}
                    source={source}
                    onProgress={(e) =>
                        progress.current.set(i, e.nativeEvent.progress)
                    }
                    onLoad={() => {
                        const last = progress.current.get(i)
                        if (last !== 1) {
                            const problem =
                                last === undefined
                                    ? `no onProgress for image ${i + 1}`
                                    : `image ${i + 1}: last onProgress ${last}, not 1`
                            setProblem((previous) => previous ?? problem)
                        }
                        setLoaded((n) => n + 1)
                    }}
                    onError={(e) => {
                        // Read the event now: the updater runs later.
                        const error = String(e.nativeEvent.error)
                        setProblem(
                            (previous) => previous ?? `onError: ${error}`,
                        )
                    }}
                />
            ))}
            <CaseStatus
                id="shared-download-sizes"
                status={
                    problem ??
                    (requests === undefined
                        ? 'waiting'
                        : requests === 1
                          ? 'OK'
                          : `requested ${requests} times`)
                }
                description={{
                    checks: 'Two images of one url at different sizes, loading at the same time, share one download, and each gets onProgress up to 1 (Glide only shares a download between requests for the same size, so Android downloaded it twice).',
                    steps: 'Loads the photo from the slow server in a 32-point and a 64-point image at once. Passes when both have loaded, the last onProgress each got before its onLoad was 1, and the server got one request.',
                    shows: 'A small (32-point) and a large (64-point) photo of a pug in a blanket, side by side.',
                }}
            />
        </View>
    )
}

// Two images of one url at different sizes share its download, which the slow
// server holds halfway; once both have some of it, the first unmounts, and the
// server sends the rest. Passes when the second loads, from one request.
const SHARED_CANCEL_GROUP = `shared-cancel-${RUN}`
function SharedDownloadCancelCase() {
    const progressed = useRef(new Set<number>())
    const [firstMounted, setFirstMounted] = useState(true)
    const [loaded, setLoaded] = useState(false)
    const [problem, setProblem] = useState<string>()
    const [requests, setRequests] = useState<number>()
    useEffect(() => {
        if (firstMounted) return
        fetch(imageUrl(`release?hold=${SHARED_CANCEL_GROUP}`)).catch((e) =>
            setProblem(String(e)),
        )
    }, [firstMounted])
    useEffect(() => {
        if (!loaded) return
        groupRequests(SHARED_CANCEL_GROUP)
            .then(setRequests)
            .catch((e) => setProblem(String(e)))
    }, [loaded])
    const source = {
        uri: slowImageUrl(
            `picsum/1025-200x200.jpg?group=${SHARED_CANCEL_GROUP}&hold=${SHARED_CANCEL_GROUP}&delay=100`,
        ),
        headers: SLOW_HEADERS,
    }
    const onProgress = (image: number) => () => {
        progressed.current.add(image)
        if (progressed.current.size === 2) setFirstMounted(false)
    }
    const onError = (e: OnErrorEvent) => {
        // Read the event now: the updater runs later.
        const error = String(e.nativeEvent.error)
        setProblem((previous) => previous ?? `onError: ${error}`)
    }
    return (
        <View style={styles.row}>
            <View style={sharedStyles.small}>
                {firstMounted && (
                    <FastImage
                        style={sharedStyles.small}
                        source={source}
                        onProgress={onProgress(0)}
                        onError={onError}
                    />
                )}
            </View>
            <FastImage
                style={sharedStyles.large}
                source={source}
                onProgress={onProgress(1)}
                onLoad={() => setLoaded(true)}
                onError={onError}
            />
            <CaseStatus
                id="shared-download-cancel"
                status={
                    problem ??
                    (requests === undefined
                        ? 'waiting'
                        : requests === 1
                          ? 'OK'
                          : `requested ${requests} times`)
                }
                description={{
                    checks: 'A download shared by two images goes on for one of them when the other unmounts.',
                    steps: 'Loads one url from the slow server in a small and a large image; the server holds it halfway. Once both have had onProgress, the small one unmounts and the server sends the rest. Passes when the large one has loaded and the server got one request.',
                    shows: 'Blank space where the small image was, then the large (64-point) photo of a pug in a blanket.',
                }}
            />
        </View>
    )
}

// Two images of one url that 404s, at different sizes, load at the same
// time. Passes when both get onError with the status.
const SHARED_ERROR_URL = slowImageUrl(
    `does-not-exist.jpg?shared-error=${RUN}&delay=100`,
)
function SharedDownloadErrorCase() {
    const [errors, setErrors] = useState<string[]>([])
    const [loaded, setLoaded] = useState(false)
    const source = { uri: SHARED_ERROR_URL, headers: SLOW_HEADERS }
    const missing = errors.find((error) => !error.includes('404'))
    return (
        <View style={styles.row}>
            {[sharedStyles.small, sharedStyles.large].map((style, i) => (
                <FastImage
                    key={i}
                    style={style}
                    source={source}
                    onLoad={() => setLoaded(true)}
                    onError={(e) => {
                        // Read the event now: the updater runs later.
                        const error = String(e.nativeEvent.error)
                        setErrors((previous) => [...previous, error])
                    }}
                />
            ))}
            <CaseStatus
                id="shared-download-error"
                status={
                    loaded
                        ? 'onLoad for a url that 404s'
                        : missing !== undefined
                          ? `onError without the status: ${missing}`
                          : errors.length < 2
                            ? 'waiting'
                            : 'OK'
                }
                description={{
                    checks: 'Two images of one url that 404s, at different sizes and loading at the same time, both get onError with the status in their error.',
                    steps: 'Loads a missing image from the slow server in a small and a large image at once. Passes when both have had onError and both errors mention 404 (onLoad fails it).',
                    shows: 'Blank space: the two images (32 and 64 points) have no background and nothing loads.',
                }}
            />
        </View>
    )
}

const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(() => resolve(), ms))

// Waits until the slow server got a request in the group.
const groupRequested = async (group: string, stopped: () => boolean) => {
    while (!stopped() && (await groupRequests(group)) < 1) await sleep(100)
}

// The image of a cacheKey's url that 404s, while images of other urls with
// that cacheKey load: it gets onError (its own url failed), on both
// platforms. `done` once it did.
const failedUrlEvents = (
    done: () => void,
    fail: (message: string) => void,
) => ({
    onLoad: () => fail('onLoad for a url that 404s'),
    onError: done,
})

// Two images with the same cacheKey and different urls, at different sizes:
// the first url 404s, which the slow server holds until the second image has
// started loading, and the second loads. Passes when the second loads, and
// the first gets onError (failedUrlEvents). Android shares
// downloads by cacheKey, so the second image's request joins the first's
// download, and is retried with its own url once that one fails.
const RETRY_GROUP = `shared-retry-${RUN}`
function SharedDownloadRetryCase() {
    const [second, setSecond] = useState(false)
    const [firstDone, setFirstDone] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [problem, setProblem] = useState<string>()
    useEffect(() => {
        let stopped = false
        const run = async () => {
            await groupRequested(RETRY_GROUP, () => stopped)
            if (stopped) return
            setSecond(true)
            await sleep(1000)
            if (stopped) return
            await fetch(imageUrl(`release?hold=${RETRY_GROUP}`))
        }
        run().catch((e) => setProblem(String(e)))
        return () => {
            stopped = true
        }
    }, [])
    const fail = (message: string) =>
        setProblem((previous) => previous ?? message)
    return (
        <View style={styles.row}>
            <FastImage
                style={sharedStyles.small}
                source={{
                    uri: slowImageUrl(
                        `does-not-exist.jpg?group=${RETRY_GROUP}&hold=${RETRY_GROUP}`,
                    ),
                    headers: SLOW_HEADERS,
                    cacheKey: RETRY_GROUP,
                }}
                {...failedUrlEvents(() => setFirstDone(true), fail)}
            />
            <View style={sharedStyles.large}>
                {second && (
                    <FastImage
                        style={sharedStyles.large}
                        source={{
                            uri: slowImageUrl(
                                `picsum/1025-200x200.jpg?retry=${RUN}&delay=100`,
                            ),
                            headers: SLOW_HEADERS,
                            cacheKey: RETRY_GROUP,
                        }}
                        onLoad={() => setLoaded(true)}
                        onError={(e) => {
                            // Read the event now: the updater runs later.
                            const error = String(e.nativeEvent.error)
                            fail(`image 2: onError: ${error}`)
                        }}
                    />
                )}
            </View>
            <CaseStatus
                id="shared-download-retry"
                status={problem ?? (firstDone && loaded ? 'OK' : 'waiting')}
                description={{
                    checks: "An image whose url works loads when another url with the same cacheKey 404s, and the image of that url gets onError (on Android, which shares downloads by cacheKey, the second image's request joins the first's download and is retried with its own url once that fails).",
                    steps: 'A small image loads a missing url from the slow server with a cacheKey; once the server has the request it holds the 404, a large image of the photo with the same cacheKey mounts, and a second later the 404 is sent. Passes when the small one has had onError and the large one has loaded.',
                    shows: 'Blank space where the 404 is (32 points), then a large (64-point) photo of a pug in a blanket.',
                }}
            />
        </View>
    )
}

// An image whose response has no Content-Length unmounts while it downloads
// (the slow server holds the rest), then another image of the url loads.
// Passes when it loads. Cancelling a request happens on the main thread, where
// closing OkHttp's response would read the socket, which throws
// NetworkOnMainThreadException: Android cancels the call instead (the
// response is read into a temporary file, as its length is unknown).
const CHUNKED_CANCEL_GROUP = `chunked-cancel-${RUN}`
function ChunkedDownloadCancelCase() {
    const [shown, setShown] = useState<'first' | 'none' | 'second'>('first')
    const [loaded, setLoaded] = useState(false)
    const [problem, setProblem] = useState<string>()
    useEffect(() => {
        let stopped = false
        const run = async () => {
            await groupRequested(CHUNKED_CANCEL_GROUP, () => stopped)
            // The first half arrives (100 ms apart), then the server holds.
            await sleep(600)
            if (stopped) return
            setShown('none')
            await sleep(500)
            if (stopped) return
            await fetch(imageUrl(`release?hold=${CHUNKED_CANCEL_GROUP}`))
            setShown('second')
        }
        run().catch((e) => setProblem(String(e)))
        return () => {
            stopped = true
        }
    }, [])
    const source = {
        uri: slowImageUrl(
            `picsum/1025-200x200.jpg?group=${CHUNKED_CANCEL_GROUP}&hold=${CHUNKED_CANCEL_GROUP}&chunked&delay=100`,
        ),
        headers: SLOW_HEADERS,
    }
    const onError = (e: OnErrorEvent) => {
        // Read the event now: the updater runs later.
        const error = String(e.nativeEvent.error)
        setProblem((previous) => previous ?? `onError: ${error}`)
    }
    return (
        <View style={styles.row}>
            <View style={sharedStyles.small}>
                {shown === 'first' && (
                    <FastImage
                        style={sharedStyles.small}
                        source={source}
                        onError={onError}
                    />
                )}
            </View>
            <View style={sharedStyles.large}>
                {shown === 'second' && (
                    <FastImage
                        style={sharedStyles.large}
                        source={source}
                        onLoad={() => setLoaded(true)}
                        onError={onError}
                    />
                )}
            </View>
            <CaseStatus
                id="chunked-download-cancel"
                status={problem ?? (loaded ? 'OK' : 'waiting')}
                description={{
                    checks: 'An image unmounts while it downloads a response without a Content-Length, and a later image of that url still loads (on Android, closing the response on the main thread would read the socket and throw NetworkOnMainThreadException, so the call is cancelled instead).',
                    steps: 'Loads the photo from the slow server, sent without a Content-Length, in a small image; the server holds it halfway. The image unmounts, half a second later the server is released, and a large image of the same url mounts. Passes when the large one loads, with no onError.',
                    shows: 'Blank space where the small image was, then the large (64-point) photo of a pug in a blanket.',
                }}
            />
        </View>
    )
}

// Two images of one url from the slow server, at different sizes, load at the
// same time; its response has no Content-Length. Passes when both load, from
// one request. Android didn't share a response of unknown length: the second
// image downloaded it again once the first's response had arrived.
const SHARED_CHUNKED_GROUP = `shared-chunked-${RUN}`
function SharedDownloadChunkedCase() {
    const [loaded, setLoaded] = useState(0)
    const [problem, setProblem] = useState<string>()
    const [requests, setRequests] = useState<number>()
    useEffect(() => {
        if (loaded < 2) return
        groupRequests(SHARED_CHUNKED_GROUP)
            .then(setRequests)
            .catch((e) => setProblem(String(e)))
    }, [loaded])
    const source = {
        uri: slowImageUrl(
            `picsum/1025-200x200.jpg?group=${SHARED_CHUNKED_GROUP}&chunked&delay=100`,
        ),
        headers: SLOW_HEADERS,
    }
    return (
        <View style={styles.row}>
            {[sharedStyles.small, sharedStyles.large].map((style, i) => (
                <FastImage
                    key={i}
                    style={style}
                    source={source}
                    onLoad={() => setLoaded((n) => n + 1)}
                    onError={(e) => {
                        // Read the event now: the updater runs later.
                        const error = String(e.nativeEvent.error)
                        setProblem(
                            (previous) => previous ?? `onError: ${error}`,
                        )
                    }}
                />
            ))}
            <CaseStatus
                id="shared-download-chunked"
                status={
                    problem ??
                    (requests === undefined
                        ? 'waiting'
                        : requests === 1
                          ? 'OK'
                          : `requested ${requests} times`)
                }
                description={{
                    checks: "Two images of one url at different sizes share one download when its response has no Content-Length (Android didn't share a response of unknown length: the second image downloaded it again once the first's had arrived).",
                    steps: 'Loads the photo from the slow server, sent without a Content-Length, in a 32-point and a 64-point image at once. Passes when both have loaded and the server got one request.',
                    shows: 'A small (32-point) and a large (64-point) photo of a pug in a blanket, side by side.',
                }}
            />
        </View>
    )
}

// An image whose download stalls: the slow server sends half of it, then
// holds the rest until the image gets onError. Passes when it does. Android's
// client had no timeouts, so the image (and every request sharing its
// download) waited forever; a download that gets nothing for 15 s fails, as on
// iOS. The hold is released then: nothing waits on it any more.
const STALLED_HOLD = `stalled-${RUN}`
const STALLED_URL = slowImageUrl(
    `picsum/1025-200x200.jpg?stalled=${RUN}&hold=${STALLED_HOLD}&delay=100`,
)
function StalledDownloadCase() {
    const [status, setStatus] = useState('waiting')
    return (
        <View style={styles.row}>
            <FastImage
                style={sharedStyles.large}
                source={{ uri: STALLED_URL, headers: SLOW_HEADERS }}
                onLoad={() => setStatus('onLoad for a download that stalled')}
                onError={() => {
                    setStatus('OK')
                    fetch(imageUrl(`release?hold=${STALLED_HOLD}`)).catch(
                        () => {},
                    )
                }}
            />
            <CaseStatus
                id="stalled-download"
                status={status}
                description={{
                    checks: "A download that gets nothing for 15 seconds fails with onError (Android's client had no timeouts, so the image, and every request sharing its download, waited forever).",
                    steps: 'Loads the photo from the slow server, which sends half of it and then holds the rest. Passes on onError, about 15 seconds later (onLoad fails it); the server is then released.',
                    shows: 'Blank space (64 points, no background): the image never loads.',
                }}
            />
        </View>
    )
}

const sharedStyles = StyleSheet.create({
    small: { width: 32, height: 32 },
    large: { width: 64, height: 64 },
})

// A data: image with onProgress: iOS sends one event for it, which needs
// progress too (loaded / total, which JS doesn't add); Android sends none.
function ProgressDataUriCase() {
    const check = useProgressCheck()
    const [loaded, setLoaded] = useState(false)
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={{ uri: YELLOW_DATA_URI }}
                onProgress={check.onProgress}
                onLoad={() => {
                    check.onLoad()
                    setLoaded(true)
                }}
            />
            <CaseStatus
                id="progress-data-uri"
                status={!loaded ? 'waiting' : (check.problem ?? 'OK')}
                description={{
                    checks: 'onProgress for a data: image: iOS sends one event, which has a progress (loaded / total, 1); Android sends none.',
                    steps: 'Loads an 8x8 yellow PNG from a data: uri. Passes at onLoad if each onProgress (if any) had a total above 0, loaded up to the total and progress equal to loaded / total, and the last one 1.',
                    shows: 'A yellow square.',
                }}
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
                description={{
                    checks: "Image requests send the app's cookies, and keep the ones they get (Android sent no cookies with images: React Native's shared OkHttp client has an empty cookie jar).",
                    steps: "Gets two cookies with fetch (this run's values), then loads the React logo from the image server's cookie/ path, which answers 403 without both and sets a cookie of its own. On onLoad, asks the server which cookies a fetch sends: passes if the image's cookie is among them.",
                    shows: 'The React logo (light blue) on the gray square. An empty gray square means the image was refused (no cookies sent).',
                }}
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
                              // A byte a second while held: the flow can take
                              // more than 15 s to send the app away, and a
                              // download that gets nothing for that long fails.
                              uri: slowImageUrl(`${path}&hold=${hold}&trickle`),
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
                        ? {
                              checks: "An image still loading when the app goes to the background finishes once it's back, with its header, its progress and its tint (#758: images stopped loading after the app came back).",
                              steps: 'maestro/background.yaml taps the box to start, presses Home while this image loads, and brings the app back 20 s later. The image comes from the slow server (which needs the header x-token: fast-image) with tintColor green: it sends half, then a byte a second until the app is back and releases the rest. Passes 2 s after the return if onLoadStart and onLoad fired once, onError never, and onProgress after the return reached the total.',
                              shows: 'A solid green square: the photo, tinted. An empty gray square means it never finished.',
                          }
                        : {
                              checks: "A loaded image doesn't load again when the app comes back from the background (#1022: Android loaded it again).",
                              steps: 'maestro/background.yaml taps the box to start, which loads a photo; once it has loaded, the flow presses Home and brings the app back 20 s later. Passes 2 s after the return if onLoadStart and onLoad fired once and onError never.',
                              shows: 'A photo of green northern lights over a tree.',
                          }
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

// clearMemoryCache and clearDiskCache called from JS with no Activity
// (Android): maestro/background-no-activity.yaml opens the example's
// finish-on-leave link (leaving the app then finishes its Activity, see
// MainActivity), starts this case, and sends the app to the background. A
// download that ends while it's away calls them, from the XMLHttpRequest's
// callback (timers don't run in the background), and the check is kept
// outside the component, which the new Activity mounts again. Passes when
// both resolve ok and the disk cache is smaller after clearing. Android did
// nothing without an Activity.
type ClearCheck = { before: number; after?: number; error?: string }
let clearCheck: ClearCheck | undefined
const clearCheckListeners = new Set<() => void>()
function setClearCheck(check: ClearCheck) {
    clearCheck = check
    clearCheckListeners.forEach((listener) => listener())
}
function startClearCheck() {
    FastImage.preload([
        { uri: imageUrl(`picsum/1018-600x300.jpg?clear=${RUN}`) },
    ])
        .then(() => FastImage.configureCache({}))
        .then(({ diskSize }) => {
            setClearCheck({ before: diskSize ?? 0 })
            const subscription = AppState.addEventListener(
                'change',
                (state) => {
                    if (state !== 'background') return
                    subscription.remove()
                    const request = new XMLHttpRequest()
                    request.open(
                        'GET',
                        slowImageUrl(
                            `picsum/1020-120x120.jpg?delay=300&clear=${RUN}`,
                        ),
                    )
                    request.setRequestHeader('x-token', 'fast-image')
                    request.onloadend = () => {
                        const check = clearCheck as ClearCheck
                        let failed: string | undefined
                        const note =
                            (name: string) => (result: ClearCacheResult) => {
                                if (!result.ok) {
                                    failed = `${name}: ${result.error}`
                                }
                            }
                        FastImage.clearMemoryCache()
                            .then(note('clearMemoryCache'))
                            .then(() => FastImage.clearDiskCache())
                            .then(note('clearDiskCache'))
                            .then(() => FastImage.configureCache({}))
                            .then((state) =>
                                setClearCheck({
                                    ...check,
                                    after: state.diskSize ?? 0,
                                    error: failed,
                                }),
                            )
                            .catch((error) =>
                                setClearCheck({
                                    ...check,
                                    error: String(error),
                                }),
                            )
                    }
                    request.send()
                },
            )
        })
}

function ClearWithoutActivityCase() {
    const [, rerender] = useState(0)
    const started = useRef(false)
    useEffect(() => {
        const listener = () => rerender((n) => n + 1)
        clearCheckListeners.add(listener)
        return () => {
            clearCheckListeners.delete(listener)
        }
    }, [])
    const check = clearCheck
    const status = !check
        ? 'tap the box'
        : check.error
          ? check.error
          : check.after === undefined
            ? `send the app to the background (disk cache ${check.before} bytes)`
            : check.after < check.before
              ? 'OK'
              : `disk cache ${check.before} -> ${check.after} bytes`
    return (
        <View style={styles.row}>
            <Pressable
                testID="regression-clear-no-activity-start"
                style={styles.image}
                onPress={() => {
                    if (started.current || clearCheck) return
                    started.current = true
                    startClearCheck()
                }}
            />
            <View style={styles.fill}>
                <CaseStatus
                    id="clear-without-activity"
                    status={status}
                    description={{
                        checks: 'FastImage.clearMemoryCache and FastImage.clearDiskCache called from JS while the app has no Activity (Android) resolve ok and clear the disk cache (Android did nothing without an Activity).',
                        steps: "maestro/background-no-activity.yaml opens the app's finish-on-leave link (leaving the app then finishes its Activity), taps the box, which preloads a photo and reads the disk cache's size, and presses Home. A download from the slow server that ends while the app is away (in about 2 s) calls both clear functions; the flow brings the app back 10 s later. Passes when both resolved ok and the disk cache is smaller than before; on iOS the link does nothing, and they're called once the app is back.",
                        shows: 'An empty gray square: the box the flow taps; the case shows no image.',
                    }}
                />
                {/* What maestro/background-no-activity.yaml waits for (the
                status line only shows OK or …). */}
                {check ? (
                    <Text style={styles.liveStatus}>Now: {status}.</Text>
                ) : null}
            </View>
        </View>
    )
}

// objectFit, as CSS's object-fit: a 600x300 image (red, with a blue border)
// in a square view. fill: stretched, the border all around; contain: the whole
// image, half the view's height; cover: the middle, the border only at the top
// and bottom; none: the middle at its own size, red only; scale-down: as
// contain, since it's larger than the view. Check the screenshot.
function ObjectFitCase() {
    const [status, onLoad] = useLoadedThenOk(5)
    const fits = ['fill', 'contain', 'cover', 'none', 'scale-down'] as const
    return (
        <View style={objectFitStyles.stacked}>
            <View style={objectFitStyles.images}>
                {fits.map((fit, i) => (
                    <FastImage
                        key={fit}
                        style={[objectFitStyles.image, i > 0 && styles.gap]}
                        objectFit={fit}
                        source={{ uri: imageUrl('center-large.png') }}
                        onLoad={onLoad}
                    />
                ))}
            </View>
            <CaseStatus
                id="object-fit"
                status={status}
                description={{
                    checks: "objectFit's five values place a larger image in its view as CSS's object-fit does.",
                    steps: 'Loads the 600x300 image into five 48-point views with objectFit fill, contain, cover, none and scale-down. Passes once all five have loaded (and a moment more); the screenshot checks the fits.',
                    shows: 'Five 48-point views of the 600x300 image (red with a blue border): fill stretched to the square, the border all around; contain whole, half the height, with gray above and below; cover showing the middle, the border only at the top and bottom; none showing the middle at its own size, red only; scale-down the same as contain, since the image is larger than the view.',
                }}
            />
        </View>
    )
}

// objectFit none and scale-down show a smaller image at its own size in
// points: a 40x40 image (green) and a bundled 120x120 @3x one (blue) are 40
// points, inside the outlines. A larger image with none is cropped to the view
// also with overflow visible.
function ObjectFitSizeCase() {
    const [status, onLoad] = useLoadedThenOk(4)
    return (
        <View style={objectFitStyles.stacked}>
            <View style={objectFitStyles.images}>
                <View>
                    <FastImage
                        style={objectFitStyles.image}
                        objectFit="none"
                        source={{ uri: imageUrl('center-medium.png') }}
                        onLoad={onLoad}
                    />
                    <View style={centerStyles.outline} pointerEvents="none" />
                </View>
                <View style={styles.gap}>
                    <FastImage
                        style={objectFitStyles.image}
                        objectFit="scale-down"
                        source={{ uri: imageUrl('center-medium.png') }}
                        onLoad={onLoad}
                    />
                    <View style={centerStyles.outline} pointerEvents="none" />
                </View>
                <View style={styles.gap}>
                    <FastImage
                        style={objectFitStyles.image}
                        objectFit="none"
                        source={require('./images/center-dot.png')}
                        onLoad={onLoad}
                    />
                    <View style={centerStyles.outline} pointerEvents="none" />
                </View>
                <FastImage
                    style={[
                        objectFitStyles.image,
                        styles.gap,
                        objectFitStyles.visible,
                    ]}
                    objectFit="none"
                    source={{ uri: imageUrl('center-large.png') }}
                    onLoad={onLoad}
                />
            </View>
            <CaseStatus
                id="object-fit-size"
                status={status}
                description={{
                    checks: 'objectFit none and scale-down show an image smaller than the view at its own size in points (dp), and none crops a larger image to the view even with overflow visible.',
                    steps: "Loads a 40x40 green image with none, the same with scale-down, a bundled 120x120 @3x blue image with none (40 points), and the 600x300 image (red with a blue border) with none and overflow: 'visible'. Passes once all four have loaded; the screenshot checks the sizes.",
                    shows: 'Four 48-point views: a green square, another green square, then a blue square, each 40 points and just inside its magenta outline; then a red square (the large image cropped to the view). A square bigger or smaller than its outline (drawn at its size in pixels) or red spilling out of the last view is a failure.',
                }}
            />
        </View>
    )
}

// An SVG with downsample={false} in a view larger than its own size, once a
// smaller view of it has loaded: drawn for the larger view, sharp. A full-size
// load draws an SVG at its own size, or for the view if that's larger, and the
// second view gets the first one's drawing from the memory cache, so it's
// drawn again for it.
function SvgFullSizeLargerCase() {
    const [first, setFirst] = useState(false)
    const [status, onLoad] = useLoadedThenOk(1)
    const source = {
        uri: imageUrl(`svg-rings.svg?svg-full-size-larger=${RUN}`),
    }
    return (
        <View style={styles.row}>
            <FastImage
                style={{ width: 40, height: 40 }}
                source={source}
                downsample={false}
                onLoad={() => setFirst(true)}
            />
            {first && (
                <FastImage
                    style={[{ width: 160, height: 160 }, styles.gap]}
                    source={source}
                    downsample={false}
                    onLoad={onLoad}
                />
            )}
            <CaseStatus
                id="svg-full-size-larger"
                status={first ? status : 'loading'}
                description={{
                    checks: 'An SVG with downsample={false} shown larger than its own size is drawn for the view, sharp, also when a smaller view of it loaded first (whose drawing the memory cache has).',
                    steps: 'A 40 pt view loads a 20×20 SVG (three thin black rings on white) with downsample={false}; once it has loaded, a 160 pt view of the same url mounts. Passes a moment after that one loads; the screenshot checks the sharpness.',
                    shows: 'The rings at 40 pt, then at 160 pt, both thin and sharp. Blurry or thick rings in the large one would mean it was scaled up from the small drawing.',
                }}
            />
        </View>
    )
}

// A tinted SVG as the placeholder, with objectFit none: a url placeholder is
// shown as with contain, so it's drawn for the view's size, filling it, not
// at its own size (24 pt) and scaled up as a full-size load would draw it.
function SvgTintPlaceholderCase() {
    const { status, setStatus, after } = usePlaceholderUrlStatus()
    useEffect(() => () => void releaseThumbhashHold('svg-tint-placeholder'), [])
    return (
        <View style={styles.row}>
            <FastImage
                style={{ width: 160, height: 160 }}
                source={{
                    uri: thumbhashHeld('svg-tint-placeholder'),
                    headers: SLOW_HEADERS,
                }}
                placeholder={imageUrl(
                    `svg-icon.svg?svg-tint-placeholder=${RUN}`,
                )}
                objectFit="none"
                tintColor="green"
                onLoadStart={after}
                onLoad={() => setStatus('onLoad: the download should be held')}
            />
            <CaseStatus
                id="svg-tint-placeholder"
                status={status}
                description={{
                    checks: 'A tinted SVG as the placeholder url, with objectFit none, is drawn for the size it fills, sharp (a url placeholder shows as with contain; drawn at its own size, 24 pt, it would be scaled up).',
                    steps: 'A 160 pt view with objectFit="none" and tintColor green loads a photo the slow server holds, with placeholder set to the url of a 24×24 SVG icon (a black ring). Passes 1 s after onLoadStart; onLoad fails it.',
                    shows: 'A green ring filling the 160 pt square, with sharp edges.',
                }}
            />
        </View>
    )
}

// A zoom viewer: a 30-point image shown 4 times larger, with a transform or
// a zoomed ScrollView (iOS), as pinch-to-zoom does. downsample={false}
// decodes the photo (a 1600x1000 page of text) at full size, so it stays
// sharp; with downsample it's decoded for 30 points and enlarged. The SVG (a
// 120x120 set of thin rings) is shown at its own size.
function ZoomCase({
    id,
    scrollView,
    description,
}: {
    id: string
    scrollView?: boolean
    description: Description
}) {
    const [status, onLoad] = useLoadedThenOk(4)
    // Zoomed once it's laid out: a zoomScale set as it mounts is ignored.
    const [zoom, setZoom] = useState(1)
    const images = (
        [
            ['text-page.png', false],
            ['text-page.png', true],
            ['svg-zoom.svg', false],
            ['svg-zoom.svg', true],
        ] as const
    ).map(([file, downsample]) => {
        const image = (
            <FastImage
                style={scrollView ? zoomStyles.image : zoomStyles.transformed}
                source={{ uri: imageUrl(`${file}?case=${id}-${downsample}`) }}
                downsample={downsample}
                onLoad={onLoad}
            />
        )
        const key = `${file}-${downsample}`
        return scrollView ? (
            <ScrollView
                key={key}
                style={zoomStyles.clip}
                contentContainerStyle={zoomStyles.image}
                maximumZoomScale={4}
                zoomScale={zoom}
                onLayout={() => setZoom(4)}
                scrollEnabled={false}
                contentInsetAdjustmentBehavior="never"
                automaticallyAdjustContentInsets={false}
            >
                {image}
            </ScrollView>
        ) : (
            <View key={key} style={zoomStyles.clip}>
                {image}
            </View>
        )
    })
    return (
        <View style={zoomStyles.case}>
            <View style={zoomStyles.grid}>{images}</View>
            <CaseStatus id={id} status={status} description={description} />
        </View>
    )
}

// The zoom group's SVG of thin rings as a data uri, zoomed 4 times with a
// transform: with downsample={false} drawn at its own size, as from a url
// (on iOS a data uri was decoded at once and shown as a vector, which UIKit
// drew for the 30-point view and the zoom scaled up).
// Base64: Android's Glide reads only base64 data uris.
const ZOOM_SVG_DATA_URI =
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiB2aWV3Qm94PSIwIDAgMTIwIDEyMCI+PGNpcmNsZSBjeD0iNjAiIGN5PSI2MCIgcj0iNiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiLz48Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSIxMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiLz48Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSIxNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiLz48Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSIxOCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiLz48Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSIyMiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiLz48Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSIyNiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiLz48Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSIzMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiLz48Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSIzNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiLz48Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSIzOCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiLz48Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSI0MiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiLz48Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSI0NiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiLz48Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSI1MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiLz48Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSI1NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiLz48L3N2Zz4='

function ZoomDataUriCase() {
    const [status, onLoad] = useLoadedThenOk(1)
    return (
        <View style={zoomStyles.case}>
            <View style={zoomStyles.clip}>
                <FastImage
                    style={zoomStyles.transformed}
                    source={{ uri: ZOOM_SVG_DATA_URI }}
                    downsample={false}
                    onLoad={onLoad}
                />
            </View>
            <CaseStatus
                id="zoom-data-uri"
                status={status}
                description={{
                    checks: 'An SVG data uri with downsample={false}, scaled 4 times with a transform, is as sharp as at its own size, as from a url (iOS showed it as a vector, drawn for the view and scaled up).',
                    steps: 'A 30-point view in a 120-point clip, scaled 4 times about its center, shows a data uri of a 120x120 SVG of thin rings with downsample={false}. Passes once it has loaded; the screenshot checks the sharpness.',
                    shows: "Thin rings filling the square, sharp (as zoom-transform's bottom left on iOS).",
                }}
            />
        </View>
    )
}

const zoomStyles = StyleSheet.create({
    // Apart from the cases around it, whose screenshots reach a little
    // beyond them.
    case: { paddingTop: 16, paddingBottom: 16 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: 248 },
    clip: {
        width: 120,
        height: 120,
        overflow: 'hidden',
        backgroundColor: '#eee',
    },
    image: { width: 30, height: 30 },
    // Scaled about its center, so it fills the clip.
    transformed: {
        position: 'absolute',
        left: 45,
        top: 45,
        width: 30,
        height: 30,
        transform: [{ scale: 4 }],
    },
})

// objectFit scale-down and none with an SVG of 60x60 black and white stripes,
// one unit wide: drawn at its size in points (dp), as sharp as with contain in
// a 60 point view (right). Android drew it at its size in pixels and enlarged
// it, soft and gray.
function ObjectFitSvgCase() {
    const [status, onLoad] = useLoadedThenOk(3)
    const source = { uri: imageUrl('svg-stripes.svg?case=object-fit-svg') }
    return (
        <View style={objectFitStyles.stacked}>
            <View style={objectFitStyles.images}>
                <FastImage
                    style={objectFitStyles.svg}
                    objectFit="scale-down"
                    source={source}
                    onLoad={onLoad}
                />
                <FastImage
                    style={[objectFitStyles.svg, styles.gap]}
                    objectFit="none"
                    source={source}
                    onLoad={onLoad}
                />
                <FastImage
                    style={[objectFitStyles.svgReference, styles.gap]}
                    objectFit="contain"
                    source={source}
                    onLoad={onLoad}
                />
            </View>
            <CaseStatus
                id="object-fit-svg"
                status={status}
                description={{
                    checks: 'objectFit scale-down and none draw an SVG at its own size in points (dp), as sharp as at that size with contain (Android drew it at its size in pixels and enlarged it, soft and gray).',
                    steps: 'Loads an SVG of 60x60 black and white stripes, one unit wide, with scale-down and none in 72-point views, and with contain in a 60-point view (the reference). Passes once all three have loaded; the screenshot checks the sharpness.',
                    shows: 'Black and white stripes three times: centered in a gray 72-point square, again, then on their own at 60 points, all with the same crisp 1-unit stripes. Soft or gray stripes in the first two are a failure.',
                }}
            />
        </View>
    )
}

// An SVG loading with objectFit scale-down, changed to contain before it has
// loaded: it ends up drawn for contain, as sharp as the contain view next to
// it. iOS draws an SVG smaller than a scale-down view at no more than its own
// size, so it's drawn again for contain once it has loaded.
function ObjectFitSvgChangeCase() {
    const [contain, setContain] = useState(false)
    const [status, onLoad] = useLoadedThenOk(2)
    useEffect(() => {
        const timer = setTimeout(() => setContain(true), 300)
        return () => clearTimeout(timer)
    }, [])
    return (
        <View style={objectFitStyles.stacked}>
            <View style={objectFitStyles.images}>
                <FastImage
                    style={objectFitStyles.large}
                    objectFit={contain ? 'contain' : 'scale-down'}
                    source={{
                        uri: slowImageUrl(
                            'svg-stripes.svg?case=object-fit-svg-change&delay=150',
                        ),
                        headers: SLOW_HEADERS,
                    }}
                    onLoad={onLoad}
                />
                <FastImage
                    style={[objectFitStyles.large, styles.gap]}
                    objectFit="contain"
                    source={{
                        uri: imageUrl(
                            'svg-stripes.svg?case=object-fit-svg-change-reference',
                        ),
                    }}
                    onLoad={onLoad}
                />
            </View>
            <CaseStatus
                id="object-fit-svg-change"
                status={status}
                description={{
                    checks: "An SVG whose objectFit changes from scale-down to contain while it loads is drawn for contain, sharp at the view's size.",
                    steps: 'An 88-point view loads a 60x60 SVG of black and white stripes, one unit wide, from the slow server (8 parts, 150 ms apart) with scale-down, and changes to contain 300 ms later. An 88-point view next to it shows the same SVG with contain from the start. Passes once both have loaded; the screenshot checks the sharpness.',
                    shows: 'Black and white stripes filling two squares, both with the same crisp stripes. Soft or gray stripes in the first are a failure.',
                }}
            />
        </View>
    )
}

// objectFit changed from cover to scale-down and none after load, while the
// image for the new fit loads (slowly, from the slow server, with cache
// 'web' so it isn't on disk): Android keeps the cover image as it was until
// then (it showed the crop stretched to the image's own size: squashed with
// scale-down, enlarged about 12 times with none); iOS shows the new fit at
// once. The third changes twice, to scale-down then 150 ms later to none,
// before the first change has loaded: Android keeps the cover image too (it
// went blank). The screenshot is taken while the new images load.
function ObjectFitFromCoverCase() {
    const [loads, setLoads] = useState(0)
    // Once all three have loaded with cover.
    const changed = loads >= 3
    const [again, setAgain] = useState(false)
    const [status, setStatus] = useState('loading')
    useEffect(() => {
        if (!changed) return
        const second = setTimeout(() => setAgain(true), 150)
        const timer = setTimeout(() => setStatus('OK'), 800)
        return () => {
            clearTimeout(second)
            clearTimeout(timer)
        }
    }, [changed])
    const onLoad = changed ? undefined : () => setLoads((n) => n + 1)
    const source = (fit: string) => ({
        uri: slowImageUrl(`text-page.png?case=object-fit-from-cover-${fit}`),
        headers: SLOW_HEADERS,
        cache: 'web' as const,
    })
    return (
        <View style={objectFitStyles.stacked}>
            <View style={objectFitStyles.images}>
                {(['scale-down', 'none'] as const).map((fit, i) => (
                    <FastImage
                        key={fit}
                        style={[objectFitStyles.large, i > 0 && styles.gap]}
                        objectFit={changed ? fit : 'cover'}
                        source={source(fit)}
                        onLoad={onLoad}
                    />
                ))}
                <FastImage
                    style={[objectFitStyles.large, styles.gap]}
                    objectFit={
                        changed ? (again ? 'none' : 'scale-down') : 'cover'
                    }
                    source={source('twice')}
                    onLoad={onLoad}
                />
            </View>
            <CaseStatus
                id="object-fit-from-cover"
                status={status}
                description={{
                    checks: 'Changing objectFit from cover after load, while the image for the new fit loads: on Android the view keeps showing the cover image as it was until then, and iOS shows the new fit at once (Android stretched the cropped image to its own size, squashed with scale-down and enlarged about 12 times with none; changed twice before the first change loaded, it went blank).',
                    steps: "Three 88-point views load a 1600x1000 page of text from the slow server with cache: 'web' (so it isn't on disk) and cover. Once all three have loaded, the first changes to scale-down, the second to none, and the third to scale-down and 150 ms later to none. Passes 800 ms after the change, while the new images are still loading, which is when the screenshot is taken.",
                    shows: 'iOS shows the new fit at once: the whole page small with gray above and below, then large letters from the middle of the page twice. Android still shows the cover crop in all three: the middle of the page, small text filling the square. A squashed or enlarged crop, or a blank view, is a failure.',
                }}
            />
        </View>
    )
}

// objectFit scale-down with blurRadius: a 120x120 image at its size, 120
// points (dp), blurred the same size as the sharp one next to it.
function ObjectFitBlurCase() {
    const [status, onLoad] = useLoadedThenOk(2)
    const source = { uri: imageUrl('picsum/1020-120x120.jpg') }
    return (
        <View style={objectFitStyles.stacked}>
            <View style={objectFitStyles.images}>
                <FastImage
                    style={blurStyles.large}
                    objectFit="scale-down"
                    source={source}
                    onLoad={onLoad}
                />
                <FastImage
                    style={[blurStyles.large, blurStyles.next]}
                    objectFit="scale-down"
                    source={source}
                    blurRadius={30}
                    onLoad={onLoad}
                />
            </View>
            <CaseStatus
                id="object-fit-blur"
                status={status}
                description={{
                    checks: 'objectFit scale-down with blurRadius shows the blurred image at its own size in points (dp), the same size as without the blur.',
                    steps: 'Loads a 120x120 photo into two 144-point views with scale-down, the second with blurRadius 30. Passes once both have loaded (and a moment more, for the blur).',
                    shows: 'Two gray 144-point squares, each with a 120-point photo of a bear on a hillside centered in it: sharp on the left, blurred on the right. A blurred image larger or smaller than the sharp one is a failure.',
                }}
            />
        </View>
    )
}

// objectFit in style, and which wins: style's contain; the prop's none over
// style's contain. resizeMode (removed in 10.0), as a prop and in style, is
// ignored: cover.
function ObjectFitStyleCase() {
    const [status, onLoad] = useLoadedThenOk(3)
    const source = { uri: imageUrl('center-large.png') }
    return (
        <View style={objectFitStyles.stacked}>
            <View style={objectFitStyles.images}>
                <FastImage
                    style={[objectFitStyles.image, { objectFit: 'contain' }]}
                    source={source}
                    onLoad={onLoad}
                />
                <FastImage
                    style={[
                        objectFitStyles.image,
                        styles.gap,
                        { objectFit: 'contain' },
                    ]}
                    objectFit="none"
                    source={source}
                    onLoad={onLoad}
                />
                <FastImage
                    style={[
                        objectFitStyles.image,
                        styles.gap,
                        { resizeMode: 'stretch' } as {},
                    ]}
                    {...({ resizeMode: 'contain' } as {})}
                    source={source}
                    onLoad={onLoad}
                />
            </View>
            <CaseStatus
                id="object-fit-style"
                status={status}
                description={{
                    checks: 'objectFit in style works, the objectFit prop wins over style, and resizeMode (removed in 10.0), as a prop or in style, is ignored.',
                    steps: "Three 48-point views of the 600x300 image (red with a blue border): style's objectFit: 'contain'; style's contain with the prop objectFit=\"none\"; and resizeMode: 'stretch' in style with resizeMode=\"contain\" as a prop. Passes once all three have loaded; the screenshot checks the fits.",
                    shows: 'Contained (half the height, gray above and below), then red only (none, the middle at its own size), then cover (the border only at the top and bottom). A stretched or contained third image is a failure.',
                }}
            />
        </View>
    )
}

// objectFit changed after load, from contain to none: a 1600x1000 page of
// text, whose middle at its own size needs the full-size image, not the one
// decoded for contain. Should match the left image.
// objectFit changed after the image loaded (cover, contain, cover, then
// contain): each load event comes once, as for a new blurRadius. Android
// loaded the image again for each fit, with onLoadStart, onLoad and onLoadEnd.
function ObjectFitEventsCase({ id, uri }: { id: string; uri: string }) {
    const [counts, setCounts] = useState({ start: 0, load: 0, end: 0 })
    const [fit, setFit] = useState<'cover' | 'contain'>('cover')
    const [changed, setChanged] = useState(false)
    const loaded = useRef(false)
    const onLoad = () => {
        setCounts((c) => ({ ...c, load: c.load + 1 }))
        if (loaded.current) return
        loaded.current = true
        setTimeout(() => setFit('contain'), 300)
        setTimeout(() => setFit('cover'), 1300)
        setTimeout(() => setFit('contain'), 2300)
        setTimeout(() => setChanged(true), 3300)
    }
    const got = `onLoadStart ${counts.start}, onLoad ${counts.load}, onLoadEnd ${counts.end}`
    const once = counts.start === 1 && counts.load === 1 && counts.end === 1
    const image = (
        <FastImage
            style={objectFitStyles.image}
            objectFit={fit}
            source={{ uri: `${uri}?${id}=${RUN}` }}
            onLoadStart={() => setCounts((c) => ({ ...c, start: c.start + 1 }))}
            onLoad={onLoad}
            onLoadEnd={() => setCounts((c) => ({ ...c, end: c.end + 1 }))}
        />
    )
    return (
        <View style={styles.row}>
            {/* A GIF's frame differs between runs; the case checks events. */}
            {uri.endsWith('.gif') ? <Masked>{image}</Masked> : image}
            <CaseStatus
                id={id}
                status={changed ? (once ? 'OK' : got) : 'waiting'}
                description={
                    uri.endsWith('.gif')
                        ? {
                              checks: 'Changing objectFit after an animated GIF has loaded sends no load events again (Android loaded the image again for each fit, with onLoadStart, onLoad and onLoadEnd).',
                              steps: 'Loads a GIF of a jellyfish (with a run-specific url) with objectFit cover, counting onLoadStart, onLoad and onLoadEnd. After onLoad it changes to contain, cover, then contain again, a second apart. Passes a second after the last change if each event fired once.',
                              shows: "The jellyfish contained in the 48-point view, gray above and below; animated, so it isn't compared.",
                          }
                        : {
                              checks: 'Changing objectFit after the image has loaded sends no load events again (Android loaded the image again for each fit, with onLoadStart, onLoad and onLoadEnd).',
                              steps: 'Loads the 600x300 image (with a run-specific url) with objectFit cover, counting onLoadStart, onLoad and onLoadEnd. After onLoad it changes to contain, cover, then contain again, a second apart. Passes a second after the last change if each event fired once.',
                              shows: 'The 600x300 image (red with a blue border) contained in the 48-point view: half the height, gray above and below.',
                          }
                }
            />
        </View>
    )
}

function ObjectFitChangeCase() {
    const [fit, setFit] = useState<'contain' | 'none'>('contain')
    const [done, setDone] = useState(false)
    useEffect(() => {
        if (fit === 'contain') return
        const timer = setTimeout(() => setDone(true), 750)
        return () => clearTimeout(timer)
    }, [fit])
    const source = { uri: imageUrl('text-page.png') }
    return (
        <View style={styles.row}>
            <FastImage
                style={objectFitStyles.image}
                objectFit="none"
                source={source}
            />
            <FastImage
                style={[objectFitStyles.image, styles.gap]}
                objectFit={fit}
                source={source}
                onLoad={() => setFit('none')}
            />
            <CaseStatus
                id="object-fit-change"
                status={done ? 'OK' : 'waiting'}
                description={{
                    checks: 'Changing objectFit from contain to none after load shows the middle of the image at its own size, from the full-size image rather than the one decoded for contain.',
                    steps: 'Loads a 1600x1000 page of text into two 48-point views: the left with objectFit none from the start, the right with contain, changed to none on its onLoad. Passes 750 ms after the change; the screenshot compares them.',
                    shows: 'Large letters from the middle of the page, twice, the same. A blurry or smaller right image is a failure.',
                }}
            />
        </View>
    )
}

const objectFitStyles = StyleSheet.create({
    image: { width: 48, height: 48, backgroundColor: '#eee' },
    large: { width: 88, height: 88, backgroundColor: '#eee' },
    svg: { width: 72, height: 72, backgroundColor: '#eee' },
    // The SVG's own size, so its 1-unit stripes stay crisp, and 4 dp after
    // it, so the row is a multiple of 8 dp (whole pixels at 2.625×).
    svgReference: { width: 60, height: 60, marginRight: 4 },
    visible: { overflow: 'visible' },
    // The images, then the status under them (CaseStatus's text is indented).
    stacked: { marginBottom: 12 },
    images: { flexDirection: 'row', marginBottom: 8 },
})

// objectPosition: where the image is when it doesn't fill the view, as CSS's
// object-position places it. A 600x300 image (red, with a blue border) or a
// 16x16 one (green) in 48-point views; the magenta outlines are just outside
// where each image should be. Check the screenshot.
const LARGE = imageUrl('center-large.png')
const SMALL = imageUrl('center-small.png')

// objectPosition changed after the image loaded (left, right, then left
// again): each load event comes once, as for any prop that doesn't change the
// image.
function PositionEventsCase({
    id,
    uri = LARGE,
    downsample,
}: {
    id: string
    uri?: string
    downsample?: boolean
}) {
    const [counts, setCounts] = useState({ start: 0, load: 0, end: 0 })
    const [position, setPosition] = useState('left')
    const [changed, setChanged] = useState(false)
    const loaded = useRef(false)
    const onLoad = () => {
        setCounts((c) => ({ ...c, load: c.load + 1 }))
        if (loaded.current) return
        loaded.current = true
        setTimeout(() => setPosition('right'), 300)
        setTimeout(() => setPosition('left'), 1300)
        setTimeout(() => setChanged(true), 2300)
    }
    const got = `onLoadStart ${counts.start}, onLoad ${counts.load}, onLoadEnd ${counts.end}`
    const once = counts.start === 1 && counts.load === 1 && counts.end === 1
    const image = (
        <FastImage
            style={objectFitStyles.image}
            objectFit="cover"
            objectPosition={position}
            source={{ uri: `${uri}?${id}=${RUN}` }}
            downsample={downsample}
            onLoadStart={() => setCounts((c) => ({ ...c, start: c.start + 1 }))}
            onLoad={onLoad}
            onLoadEnd={() => setCounts((c) => ({ ...c, end: c.end + 1 }))}
        />
    )
    return (
        <View style={styles.row}>
            {/* A GIF's frame differs between runs; the case checks events. */}
            {uri.endsWith('.gif') ? <Masked>{image}</Masked> : image}
            <CaseStatus
                id={id}
                status={changed ? (once ? 'OK' : got) : 'waiting'}
                description={
                    downsample === false
                        ? {
                              checks: 'Changing objectPosition after load, with downsample={false}, sends no load events again (Android loaded the image again, with onLoadStart, onLoad and onLoadEnd).',
                              steps: 'Loads the 600x300 image (red with a blue border; a run-specific url) with downsample={false}, objectFit cover and objectPosition left, counting onLoadStart, onLoad and onLoadEnd. After onLoad it changes to right, then back to left a second later. Passes a second after that if each event fired once.',
                              shows: 'The left part of the 600x300 image: its blue border at the left, top and bottom, red to the right edge.',
                          }
                        : uri === LARGE
                          ? {
                                checks: 'Changing objectPosition after load sends no load events again (Android loaded the image again, with onLoadStart, onLoad and onLoadEnd).',
                                steps: 'Loads the 600x300 image (red with a blue border; a run-specific url) with objectFit cover and objectPosition left, counting onLoadStart, onLoad and onLoadEnd. After onLoad it changes to right, then back to left a second later. Passes a second after that if each event fired once.',
                                shows: 'The left part of the 600x300 image: its blue border at the left, top and bottom, red to the right edge.',
                            }
                          : {
                                checks: 'Changing objectPosition after an animated GIF has loaded sends no load events again (Android loaded the image again, with onLoadStart, onLoad and onLoadEnd).',
                                steps: 'Loads a GIF of a jellyfish (a run-specific url) with objectFit cover and objectPosition left, counting onLoadStart, onLoad and onLoadEnd. After onLoad it changes to right, then back to left a second later. Passes a second after that if each event fired once.',
                                shows: "The left part of the jellyfish GIF, cropped to the 48-point square; animated, so it isn't compared.",
                            }
                }
            />
        </View>
    )
}

// Just outside a rect (in points) of a 48-point view.
function Outline({
    x,
    y,
    width,
    height,
}: {
    x: number
    y: number
    width: number
    height: number
}) {
    return (
        <View
            pointerEvents="none"
            style={[
                objectPositionStyles.outline,
                {
                    left: x - 1,
                    top: y - 1,
                    width: width + 2,
                    height: height + 2,
                },
            ]}
        />
    )
}

function PositionedImage({
    outline,
    first,
    ...props
}: React.ComponentProps<typeof FastImage> & {
    outline?: { x: number; y: number; width: number; height: number }
    first?: boolean
}) {
    return (
        <View style={!first && styles.gap}>
            <FastImage style={objectFitStyles.image} {...props} />
            {outline && <Outline {...outline} />}
        </View>
    )
}

// cover: the 96x48 image's left part (its left border shows), its right
// part, a quarter of the way along, and at the left 10 points from the top
// (CSS's two values: x, then y), which leaves a gap at the top.
function ObjectPositionCoverCase() {
    const [status, onLoad] = useLoadedThenOk(4)
    const positions = ['left', 'right', '25%', 'left 10px']
    return (
        <View style={objectFitStyles.stacked}>
            <View style={objectFitStyles.images}>
                {positions.map((position, i) => (
                    <PositionedImage
                        key={position}
                        first={i === 0}
                        objectFit="cover"
                        objectPosition={position}
                        source={{ uri: LARGE }}
                        onLoad={onLoad}
                    />
                ))}
            </View>
            <CaseStatus
                id="object-position-cover"
                status={status}
                description={{
                    checks: "objectPosition with cover places the cropped image as CSS's object-position does, with keywords, a percentage, and two values (x, then y).",
                    steps: "Loads the 600x300 image into four 48-point views with cover and objectPosition 'left', 'right', '25%' and 'left 10px'. Passes once all four have loaded; the screenshot checks the positions.",
                    shows: 'The 600x300 image (red with a blue border) in four 48-point views, each 96x48 after cover: at the left (its left border shows), at the right (its right border), a quarter of the way along (no side border), and at the left 10 points down (a gray gap at the top, the bottom border cut off).',
                }}
            />
        </View>
    )
}

// contain: the 48x24 image at the top, the bottom, 4 points above the
// bottom, and a 16x16 one with none and scale-down at corners.
function ObjectPositionContainCase() {
    const [status, onLoad] = useLoadedThenOk(6)
    return (
        <View style={objectFitStyles.stacked}>
            <View style={objectFitStyles.images}>
                <PositionedImage
                    first
                    objectFit="contain"
                    objectPosition="top"
                    source={{ uri: LARGE }}
                    onLoad={onLoad}
                    outline={{ x: 0, y: 0, width: 48, height: 24 }}
                />
                <PositionedImage
                    objectFit="contain"
                    objectPosition="bottom"
                    source={{ uri: LARGE }}
                    onLoad={onLoad}
                    outline={{ x: 0, y: 24, width: 48, height: 24 }}
                />
                <PositionedImage
                    objectFit="contain"
                    objectPosition={{ bottom: 4 }}
                    source={{ uri: LARGE }}
                    onLoad={onLoad}
                    outline={{ x: 0, y: 20, width: 48, height: 24 }}
                />
                <PositionedImage
                    objectFit="none"
                    objectPosition="left top"
                    source={{ uri: SMALL }}
                    onLoad={onLoad}
                    outline={{ x: 0, y: 0, width: 16, height: 16 }}
                />
                <PositionedImage
                    objectFit="none"
                    objectPosition="right 4px bottom 4px"
                    source={{ uri: SMALL }}
                    onLoad={onLoad}
                    outline={{ x: 28, y: 28, width: 16, height: 16 }}
                />
                <PositionedImage
                    objectFit="scale-down"
                    objectPosition="right"
                    source={{ uri: SMALL }}
                    onLoad={onLoad}
                    outline={{ x: 32, y: 16, width: 16, height: 16 }}
                />
            </View>
            <CaseStatus
                id="object-position-contain"
                status={status}
                description={{
                    checks: 'objectPosition places an image that leaves room in its view: with contain, none and scale-down, keywords, an object ({ bottom: 4 }) and keyword offsets.',
                    steps: "Six 48-point views, each with a magenta outline just outside where its image should be: the 600x300 image with contain at 'top', 'bottom' and { bottom: 4 }; a 16x16 green image with none at 'left top' and 'right 4px bottom 4px', and with scale-down at 'right'. Passes once all six have loaded; the screenshot checks the positions.",
                    shows: 'The red and blue image (48x24) in the top half, the bottom half, then 4 points above the bottom; a small green square in the top-left corner, 4 points from the bottom-right corner, then at the right edge, centered. Each image just inside its magenta outline; one outside its outline is a failure.',
                }}
            />
        </View>
    )
}

// With the view's style and props: cover at the left inside a rounded
// border; none at the large image's top-left corner with overflow visible
// (still cropped to the view); tinted and blurred, contained at the top and
// bottom; and fading in at the left.
function ObjectPositionStyleCase() {
    const [status, onLoad] = useLoadedThenOk(5)
    return (
        <View style={objectFitStyles.stacked}>
            <View style={objectFitStyles.images}>
                <FastImage
                    style={[
                        objectFitStyles.image,
                        objectPositionStyles.rounded,
                    ]}
                    objectFit="cover"
                    objectPosition="left"
                    source={{ uri: LARGE }}
                    onLoad={onLoad}
                />
                <PositionedImage
                    style={[objectFitStyles.image, objectFitStyles.visible]}
                    objectFit="none"
                    objectPosition="left top"
                    source={{ uri: LARGE }}
                    onLoad={onLoad}
                />
                <PositionedImage
                    objectFit="contain"
                    objectPosition="top"
                    tintColor="#9324c3"
                    source={{ uri: LARGE }}
                    onLoad={onLoad}
                    outline={{ x: 0, y: 0, width: 48, height: 24 }}
                />
                <PositionedImage
                    objectFit="contain"
                    objectPosition="bottom"
                    blurRadius={4}
                    source={{ uri: LARGE }}
                    onLoad={onLoad}
                    outline={{ x: 0, y: 24, width: 48, height: 24 }}
                />
                <PositionedImage
                    objectFit="cover"
                    objectPosition="left"
                    transition={{ duration: 300 }}
                    source={{ uri: LARGE }}
                    onLoad={onLoad}
                />
            </View>
            <CaseStatus
                id="object-position-style"
                status={status}
                description={{
                    checks: "objectPosition together with the view's style and other props: a rounded border, overflow visible, tintColor, blurRadius and a transition.",
                    steps: "Five 48-point views of the 600x300 image: cover at 'left' with borderRadius 14 and a dark 3-point border; none at 'left top' with overflow: 'visible'; contain at 'top' with tintColor #9324c3; contain at 'bottom' with blurRadius 4; cover at 'left' with a 300 ms transition. Passes once all five have loaded (and a moment more).",
                    shows: "The image's left part inside a dark rounded border; the image's top-left corner at its own size, cropped to the view (mostly blue, red in the bottom-right corner); a solid purple 48x24 block in the top half; a blurred red and blue image in the bottom half; the image's left part after its fade. The third and fourth sit inside magenta outlines.",
                }}
            />
        </View>
    )
}

// objectPosition changed after load: cover from left to right (Android crops
// it again), contain from top to bottom. Each should match the image to its
// left.
function ObjectPositionChangeCase() {
    const [loaded, setLoaded] = useState(false)
    const [done, setDone] = useState(false)
    useEffect(() => {
        if (!loaded) return
        const timer = setTimeout(() => setDone(true), 750)
        return () => clearTimeout(timer)
    }, [loaded])
    return (
        <View style={styles.row}>
            <PositionedImage
                first
                objectFit="cover"
                objectPosition="right"
                source={{ uri: LARGE }}
            />
            <PositionedImage
                objectFit="cover"
                objectPosition={loaded ? 'right' : 'left'}
                source={{ uri: LARGE }}
                onLoad={() => setLoaded(true)}
            />
            <PositionedImage
                objectFit="contain"
                objectPosition="bottom"
                source={{ uri: LARGE }}
            />
            <PositionedImage
                objectFit="contain"
                objectPosition={loaded ? 'bottom' : 'top'}
                source={{ uri: LARGE }}
            />
            <CaseStatus
                id="object-position-change"
                status={done ? 'OK' : 'waiting'}
                description={{
                    checks: 'Changing objectPosition after load moves the image to the new position (Android cropped it again for cover).',
                    steps: "Four 48-point views of the 600x300 image: cover at 'right' (reference), cover changed from 'left' to 'right' when it loads, contain at 'bottom' (reference), and contain changed from 'top' to 'bottom' at the same time. Passes 750 ms after the change.",
                    shows: "Two pairs, each image matching the one to its left: the image's right part (its right border showing) twice, then the image in the bottom half twice, gray above. An image still at the left or the top is a failure.",
                }}
            />
        </View>
    )
}

// defaultSource is placed at the position too: a source that fails, with the
// quadrants (an image in the app by its name: 80x80 points on iOS, 80 pixels
// on Android, a drawable-nodpi) at its own size, at the top-left and the
// bottom-right. On iOS each shows a quadrant's corner; on Android the whole
// image is in the corner.
function ObjectPositionDefaultSourceCase() {
    const [failed, setFailed] = useState(0)
    const onError = () => setFailed((n) => n + 1)
    const quadrants = { uri: 'regression_quadrants' } as unknown as number
    return (
        <View style={objectFitStyles.stacked}>
            <View style={objectFitStyles.images}>
                <PositionedImage
                    first
                    objectFit="none"
                    objectPosition="left top"
                    source={{ uri: MISSING }}
                    defaultSource={quadrants}
                    onError={onError}
                />
                <PositionedImage
                    objectFit="none"
                    objectPosition="right bottom"
                    source={{ uri: MISSING }}
                    defaultSource={quadrants}
                    onError={onError}
                />
            </View>
            <CaseStatus
                id="object-position-default-source"
                status={failed === 2 ? 'OK' : 'waiting'}
                description={{
                    checks: 'defaultSource is placed at objectPosition too, when the source fails.',
                    steps: "Two 48-point views with objectFit none and a source the image server answers with a 404, and defaultSource an image in the app of four colored quadrants (red, green, blue, yellow; 80x80 points on iOS, 80 pixels on Android), at 'left top' and 'right bottom'. Passes once both have fired onError.",
                    shows: 'On iOS, each view shows a corner of the larger quadrants image: mostly red with green and blue edges (top-left), then mostly yellow with green and blue edges (bottom-right). On Android the whole quadrants image, smaller than the view, sits in the top-left corner, then the bottom-right corner, with gray around it.',
                }}
            />
        </View>
    )
}

const objectPositionStyles = StyleSheet.create({
    outline: {
        position: 'absolute',
        borderWidth: 1,
        borderColor: '#f0f',
    },
    rounded: { borderRadius: 14, borderWidth: 3, borderColor: '#222' },
})

// Just outside a 40-point image centered in a 48-point view.
const centerStyles = StyleSheet.create({
    outline: {
        position: 'absolute',
        left: 3,
        top: 3,
        width: 42,
        height: 42,
        borderWidth: 1,
        borderColor: '#f0f',
    },
})

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
                description={{
                    checks: 'An image shown once FastImage.preload has resolved comes from the preload, not a new download (#657: on Android, a view shown while the preload was still in flight downloaded it again; awaiting the result avoids that).',
                    steps: 'Preloads the photo from a url new each launch, and shows it in a view once the preload resolves ok. Passes when the view has loaded and the server got one request for it.',
                    shows: 'A photo of a pug in a blanket.',
                }}
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
// while cyan loads (Android shows it from its cache). With `twice`, the source
// changes to another slow image first, then 150 ms later to cyan, before the
// first change has loaded: magenta should still stay (Android went blank).
function KeepPreviousCase({
    id,
    recycle,
    emptyKey,
    memoryCache,
    twice,
    description,
}: {
    id: string
    recycle?: boolean
    // recycle: an empty key first ('', then 'second').
    emptyKey?: boolean
    memoryCache?: boolean
    twice?: boolean
    description: Description
}) {
    const sample = useContext(SampleContext)
    const view = useRef<React.ComponentRef<typeof View>>(null)
    const [second, setSecond] = useState(false)
    // With `twice`: the first change, before cyan.
    const [between, setBetween] = useState(false)
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
                if (!twice) return setSecond(true)
                setBetween(true)
                setTimeout(() => setSecond(true), 150)
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
                            : between
                              ? {
                                    // About 7 s: replaced before it loads.
                                    uri: slowImageUrl(
                                        `quadrants.png?${id}=${RUN}&delay=1000`,
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
                        recycle
                            ? second
                                ? 'second'
                                : emptyKey
                                  ? ''
                                  : 'first'
                            : null
                    }
                    onLoad={second ? () => done.current() : onFirstLoad}
                />
            </View>
            <CaseStatus id={id} status={status} description={description} />
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
    description: Description
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
                description={{
                    checks: 'Clearing source while a slow image is still loading cancels the load: no onLoad, and the view stays blank (#1165: Android kept loading, then sent onLoad and showed the image).',
                    steps: 'Loads a cyan square from the slow server (in 8 parts, 150 ms apart: about 1.2 s). After 400 ms, sets source to undefined. Passes 2 s after mount, once the load would have finished, if onLoad never fired.',
                    shows: 'An empty gray square. A cyan square means the cancelled load finished and was shown.',
                }}
            />
        </View>
    )
}

const cachedPhoto = (id: string) => ({
    uri: imageUrl(`picsum/1020-120x120.jpg?${id}=${RUN}`),
})
// A magenta square SVG as a percent-encoded (not base64) data uri.
const MAGENTA_SVG_UTF8_DATA_URI =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'><rect width='8' height='8' fill='%23e0e'/></svg>"
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
                        ? {
                              checks: "Changing source to a data uri while a slow image is still loading cancels the slow load: no onError or onLoad for it, and it doesn't replace the new image (#1159: iOS didn't cancel it for a data uri, so the slow image replaced the new one when it finished, with another onLoad).",
                              steps: 'Loads a cyan square from the slow server (in 8 parts, 150 ms apart: about 1.2 s). After 400 ms, changes source to a data uri of an 8×8 yellow PNG. Passes 1.5 s after its onLoad, once the slow load would have finished, if there was no onError and exactly one onLoad after the change.',
                              shows: 'A yellow square (the 8×8 image scaled up). A cyan square means the slow image replaced it.',
                          }
                        : keepPrevious
                          ? {
                                checks: 'Changing source from a loaded image to a slow one, then to another image before the slow one loads: no onError for the cancelled load, and the last image stays (#1159: iOS sent onError and onLoadEnd for the cancelled load).',
                                steps: 'Preloads a photo of a bear into the cache, then shows a magenta square. On its onLoad, changes source to a cyan square from the slow server (in 8 parts, 150 ms apart: about 1.2 s), which loads with the magenta one still showing. After 400 ms, changes source to the bear. Passes 1.5 s after its onLoad, once the slow load would have finished, if there was no onError and exactly one onLoad after the change.',
                                shows: 'The photo of a bear on rocks. Magenta or cyan means a replaced image is showing.',
                            }
                          : {
                                checks: 'Changing source to a cached image while a slow image is still loading: no onError for the cancelled load, and the new image stays (#1159: iOS sent onError and onLoadEnd for the cancelled load).',
                                steps: 'Preloads a photo of a bear into the cache, then loads a cyan square from the slow server (in 8 parts, 150 ms apart: about 1.2 s). After 400 ms, changes source to the bear. Passes 1.5 s after its onLoad, once the slow load would have finished, if there was no onError and exactly one onLoad after the change.',
                                shows: 'The photo of a bear on rocks. A cyan square means the slow image replaced it.',
                            }
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
    description: Description
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
// it from there: it happened once in tens of urls, so with many. A preload
// right after the failure could also join the failed download on iOS while
// SDWebImage was still finishing it, and fail without a request (once in tens
// of urls on CI).
const RETRY_TRIES = 40
function PreloadRetryCase({ id, web }: { id: string; web?: boolean }) {
    const pathFor = (attempt: number) =>
        `/bad-once/picsum/1025-200x200.jpg?${id}=${RUN}-${attempt}`
    const sourceFor = (attempt: number) => ({
        uri: imageUrl(pathFor(attempt).slice(1)),
        cache: web ? ('web' as const) : undefined,
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
                        ? {
                              checks: "A cache: 'web' url whose first response was an HTML page (status 200) is downloaded again by the next preload (both platforms kept the page in the HTTP cache of web images, so later loads failed; iOS could still get it from there right after the failure, about once in tens of urls, so it tries many).",
                              steps: "For 40 urls, each new, that the server first answers with a captive portal's HTML page (cacheable for an hour) and then with the photo: preloads it with cache: 'web' (it fails), preloads it again, and checks the second succeeded from a second request. Then shows the first url in a view; passes on its onLoad.",
                              shows: 'A photo of a pug in a blanket. An empty gray square means a preload failed before the view was shown.',
                          }
                        : {
                              checks: "A url whose first response was an HTML page (status 200) is downloaded again by the next preload (#394: iOS failed it without a request until the app was relaunched, since views retried failed urls but preloads didn't; Android kept the page in Glide's disk cache; iOS could also give a preload right after the failure the failed download's error, without a request, while SDWebImage was still finishing it).",
                              steps: "For 40 urls, each new, that the server first answers with a captive portal's HTML page and then with the photo: preloads it (it fails), preloads it again, and checks the second succeeded from a second request. Then shows the first url in a view; passes on its onLoad.",
                              shows: 'A photo of a pug in a blanket. An empty gray square means a preload failed before the view was shown.',
                          }
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
                description={{
                    checks: "A url whose first response was an HTML page (status 200) loads in the next view (Android kept the page in Glide's disk cache, so the second view failed too).",
                    steps: "Shows a url the server first answers with a captive portal's HTML page, then with the photo: the view gets onError, and a new view of the same url mounts. Passes when the new view has loaded and the server got two requests.",
                    shows: 'A photo of a pug in a blanket (the second view).',
                }}
            />
        </View>
    )
}

// Shows a url whose first request fails (a 503): its ref's reload() downloads
// it again and shows it. Then reload() once it has loaded: it loads again from
// the cache, with its events (onLoadStart, then onLoad), and no request.
function ReloadCase() {
    const path = `/fail-once/picsum/1025-200x200.jpg?reload=${RUN}`
    const image = useRef<FastImageRef>(null)
    const events = useRef<string[]>([])
    const [status, setStatus] = useState('waiting')
    const reload = () => {
        if (!image.current?.reload) return setStatus('no reload()')
        image.current.reload()
    }
    const onLoad = async () => {
        events.current.push('load')
        const response = await fetch(
            imageUrl(`requests?path=${encodeURIComponent(path)}`),
        )
        const { count } = (await response.json()) as { count: number }
        const loads = events.current.filter((e) => e === 'load').length
        if (count !== 2) return setStatus(`${count} requests`)
        if (loads === 1) return reload()
        const expected = 'start error start load start load'
        setStatus(
            events.current.join(' ') === expected
                ? 'OK'
                : `events: ${events.current.join(' ')}`,
        )
    }
    return (
        <View style={styles.row}>
            <FastImage
                ref={image}
                style={styles.image}
                source={{ uri: imageUrl(path.slice(1)) }}
                onLoadStart={() => events.current.push('start')}
                onError={() => {
                    events.current.push('error')
                    if (events.current.includes('load')) {
                        setStatus('failed after it loaded')
                    } else {
                        reload()
                    }
                }}
                onLoad={onLoad}
            />
            <CaseStatus
                id="reload"
                status={status}
                description={{
                    checks: "The ref's reload(): it downloads a url that failed again, and loads an image that has loaded again from the cache, with its events each time.",
                    steps: 'Shows a url whose first request fails with a 503; on onError, calls reload(), which downloads it and shows it; once it has loaded, calls reload() again. Passes when the server got two requests and the events were onLoadStart, onError, onLoadStart, onLoad, onLoadStart, onLoad.',
                    shows: 'A photo of a pug in a blanket.',
                }}
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
                    cache: 'web',
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
                description={{
                    checks: "A cache: 'web' url that 404s fails with one request (Android loaded it again with the client without the HTTP cache: two requests).",
                    steps: "Preloads a missing image with cache: 'web'. Passes when the result is not ok and the server got one request for it.",
                    shows: 'An empty gray square: the case only preloads.',
                }}
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
                description={{
                    checks: "An image the server sends with Content-Type: text/plain still loads (Android fails a response that isn't an image only if its bytes aren't an image either).",
                    steps: 'Loads the photo, sent as text/plain. Passes on onLoad; onError fails it.',
                    shows: 'A photo of a pug in a blanket.',
                }}
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
                cache: 'cacheOnly',
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
                description={{
                    checks: "FastImage.preload with cache: 'cacheOnly' of an image that isn't cached fails without a request, as a view does (#406: iOS downloaded it, since preload didn't follow cache).",
                    steps: "Preloads the logo from a url new each launch with cache: 'cacheOnly'. Passes when the result is not ok and the server got no request for it.",
                    shows: 'An empty gray square: the case only preloads.',
                }}
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
                description={{
                    checks: 'memoryCache: false: the image shows, and a second view of it loads from the disk cache.',
                    steps: "Loads a photo with memoryCache: false; once it has loaded, a second view with the same source mounts. Passes when the second has loaded and the server got one request (that it isn't kept in memory isn't visible here).",
                    shows: 'Two photos of a pug in a blanket side by side. An empty gray square on the right means the second never loaded.',
                }}
            />
        </View>
    )
}

// Shows an image with diskCache false, then a view of the same size and a
// larger one. The same size comes from memory; the larger one is decoded
// again, and since the image isn't on disk it's downloaded again (the server
// gets two requests). Then getCachePath finds no file for its url, and
// resolves not ok for the source itself.
const NO_DISK_PATH = `/picsum/1025-200x200.jpg?no-disk=${RUN}`
function DiskCacheOffCase() {
    const [more, setMore] = useState(false)
    const [status, setStatus] = useState('waiting')
    const uri = imageUrl(NO_DISK_PATH.slice(1))
    const source = { uri, diskCache: false }
    const check = async () => {
        const response = await fetch(
            imageUrl(`requests?path=${encodeURIComponent(NO_DISK_PATH)}`),
        )
        const { count } = await response.json()
        const onDisk = await FastImage.getCachePath({ uri, cache: 'cacheOnly' })
        const own = await FastImage.getCachePath(source)
        const problems = [
            count !== 2 && `requested ${count} times`,
            onDisk.ok && 'on disk',
            own.ok && 'getCachePath ok',
        ].filter(Boolean)
        setStatus(problems.length ? problems.join(', ') : 'OK')
    }
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={source}
                onLoad={() => setMore(true)}
                onError={(e) => setStatus(`error: ${e.nativeEvent.error}`)}
            />
            {more ? (
                <>
                    <FastImage
                        style={[styles.image, styles.gap]}
                        source={source}
                    />
                    <FastImage
                        style={[diskCacheStyles.large, styles.gap]}
                        source={source}
                        onLoad={() =>
                            check().catch((e) => setStatus(`error: ${e}`))
                        }
                        onError={(e) =>
                            setStatus(`error: ${e.nativeEvent.error}`)
                        }
                    />
                </>
            ) : (
                <View style={[styles.image, styles.gap]} />
            )}
            <CaseStatus
                id="disk-cache-off"
                status={status}
                description={{
                    checks: "diskCache: false keeps an image off disk: a second view of the same size gets it from memory, a larger one downloads it again, and getCachePath doesn't find it.",
                    steps: "Loads a 200×200 photo of a pug in a 48×48 view with diskCache: false. On its onLoad, adds a second 48×48 view and an 88×88 one with the same source. When the large one loads, passes if the image server got two requests (the first view's and the large one's), and getCachePath resolves not ok for the uri with cache: 'cacheOnly' and for the source itself.",
                    shows: 'The pug photo three times: two small, then a larger one.',
                }}
            />
        </View>
    )
}

// A `web` image with diskCache false that the server lets caches keep for an
// hour, after a preload of its url (cache 'immutable'): the first view
// downloads it (not the preload's file), and a second view of the same size
// downloads it again (it isn't kept in memory, nor in any HTTP cache), so the
// server gets three requests.
const NO_DISK_WEB_PATH = `/max-age/picsum/1025-200x200.jpg?no-disk-web=${RUN}`
function DiskCacheOffWebCase() {
    const [first, setFirst] = useState(false)
    const [second, setSecond] = useState(false)
    const [status, setStatus] = useState('waiting')
    const uri = imageUrl(NO_DISK_WEB_PATH.slice(1))
    const source = { uri, cache: 'web' as const, diskCache: false }
    useEffect(() => {
        FastImage.preload([{ uri }])
            .then(([result]) =>
                result.ok
                    ? setFirst(true)
                    : setStatus(`preload error: ${result.error}`),
            )
            .catch((e) => setStatus(`error: ${e}`))
        // Only on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    const check = async () => {
        const response = await fetch(
            imageUrl(`requests?path=${encodeURIComponent(NO_DISK_WEB_PATH)}`),
        )
        const { count } = await response.json()
        setStatus(count === 3 ? 'OK' : `requested ${count} times`)
    }
    return (
        <View style={styles.row}>
            {first ? (
                <FastImage
                    style={styles.image}
                    source={source}
                    onLoad={() => setSecond(true)}
                    onError={(e) => setStatus(`error: ${e.nativeEvent.error}`)}
                />
            ) : (
                <View style={styles.image} />
            )}
            {second ? (
                <FastImage
                    style={[styles.image, styles.gap]}
                    source={source}
                    onLoad={() =>
                        check().catch((e) => setStatus(`error: ${e}`))
                    }
                    onError={(e) => setStatus(`error: ${e.nativeEvent.error}`)}
                />
            ) : (
                <View style={[styles.image, styles.gap]} />
            )}
            <CaseStatus
                id="disk-cache-off-web"
                status={status}
                description={{
                    checks: "diskCache: false with cache: 'web': each view downloads the image, though the server lets caches keep it and a preload stored its url on disk.",
                    steps: "Preloads the pug photo's url (the default cache), from a route the image server sends with Cache-Control: max-age=3600. Then a view loads it with cache: 'web' and diskCache: false, and on its onLoad a second view of the same size does too. Passes when the second loads, if the image server got three requests (the preload's and each view's).",
                    shows: 'The pug photo twice, side by side.',
                }}
            />
        </View>
    )
}

const diskCacheStyles = StyleSheet.create({
    large: { width: 88, height: 88, backgroundColor: '#eee' },
})

// A view with cache 'cacheOnly' (or React Native's 'only-if-cached', the same)
// of an image that isn't cached: onError and onLoadEnd (not ok), not onLoad
// (iOS sent onLoad for no image), and no request.
function CacheOnlyMissCase({
    id = 'cache-only-miss',
    cache = 'cacheOnly',
    description = {
        checks: "A view with cache: 'cacheOnly' for an image that isn't cached gets onError and onLoadEnd (not ok), without a request (#1315: iOS sent onLoad and onLoadEnd for an image it didn't have).",
        steps: "Loads a photo of a pug that nothing has loaded (a url only this case uses) with cache: 'cacheOnly'. When onError fires, asks the image server how many requests it got for the url. Passes if it got none, onLoadEnd's ok was false, and onLoad never fired.",
        shows: 'An empty gray square: the image is never loaded. The pug here would mean it was downloaded.',
    },
}: {
    id?: string
    cache?: 'cacheOnly' | 'only-if-cached'
    description?: Description
}) {
    const path = `/picsum/1025-200x200.jpg?${id}=${RUN}`
    const [status, setStatus] = useState('waiting')
    const loadEnd = useRef<string | undefined>(undefined)
    const check = async (event: string) => {
        const response = await fetch(
            imageUrl(`requests?path=${encodeURIComponent(path)}`),
        )
        const { count } = await response.json()
        setStatus(
            event !== 'onError'
                ? event
                : count !== 0
                  ? `requested ${count} times`
                  : loadEnd.current !== 'not ok'
                    ? `onLoadEnd: ${loadEnd.current ?? 'not sent'}`
                    : 'OK',
        )
    }
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={{
                    uri: imageUrl(path.slice(1)),
                    cache,
                }}
                onLoad={() => check('onLoad').catch((e) => setStatus(`${e}`))}
                onError={() => check('onError').catch((e) => setStatus(`${e}`))}
                onLoadEnd={(result) => {
                    loadEnd.current = result.ok ? 'ok' : 'not ok'
                }}
            />
            <CaseStatus id={id} status={status} description={description} />
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
                cache: 'cacheOnly',
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
                description={{
                    checks: "FastImage.configureCache: the maxDiskSize in the app's native config (300 MB) is in effect from the start, with the disk cache's size; a runtime change applies (iOS at once, Android from the next launch), and null resets it.",
                    steps: "Reads configureCache(): the limit, and a disk size above 0 from earlier groups' images. iOS: downloads a photo with getCachePath, sets maxDiskSize to 1 byte, which empties the disk cache, checks the photo is gone (getCachePath with cache: 'cacheOnly'), then resets it with null. Android: sets 1 byte, then null, and the limit in effect stays 300 MB. Passes when every value matches.",
                    shows: 'An empty gray square: no image is shown.',
                }}
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
//   - missing: the file doesn't exist; web: a `cache: 'web'` source;
//   - avif: the file is an AVIF (the quadrants), which iOS rejected as not an
//     image (SDWebImage's format check doesn't know AVIF).
function WriteToCacheCase({
    id,
    description,
    byCacheKey,
    keyOnly,
    cached,
    missing,
    web,
    avif,
}: {
    id: string
    description: Description
    byCacheKey?: boolean
    keyOnly?: boolean
    cached?: boolean
    missing?: boolean
    web?: boolean
    avif?: boolean
}) {
    const path = `/${web ? 'max-age/' : ''}picsum/1025-200x200.jpg?${id}=${RUN}`
    const source: Source = {
        uri: imageUrl(path.slice(1)),
        cacheKey: byCacheKey || keyOnly ? `${id}-${RUN}` : undefined,
        cache: web ? ('web' as const) : undefined,
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
                          avif
                              ? `formats/quadrants.avif?${id}-file=${RUN}`
                              : `picsum/1022-120x120.jpg?${id}-file=${RUN}`,
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

// getCachePath of an image, then `await clearDiskCache()`, then getCachePath
// of the image again, with cache 'cacheOnly' and without. Passes when the
// cacheOnly one isn't ok, and the other downloads the image again (the server
// gets one more request) and gives a file that's there. Android kept the file
// in Glide's memory cache, so both gave the old path, though the clear had
// deleted the file. The first getCachePath:
//   - downloads the image;
//   - loaded: finds the file of the image a view showed (on Android, a lookup
//     in the disk cache, which kept its result in memory the same way).
function CachePathAfterClearCase({
    id,
    description,
    loaded,
}: {
    id: string
    description: Description
    loaded?: boolean
}) {
    const path = `/picsum/1022-120x120.jpg?${id}=${RUN}`
    const source: Source = { uri: imageUrl(path.slice(1)) }
    const [status, setStatus] = useState('waiting')
    const [shown, setShown] = useState(false)
    const ready = !loaded || shown
    useEffect(() => {
        if (!ready) return
        let stopped = false
        // Whether a result's file is there (getCachePath of its file:// uri).
        const fileThere = async (result: CachePathResult) =>
            result.ok &&
            (await FastImage.getCachePath({ uri: `file://${result.path}` })).ok
        const run = async () => {
            const first = await FastImage.getCachePath(source)
            if (!first.ok) return setStatus(`no file: ${first.error}`)
            const clear = await FastImage.clearDiskCache()
            const cacheOnly = await FastImage.getCachePath({
                ...source,
                cache: 'cacheOnly',
            })
            const cacheOnlyThere = await fileThere(cacheOnly)
            const again = await FastImage.getCachePath(source)
            const againThere = await fileThere(again)
            const requests = await fetch(
                imageUrl(`requests?path=${encodeURIComponent(path)}`),
            )
                .then((response) => response.json())
                .then((json: { count: number }) => json.count)
            const problems = [
                !clear.ok && `clearDiskCache: ${clear.error}`,
                cacheOnly.ok &&
                    (cacheOnlyThere
                        ? "cache 'cacheOnly' found it after clearDiskCache"
                        : "cache 'cacheOnly' gave a path with no file"),
                !again.ok && `getCachePath: ${again.error}`,
                again.ok &&
                    !againThere &&
                    'getCachePath gave a path with no file',
                // The first download (the view's, or getCachePath's), and
                // getCachePath's after the clear.
                requests !== 2 && `requested ${requests} times, expected 2`,
            ].filter(Boolean)
            if (!stopped) {
                setStatus(problems.length > 0 ? problems.join('; ') : 'OK')
            }
        }
        run().catch((e) => setStatus(`error: ${e}`))
        return () => {
            stopped = true
        }
        // Once, when ready.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready])
    return (
        <View style={styles.row}>
            {loaded ? (
                <FastImage
                    style={styles.image}
                    source={source}
                    onLoad={() => setShown(true)}
                />
            ) : (
                <View style={styles.image} />
            )}
            <CaseStatus id={id} status={status} description={description} />
        </View>
    )
}

// clearDiskCache() and then getCachePath of a file:// uri, which is answered
// on the native modules' thread (Android) or the module's queue (iOS),
// without awaiting either, after queueing cache 'cacheOnly' lookups the clear
// waits behind. Passes when the file:// call resolves first. On Android the
// clear ran on the native modules' thread, where React Native runs every
// module's async methods, so they waited while it deleted the cache. 200
// lookups: with 20, a busy machine sometimes finished them and the clear
// before the module's queue got to the file:// call.
function ClearDiskCacheThreadCase() {
    const [status, setStatus] = useState('waiting')
    useEffect(() => {
        const order: string[] = []
        const lookups = Array.from({ length: 200 }, (_, n) =>
            FastImage.getCachePath({
                uri: imageUrl(
                    `picsum/1022-120x120.jpg?clear-disk-cache-thread=${RUN}&n=${n}`,
                ),
                cache: 'cacheOnly',
            }),
        )
        const clear = FastImage.clearDiskCache().then((result) => {
            order.push('clearDiskCache')
            return result
        })
        const file = FastImage.getCachePath({
            uri: 'file:///clear-disk-cache-thread',
        }).then(() => order.push('getCachePath'))
        Promise.all([clear, file, ...lookups])
            .then(([result]) => {
                const problems = [
                    !result.ok && `clearDiskCache: ${result.error}`,
                    order[0] !== 'getCachePath' &&
                        'the file:// getCachePath resolved after clearDiskCache',
                ].filter(Boolean)
                setStatus(problems.length > 0 ? problems.join('; ') : 'OK')
            })
            .catch((e) => setStatus(`error: ${e}`))
    }, [])
    return (
        <View style={styles.row}>
            <View style={styles.image} />
            <CaseStatus
                id="clear-disk-cache-thread"
                status={status}
                description={{
                    checks: "clearDiskCache doesn't hold up a native call made after it (#1295: Android cleared the cache on React Native's native modules thread, so every module's async calls waited for it).",
                    steps: "Without awaiting, queues 200 getCachePath lookups with cache: 'cacheOnly' (images that aren't cached), then FastImage.clearDiskCache(), then getCachePath of a file:// uri, which is answered right away. Passes if the clear resolves ok and the file:// call resolves before it.",
                    shows: 'An empty gray square: the case shows no image.',
                }}
            />
        </View>
    )
}

// FastImage.getCachePath: the source's file in the disk cache, shown as a
// `file://` source (so it's the downloaded image; the file may have no image
// extension, which React Native 0.73's Image doesn't load on iOS).
//   - loaded: a view shows the image first, then the path is asked for;
//   - otherwise it isn't loaded before: getCachePath downloads it (one
//     request), or with cacheOnly fails without a request;
//   - whileLoading: asked for while a view is still downloading it (slowly);
//   - dataUri: a data uri (the yellow PNG, with a parameter of its own, so
//     no other view has stored it), stored like a download without a request.
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
    dataUri,
}: {
    id: string
    description: Description
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
    dataUri?: boolean
}) {
    const path = missing
        ? `does-not-exist.jpg?${id}=${RUN}`
        : `${web ? 'max-age/' : ''}picsum/1022-120x120.jpg?${id}=${RUN}${space ? '&name=a b' : ''}`
    const uri = dataUri
        ? YELLOW_DATA_URI.replace(';base64,', `;run=${RUN};base64,`)
        : whileLoading
          ? slowImageUrl(`picsum/1022-120x120.jpg?group=${id}-${RUN}&delay=150`)
          : imageUrl(path)
    const source: Source = {
        uri,
        cacheKey: byCacheKey || keyOnly ? `${id}-${RUN}` : undefined,
        cache: web ? ('web' as const) : undefined,
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
                        cache: 'cacheOnly',
                    }
                  : source,
        )
            .then(async (r) => {
                // A data uri isn't requested.
                if (dataUri) {
                    setRequests(0)
                    setResult(r)
                    return
                }
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
    const expected = loaded ? 1 : cacheOnly || keyOnly || dataUri ? 0 : 1
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
                      ? // One download: the view's and getCachePath's requests
                        // share it (SDWebImage on iOS, FastImageSharedDownloads
                        // on Android, where Glide downloaded it again).
                        requests === 1
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
                description={{
                    checks: "FastImage.preload with memoryCache: false (to disk only, without decoding) still reports the image's size, and a view then loads it from the disk cache.",
                    steps: 'Preloads a 200×200 photo with memoryCache: false, then shows it in a view with the same source. Passes when the preload resolved ok with 200×200, the view has loaded, and the server got one request.',
                    shows: 'A photo of a pug in a blanket.',
                }}
            />
        </View>
    )
}

// transition, recorded (a video sample, see RunnerContext.tsx): an image that
// fades in over 1 s, over black, goes from black through half cyan to cyan;
// one that shows at once goes from black to cyan (half cyan mustn't appear).
// Over black, so halfway is far from both ends. Each records until the fade's
// length after its image loaded, so one that shouldn't fade has the time to.
// With image 'cyan-animated', an animated WebP (two cyan frames): an
// AnimatedImageDrawable on Android 9+.
// With opacity, the image (opaque cyan) at half opacity: 'style', FastImage's
// own (on its View), or 'parent', a View it's in. From magenta (change, or
// placeholder) it goes from half magenta to half cyan, over black, through a
// dark blue; light blue near the end means what the view showed doesn't fade
// out under the image. On Android, React Native's View applies its opacity
// to each drawing in it, by default.
// Where the image comes from:
// - download: the slow server (about 350 ms).
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
// - placeholder: the view shows a magenta defaultSource (no source), then its
//   source becomes a cyan image that downloads (the slow server): magenta,
//   then cyan, or through blue-violet if it fades. With image 'cyan-half', a
//   cyan image at half opacity: magenta, then half cyan over black, through
//   a darker blue-violet (with the magenta gone at the end). With tall, the
//   view is three times as tall as the case shows (its top third), with
//   objectFit contain: the square image covers the middle third, and the
//   top shows defaultSource, then black, through half magenta. With edge,
//   the same in the half pixel an image leaves at the top: objectFit
//   contain, with the image (cyan-short.png, 42 × 41 px) a pixel shorter
//   than the 16 dp view (42 px on the Android emulator; the same for views
//   of 22 to 62 px), and the view magnified 8 times, so the half pixel is 4
//   on the screen (recorded there). With
//   defaultDrawable (Android), defaultSource is a magenta drawable of another
//   kind: 'vector', a vector drawable (a VectorDrawable), or 'animated', an
//   animated WebP (an AnimatedImageDrawable on Android 9+).
// - web: a cache 'web' image (cacheable for an hour) that a view (left)
//   loaded: on Android from its HTTP cache, without a request (Android doesn't
//   keep cache 'web' images in the memory cache), on iOS from the memory cache
//   (SDWebImage keeps them in its caches too).
const FADE_MS = 1000
const BLACK = '#000000'
// Cyan at half opacity over black.
const HALF_CYAN = '#008080'
// Halfway from magenta to cyan.
const MAGENTA_CYAN = '#8080ff'
// Halfway from magenta to half-opacity cyan, over black.
const MAGENTA_HALF_CYAN = '#8040c0'
// Magenta at half opacity over black.
const HALF_MAGENTA = '#800080'
// Halfway from magenta to cyan, at half opacity over black.
const HALF_MAGENTA_CYAN = '#404080'
// Cyan at half opacity over a quarter of magenta, over black.
const HALF_CYAN_OVER_MAGENTA = '#4080c0'
// A magenta defaultSource (see DEFAULT for Android's).
const MAGENTA_DEFAULT = Platform.select({
    android: { uri: 'regression_magenta' } as unknown as number,
    default: require('./images/magenta.png'),
})
// The same for the tall view (iOS fits it in the view as the image).
const MAGENTA_TALL_DEFAULT = Platform.select({
    android: { uri: 'regression_magenta' } as unknown as number,
    default: require('./images/magenta-tall.png'),
})
type FadeFrom =
    | 'download'
    | 'memory'
    | 'disk'
    | 'change'
    | 'change-download'
    | 'file'
    | 'bundled'
    | 'placeholder'
    | 'web'
function FadeCase({
    id,
    from,
    skipOnCacheHit,
    betweenImages,
    blurRadius,
    defaultTransition = false,
    image = 'cyan',
    tall = false,
    edge = false,
    defaultDrawable,
    opacity,
    positioned = false,
    fades,
    description,
}: {
    id: string
    from: FadeFrom
    // A wide image at objectPosition left (cover), from the square
    // defaultSource: recorded at the view's right edge, which shows the view's
    // background (black) if the image view moves during the fade.
    positioned?: boolean
    image?: 'cyan' | 'cyan-half' | 'cyan-animated'
    tall?: boolean
    edge?: boolean
    defaultDrawable?: 'vector' | 'animated'
    // animation: a view animation with an alpha of 0.5 on a View it's in (see
    // VIEW_ANIMATION_ID).
    opacity?: 'style' | 'parent' | 'animation'
    skipOnCacheHit?: Transition['skipOnCacheHit']
    betweenImages?: boolean
    blurRadius?: number
    // No transition prop: the built-in default (the runner turns fades off
    // for the other cases), which fades for the platform's usual length.
    defaultTransition?: boolean
    fades: boolean
    description: Description
}) {
    const sample = useContext(SampleContext)
    const inRunner = useContext(InRunnerContext)
    const view = useRef<React.ComponentRef<typeof View>>(null)
    const change = from === 'change' || from === 'change-download'
    const placeholder = from === 'placeholder'
    // From magenta (the image showing, or defaultSource) to cyan.
    const fromMagenta = change || placeholder
    const imageFile = positioned
        ? 'cyan-wide.png'
        : edge
          ? 'cyan-short.png'
          : image === 'cyan-animated'
            ? 'cyan-animated.webp'
            : `${image}.png`
    const source =
        from === 'download' || from === 'change-download' || placeholder
            ? {
                  uri: slowImageUrl(`${imageFile}?${id}=${RUN}&delay=50`),
                  headers: BACKGROUND_SLOW_HEADERS,
              }
            : from === 'web'
              ? {
                    uri: imageUrl(`max-age/cyan.png?${id}=${RUN}`),
                    cache: 'web' as const,
                }
              : { uri: imageUrl(`cyan.png?${id}=${RUN}`) }
    const magenta = { uri: imageUrl(`magenta.png?${id}=${RUN}`) }
    const [file, setFile] = useState<Source>()
    // Recorded as the view mounts (download, bundled), or once the view that
    // loads the image first (left) has loaded it.
    const onMount = from === 'download' || from === 'bundled'
    // Whether a view (left) loads the image first.
    const loader = !onMount && from !== 'change-download' && !placeholder
    const [loaderShown, setLoaderShown] = useState(loader)
    // The view that fades (change: it shows magenta until the change;
    // placeholder: its defaultSource until it gets its source).
    const [shown, setShown] = useState(fromMagenta)
    const [changed, setChanged] = useState(false)
    // What the view that fades shows (change: magenta until the change).
    const shownSource =
        from === 'bundled'
            ? require('./images/cyan.png')
            : from === 'file'
              ? file
              : change && !changed
                ? magenta
                : placeholder && !changed
                  ? undefined
                  : source
    const [status, setStatus] = useState(
        onMount ? 'waiting' : 'loading the first view',
    )
    const expect = opacity
        ? [HALF_MAGENTA, HALF_MAGENTA_CYAN, HALF_CYAN]
        : tall || edge
          ? [MAGENTA, HALF_MAGENTA, BLACK]
          : image === 'cyan-half'
            ? [MAGENTA, MAGENTA_HALF_CYAN, HALF_CYAN]
            : fromMagenta
              ? fades
                  ? [MAGENTA, MAGENTA_CYAN, CYAN]
                  : [MAGENTA, CYAN]
              : fades
                ? [BLACK, HALF_CYAN, CYAN]
                : [BLACK, CYAN]
    const loaded = useRef(0)
    const done = useRef(() => {})
    const steppedRef = useRef(false)
    const record = async () => {
        const measured = await measureView(view.current)
        if (!measured) return setStatus('not on screen')
        // edge: the top 4 pixels. positioned: the right 4.
        const area = edge
            ? { ...measured, height: 4 / PixelRatio.get() }
            : positioned
              ? {
                    ...measured,
                    x: measured.x + measured.width - 4 / PixelRatio.get(),
                    width: 4 / PixelRatio.get(),
                }
              : measured
        setStatus('recording')
        const result = await sample(
            {
                name: id,
                area,
                durationMs: 5000,
                expect,
                // Stepped where the app can: through the fade
                // (the built-in default's is 300 ms).
                steppedMs: defaultTransition ? 300 : FADE_MS,
                // tall, edge, cyan-half and opacity: also what shows if
                // defaultSource (or the image showing) doesn't fade out
                // (magenta until the end, magenta with cyan over it).
                palette: opacity
                    ? [
                          HALF_MAGENTA,
                          HALF_MAGENTA_CYAN,
                          HALF_CYAN,
                          HALF_CYAN_OVER_MAGENTA,
                      ]
                    : tall || edge
                      ? [MAGENTA, HALF_MAGENTA, BLACK, CYAN]
                      : image === 'cyan-half'
                        ? [MAGENTA, MAGENTA_HALF_CYAN, HALF_CYAN, MAGENTA_CYAN]
                        : positioned
                          ? [MAGENTA, MAGENTA_CYAN, CYAN, BLACK]
                          : fromMagenta
                            ? [MAGENTA, MAGENTA_CYAN, CYAN]
                            : [BLACK, HALF_CYAN, CYAN],
            },
            (sampleDone, stepped) => {
                steppedRef.current = stepped
                done.current = () => {
                    if (defaultTransition) {
                        FastImage.setDefaults({ transition: false })
                    }
                    sampleDone()
                }
                if (defaultTransition) {
                    FastImage.setDefaults({ transition: null })
                }
                if (fromMagenta) setChanged(true)
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
        } else if (from === 'memory' || from === 'web') {
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
        // Once defaultSource shows.
        const timer = placeholder ? setTimeout(record, 500) : undefined
        // Back to the runner's default (no fades) if it unmounts while
        // recording.
        return () => {
            clearTimeout(timer)
            if (defaultTransition) FastImage.setDefaults({ transition: false })
        }
        // Only on mount (the others record once the first view loads).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    // The view that fades.
    const fading = shown ? (
        <FastImage
            style={[
                tall
                    ? fadeStyles.tall
                    : edge
                      ? fadeStyles.small
                      : fadeStyles.image,
                opacity === 'style' ? fadeStyles.half : null,
            ]}
            objectFit={tall || edge ? 'contain' : undefined}
            objectPosition={positioned ? 'left' : undefined}
            source={shownSource}
            defaultSource={
                defaultDrawable
                    ? ({
                          uri: `regression_magenta_${defaultDrawable}`,
                      } as unknown as number)
                    : tall
                      ? MAGENTA_TALL_DEFAULT
                      : placeholder
                        ? MAGENTA_DEFAULT
                        : undefined
            }
            onLoad={
                change && !changed
                    ? onLoaderLoad
                    : // With some slack: the fade can start a little after
                      // onLoad on a busy device. Stepped, it waits for the
                      // steps.
                      () =>
                          setTimeout(
                              () => done.current(),
                              steppedRef.current ? 300 : FADE_MS + 500,
                          )
            }
            transition={
                defaultTransition
                    ? undefined
                    : {
                          duration: FADE_MS,
                          betweenImages,
                          skipOnCacheHit,
                      }
            }
            blurRadius={blurRadius}
        />
    ) : null
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
                style={[
                    edge ? fadeStyles.magnified : fadeStyles.black,
                    loader ? styles.gap : null,
                    tall ? fadeStyles.clip : null,
                ]}
            >
                {edge ? (
                    <View style={fadeStyles.edge}>{fading}</View>
                ) : opacity === 'parent' || opacity === 'animation' ? (
                    <View
                        collapsable={false}
                        nativeID={
                            opacity === 'animation' && inRunner
                                ? VIEW_ANIMATION_ID
                                : undefined
                        }
                        style={[
                            fadeStyles.image,
                            opacity === 'parent' ? fadeStyles.half : null,
                        ]}
                    >
                        {fading}
                    </View>
                ) : (
                    fading
                )}
            </View>
            <CaseStatus id={id} status={status} description={description} />
        </View>
    )
}

// The example apps' MainActivity starts a view animation
// (android.view.animation) with an alpha of 0.5 on the View with this
// nativeID, which doesn't change the View's opacity. Only in the runner: the
// Regression tab shows every case at once, and the running animation would
// keep the app from going idle, which Maestro waits for before it taps.
const VIEW_ANIMATION_ID = 'regression-view-animation'

const fadeStyles = StyleSheet.create({
    black: { width: 48, height: 48, backgroundColor: BLACK },
    image: { width: 48, height: 48 },
    clip: { overflow: 'hidden' },
    tall: { width: 48, height: 144 },
    half: { opacity: 0.5 },
    // edge: 16 dp, magnified 8 times to fill 128 dp.
    magnified: {
        width: 128,
        height: 128,
        alignItems: 'center',
        justifyContent: 'center',
    },
    edge: {
        width: 16,
        height: 16,
        backgroundColor: BLACK,
        transform: [{ scale: 8 }],
    },
    small: { width: 16, height: 16 },
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
                description={{
                    checks: "FastImage.preload resolves with each source's result, in order: ok with its size for the ones that loaded, not ok with an error for the others.",
                    steps: 'Preloads six sources: a 200×200 photo, a url that 404s, an empty uri, null, a 120×120 photo the server only sends with the header x-token (given), and another that needs the header (not given). Passes when the results are 200x200, failed, failed, failed, 120x120, failed, and every failed one has an error.',
                    shows: 'An empty gray square: the case only preloads.',
                }}
            />
        </View>
    )
}

// Preloads sources with a cache or priority value Fast Image doesn't know
// (React Native's cache: 'reload', a number): each loads with the default.
// Android threw for them.
const PRELOAD_UNKNOWN_RUN = `unknown-values=${RUN}`
function PreloadUnknownValuesCase() {
    const [status, setStatus] = useState('waiting')
    useEffect(() => {
        FastImage.preload(
            [
                { cache: 'reload' },
                { priority: 'urgent' },
                { cache: 1, priority: true },
            ].map((values, i) => ({
                uri: imageUrl(
                    `picsum/1025-200x200.jpg?${PRELOAD_UNKNOWN_RUN}&n=${i}`,
                ),
                ...values,
            })) as unknown as Source[],
        ).then(
            (results) => {
                const got = results
                    .map((r) => (r.ok ? `${r.width}x${r.height}` : 'failed'))
                    .join(', ')
                const expected = '200x200, 200x200, 200x200'
                setStatus(got === expected ? 'OK' : got)
            },
            (error) => setStatus(`rejected: ${error}`),
        )
    }, [])
    return (
        <View style={styles.row}>
            <View style={styles.image} />
            <CaseStatus
                id="preload-unknown-values"
                status={status}
                description={{
                    checks: "FastImage.preload loads sources with a cache or priority value Fast Image doesn't know, with the default (Android threw for them).",
                    steps: "Preloads the photo three times (three urls) with cache: 'reload', priority: 'urgent', and cache: 1 with priority: true. Passes when all three resolve ok with 200x200.",
                    shows: 'An empty gray square: the case only preloads.',
                }}
            />
        </View>
    )
}

// preload with a url string (or a number) where a source object goes, e.g.
// preload(['https://…']) instead of preload([{ uri }]): the entry resolves not
// ok, as a source without a uri, in its place among the results. Native read
// it as a source, which crashed the app: iOS sent it an unrecognized selector,
// Android cast it to a map. In their own group near the end (a crash ends the
// run).
const NON_OBJECT_URL = imageUrl(`picsum/1025-200x200.jpg?non-object=${RUN}`)
function PreloadNonObjectCase() {
    const [status, setStatus] = useState('waiting')
    useEffect(() => {
        Promise.resolve()
            .then(() =>
                FastImage.preload([
                    NON_OBJECT_URL as unknown as Source,
                    { uri: NON_OBJECT_URL },
                    42 as unknown as Source,
                ]),
            )
            .then((results) => {
                const got = results
                    .map((r) =>
                        r.ok
                            ? `${r.width}x${r.height}`
                            : `${r.error}${r.uri === undefined ? '' : ` (${r.uri})`}`,
                    )
                    .join(', ')
                const noUri = 'Invalid source: no uri'
                setStatus(got === `${noUri}, 200x200, ${noUri}` ? 'OK' : got)
            })
            .catch((e) => setStatus(`error: ${e}`))
    }, [])
    return (
        <View style={styles.row}>
            <View style={styles.image} />
            <CaseStatus
                id="preload-non-object"
                status={status}
                description={{
                    checks: 'FastImage.preload with a url string or a number where a source object goes resolves that entry not ok, in its place among the results (#592: native read it as a source and crashed the app: Android cast it to a map, iOS sent it an unrecognized selector).',
                    steps: "Preloads a url string, then { uri } with the same 200×200 photo, then the number 42. Passes when the results are, in order: not ok ('Invalid source: no uri'), ok at 200x200, not ok.",
                    shows: 'An empty gray square: no image is shown.',
                }}
            />
        </View>
    )
}

// The same for getCachePath and writeToCache: a url string instead of a source
// resolves not ok.
function CachePathNonObjectCase({ write }: { write?: boolean }) {
    const [status, setStatus] = useState('waiting')
    useEffect(() => {
        const source = NON_OBJECT_URL as unknown as Source
        Promise.resolve()
            .then(() =>
                write
                    ? FastImage.writeToCache(source, '/does-not-exist.jpg')
                    : FastImage.getCachePath(source),
            )
            .then((result) =>
                setStatus(
                    !result.ok && result.error
                        ? 'OK'
                        : `resolved ${JSON.stringify(result)}`,
                ),
            )
            .catch((e) => setStatus(`error: ${e}`))
    }, [write])
    const name = write ? 'writeToCache' : 'getCachePath'
    return (
        <View style={styles.row}>
            <View style={styles.image} />
            <CaseStatus
                id={
                    write
                        ? 'write-to-cache-non-object'
                        : 'cache-path-non-object'
                }
                status={status}
                description={{
                    checks: `FastImage.${name} with a url string where a source object goes resolves not ok with an error (native read it as a source and crashed the app).`,
                    steps: write
                        ? "Calls FastImage.writeToCache with a url string as the source and a file path that doesn't exist. Passes when it resolves { ok: false } with an error."
                        : 'Calls FastImage.getCachePath with a url string as the source. Passes when it resolves { ok: false } with an error.',
                    shows: 'An empty gray square: no image is shown.',
                }}
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
                description={{
                    checks: "FastImage.preload loads a few sources at a time (3, or SDWebImagePrefetcher's limit on iOS), so a long list doesn't hold up the images the app shows.",
                    steps: 'Preloads four images from the slow server (about a second each), then asks the server how many it was sending at the same time. Passes when all four loaded, from four requests, with at most 3 at once (without the limit, both platforms load all 4 at once).',
                    shows: 'An empty gray square: the case only preloads.',
                }}
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
                objectFit="cover"
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
                description={{
                    checks: "An image in a view that gets taller after it has loaded looks like React Native's Image next to it (#983: Android showed a zoomed-in slice, since Glide had cropped the image for the first size).",
                    steps: "Loads a 600×1200 image of 12 px black and white vertical stripes with objectFit cover in a 96×16 view, next to React Native's Image with resizeMode cover; 300 ms after onLoad, both views become 96×96. Passes 1 s later.",
                    shows: 'Two identical squares of thin black and white vertical stripes. Wider stripes on the left (zoomed in) are the bug.',
                }}
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
        marginTop: 8,
        marginBottom: 12,
    },
    fill: {
        flex: 1,
    },
    liveStatus: {
        color: '#666',
        marginLeft: 12,
    },
    details: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
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
                description={{
                    checks: 'FastImageBackground: the image fills the view behind its children, with imageStyle applied to the image.',
                    steps: 'Shows a 120×120 photo in a 96×48 FastImageBackground (cover, the default) with imageStyle={{ borderRadius: 8 }} and a Text child. Passes on onLoad; the rest is checked by the screenshot.',
                    shows: 'A wide photo of a bear on rocks, cropped to fill the view, with rounded corners and "on top" in bold white text across its middle.',
                }}
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
    description: Description
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
    description: Description
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

// A GIF without a loop count, recorded from when it's shown (a video sample):
// it plays once, magenta then cyan, and stops on cyan. Android looped every
// GIF forever (#651), showing magenta again. The screenshot alone can't tell:
// it's taken once the group is done, which can be on a looping GIF's cyan.
// A url of its own each time it mounts: a GIF from the memory cache can be
// drawn at once, or already stopped on its last frame, so the sample wouldn't
// see it play.
function GifLoopOnceCase() {
    const id = 'gif-loop-once'
    const [uri] = useState(() =>
        imageUrl(`loop-once.gif?loop-once=${RUN}-${Date.now()}`),
    )
    const sample = useContext(SampleContext)
    const view = useRef<React.ComponentRef<typeof View>>(null)
    const started = useRef(false)
    const done = useRef(() => {})
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
    useEffect(() => () => clearTimeout(timer.current), [])
    const [shown, setShown] = useState(false)
    const [status, setStatus] = useState('waiting')
    const expect = [BLANK, MAGENTA, CYAN]
    const record = async () => {
        const area = await measureView(view.current)
        if (!area) return setStatus('not on screen')
        setStatus('recording')
        const result = await sample(
            {
                name: id,
                area,
                // At most: it's done 2.4 s after onLoad.
                durationMs: 10000,
                expect,
                palette: [MAGENTA, BLANK, CYAN],
            },
            (sampleDone) => {
                done.current = sampleDone
                setShown(true)
            },
        )
        setStatus(sampleStatus(result, expect))
    }
    return (
        <View style={styles.row}>
            <View
                ref={view}
                collapsable={false}
                style={styles.image}
                onLayout={() => {
                    if (started.current) return
                    started.current = true
                    record().catch((e) => setStatus(`error: ${e}`))
                }}
            >
                {shown ? (
                    <FastImage
                        style={styles.image}
                        source={{ uri }}
                        onLoad={() => {
                            clearTimeout(timer.current)
                            // Three plays' worth: a looping GIF shows magenta
                            // again after one.
                            timer.current = setTimeout(
                                () => done.current(),
                                3 * GIF_PLAY,
                            )
                        }}
                    />
                ) : null}
            </View>
            <CaseStatus
                id={id}
                status={status}
                description={{
                    checks: 'A GIF without a loop count plays once and stops on its last frame (#651: Android looped every GIF forever).',
                    steps: 'A video sample: the screen is recorded while the case shows a GIF of two 0.4 s frames, magenta then cyan, with no loop count and no loop prop, until 2.4 s after onLoad; the color in the middle of the view must go from gray to magenta to cyan, and stay cyan.',
                    shows: 'A cyan square: the last frame. In the recording: gray, magenta, cyan; magenta again after cyan means it looped.',
                }}
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
    // An animated WebP's or AVIF's descriptions name it; the GIF's are as
    // they were.
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
                        ? {
                              checks: `paused, then paused={false}, with loop={false}${kind}: the image plays once and stops on its last frame.`,
                              steps: "Loads an image that loops forever by itself (red, then blue, 400 ms each) with paused and loop={false}. A play's length (0.8 s) after onLoad, it sets paused={false}. Passes a play (and a margin) later.",
                              shows: "A blue square (the last frame); red would mean resuming didn't play it.",
                          }
                        : {
                              checks: `paused: ${kind ? `an image${kind}` : 'a GIF'} that loops forever by itself stays on its first frame.`,
                              steps: "Loads the image (red, then blue, 400 ms each, looping) with paused. Passes a play's length (0.8 s) after onLoad.",
                              shows: 'A red square (the first frame); blue would mean it played.',
                          }
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
                description={{
                    checks: "A GIF that has finished its one play, paused and then resumed, plays again from the start, on both platforms (as iOS's player does).",
                    steps: 'Loads a GIF that plays once: 1.5 s red, then 0.1 s blue. 2.2 s after onLoad (its play is over) sets paused, and 0.2 s later unpauses it. Passes 0.3 s later, while it shows its first frame again.',
                    shows: "A red square (a slightly darker red than the paused case's): the first frame, playing again. Blue means it didn't play again.",
                }}
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
                description={{
                    checks: 'loop changed from false to true after the GIF has stopped plays it again, and it keeps looping.',
                    steps: "Loads a GIF that loops forever by itself, orange then purple, with loop={false}; 1.4 s after onLoad (it has stopped on purple), sets loop to true. Passes 0.4 s later if the app hasn't crashed.",
                    shows: "An orange or purple square: it's animated, so it's not compared.",
                }}
            />
        </View>
    )
}

// The animated WebP that loops forever by itself, with loop={false} first
// (it plays once and stops on blue), then without loop: on the same view
// (loop unset), or on another view once the first has switched to another
// image (remount: on Android the second view can then show the drawable the
// first one had, which a view that's gone keeps). Either way it loops forever
// again, as the file says, rather than keeping the other loop: recorded once a
// play has passed, it's still animating (red and blue), not stopped on blue.
// Its own url, so no other case's view shows the same drawable. Masked: it's
// animating.
function WebpLoopUnsetCase({
    id,
    remount,
    description,
}: {
    id: string
    remount?: boolean
    description: Description
}) {
    const sample = useContext(SampleContext)
    const view = useRef<React.ComponentRef<typeof View>>(null)
    const [stage, setStage] = useState<'first' | 'switched' | 'second'>('first')
    const [status, setStatus] = useState('waiting')
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
    useEffect(() => () => clearTimeout(timer.current), [])
    const record = () => {
        timer.current = setTimeout(async () => {
            const area = await measureView(view.current)
            if (!area) return setStatus('not on screen')
            setStatus('recording')
            const { seen, detail } = await sample(
                {
                    name: id,
                    area,
                    durationMs: 3000,
                    expect: [RED, BLUE],
                    palette: [RED, BLUE, BLANK],
                },
                (done) => setTimeout(done, 2000),
            )
            setStatus(
                seen.includes(RED) && seen.includes(BLUE)
                    ? 'OK'
                    : (detail ??
                          `saw ${seen.join(', ') || 'nothing'}, expected it to keep looping`),
            )
        }, GIF_PLAY + GIF_MARGIN)
    }
    const onLoad = () => {
        clearTimeout(timer.current)
        if (stage === 'second') {
            if (remount) record()
            return
        }
        if (stage === 'switched') {
            // It shows the other image now: then the second view.
            timer.current = setTimeout(() => setStage('second'), 300)
            return
        }
        timer.current = setTimeout(() => {
            if (!remount) {
                setStage('second')
                record()
                return
            }
            setStage('switched')
        }, GIF_PLAY + GIF_MARGIN)
    }
    return (
        <View style={styles.row}>
            <Masked>
                <View ref={view} collapsable={false} style={styles.image}>
                    <FastImage
                        key={stage === 'second' && remount ? 'second' : 'first'}
                        style={styles.image}
                        loop={stage === 'second' ? undefined : false}
                        source={{
                            uri: imageUrl(
                                stage === 'switched'
                                    ? 'quadrants.png'
                                    : `formats/animated.webp?${id}=${RUN}`,
                            ),
                        }}
                        onLoad={onLoad}
                    />
                </View>
            </Masked>
            <CaseStatus id={id} status={status} description={description} />
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
                description={{
                    checks: "onError's error says what went wrong (#200: onError had no details).",
                    steps: "Loads a url the image server answers with a 404. Passes when onError's error contains '404'.",
                    shows: 'An empty gray square: the image never loads.',
                }}
            />
        </View>
    )
}

// imageRendering: a case per image, each shown at its own size (one image
// pixel per screen pixel, cropped to a strip; not the page of text, whose
// strip would only show part of its first line), then drawn in each mode,
// left to right: auto, smooth, pixelated. Checked by the screenshot. Shrunk with
// auto or pixelated, the stripes and the text lose detail, differently on
// each platform (they drop different pixels). smooth is iOS only (the same as
// auto on Android).
const RENDERING_MODES = ['auto', 'smooth', 'pixelated'] as const
const RENDERING_CASES: {
    id: string
    image: string
    size: { width: number; height: number }
    drawn: { width: number; height: number }
    // Without the strip of it at its own size.
    noOriginal?: boolean
    description: Description
}[] = [
    {
        id: 'image-rendering-stripes',
        image: 'stripes.png',
        size: { width: 1024, height: 1024 },
        drawn: { width: 48, height: 48 },
        description: {
            checks: 'imageRendering on an image drawn much smaller than its size: smooth (iOS only; the same as auto on Android) averages its pixels.',
            steps: 'Shows 1024 px black and white stripes, 1 px each, at their own size (a 200×24 strip of them), then drawn at 48 points with imageRendering auto, smooth and pixelated, from the full image (downsample={false}). Passes when the three have loaded; the screenshot does the checking.',
            shows: 'A strip of fine stripes, then three squares, left to right auto, smooth and pixelated. On iOS smooth is an even gray (#445), and auto and pixelated show uneven stripes; on Android all three show wide, even bands (moiré): soft gray in auto and smooth, sharp black and white in pixelated.',
        },
    },
    {
        id: 'image-rendering-text',
        image: 'text-page.png',
        size: { width: 1600, height: 1000 },
        drawn: { width: 96, height: 64 },
        noOriginal: true,
        description: {
            checks: 'imageRendering on a page of small text drawn much smaller than its size: smooth (iOS only; the same as auto on Android) keeps the lines of text continuous.',
            steps: 'Draws a 1600×1000 page of small text at 96×64 points with imageRendering auto, smooth and pixelated, from the full image (downsample={false}). Passes when the three have loaded; the screenshot does the checking.',
            shows: 'The page three times, left to right auto, smooth and pixelated. On iOS smooth has continuous gray lines of text, and auto and pixelated broken ones; on Android all three are broken up.',
        },
    },
    {
        id: 'image-rendering-pixel-art',
        image: 'sprite-12.png',
        size: { width: 12, height: 12 },
        drawn: { width: 64, height: 64 },
        description: {
            checks: 'imageRendering on an image drawn larger than its size: pixelated keeps its pixels sharp (#926).',
            steps: 'Shows 12 px pixel art at its own size, then drawn at 64 points with imageRendering auto, smooth and pixelated. Passes when the three have loaded; the screenshot does the checking.',
            shows: 'A tiny sprite, then three large ones, left to right auto, smooth and pixelated: auto and smooth blurred, pixelated with sharp square pixels.',
        },
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

function ImageRenderingCase({
    id,
    image,
    size,
    drawn,
    noOriginal,
    description,
}: (typeof RENDERING_CASES)[number]) {
    const [loads, setLoads] = useState(0)
    const onLoad = () => setLoads((n) => n + 1)
    const total = RENDERING_MODES.length
    return (
        <View style={renderingStyles.case}>
            {noOriginal ? null : <OriginalCrop image={image} size={size} />}
            <View style={renderingStyles.modes}>
                {RENDERING_MODES.map((mode, i) => (
                    <FastImage
                        key={mode}
                        style={[drawn, i > 0 && styles.gap]}
                        source={{ uri: imageUrl(image) }}
                        imageRendering={mode}
                        // Drawn from the full image, not one decoded smaller
                        // (downsample).
                        downsample={false}
                        onLoad={onLoad}
                    />
                ))}
            </View>
            <CaseStatus
                id={id}
                status={loads >= total ? 'OK' : `loaded ${loads}/${total}`}
                description={description}
            />
        </View>
    )
}

// imageRendering changed after the image has loaded: from pixelated, which
// iOS leaves where the content mode puts it (on a half pixel here: a page
// decoded at the view's size with cover, an odd number of pixels cropped
// off), to auto, which it then moves onto whole pixels, as if auto from the
// start (the right view).
function ImageRenderingChangeCase() {
    const [loads, setLoads] = useState(0)
    const onLoad = () => setLoads((n) => n + 1)
    const rendering = loads >= 2 ? 'auto' : 'pixelated'
    return (
        <View style={styles.row}>
            <FastImage
                style={downsampleStyles.tall}
                source={{ uri: imageUrl('text-page.png') }}
                imageRendering={rendering}
                downsample
                onLoad={onLoad}
            />
            <FastImage
                style={[downsampleStyles.tall, styles.gap]}
                source={{ uri: imageUrl('text-page.png') }}
                downsample
                onLoad={onLoad}
            />
            <CaseStatus
                id="image-rendering-change"
                status={rendering === 'auto' ? 'OK' : `loaded ${loads}/2`}
                description={{
                    checks: 'imageRendering changed after load, from pixelated to auto: on iOS the image moves onto whole pixels then, as sharp as auto from the start.',
                    steps: 'Loads a 1600x1000 page of text into two 40x96 views with downsample and cover: the left with imageRendering="pixelated", changed to auto once both have loaded, the right with auto. Passes once it has changed; the screenshot does the checking.',
                    shows: 'Two tall crops of the middle of the page, the same and both sharp. A blurry left one is a failure.',
                }}
            />
        </View>
    )
}

const renderingStyles = StyleSheet.create({
    case: { marginBottom: 16 },
    original: {
        width: 200,
        height: 24,
        overflow: 'hidden',
        backgroundColor: '#eee',
        marginBottom: 8,
    },
    modes: { flexDirection: 'row' },
})

// Shows status OK once `total` images have loaded (count with the returned
// onLoad), and a moment more, for the blur, which is applied after the load.
function useLoadedThenOk(total: number, wait = 500) {
    const [loads, setLoads] = useState(0)
    const [done, setDone] = useState(false)
    useEffect(() => {
        if (loads < total) return
        const timer = setTimeout(() => setDone(true), wait)
        return () => clearTimeout(timer)
    }, [loads, total, wait])
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
            <CaseStatus
                id="blur"
                status={status}
                description={{
                    checks: "blurRadius is in points: blurRadius={6} looks about the same as React Native's Image on iOS, and the same from a large file and a small one, since the image is blurred at the size it's shown at. The blurred views don't change an unblurred one of the same file.",
                    steps: "Four 64 dp squares: FastImage with a 1024 px photo, no blur; React Native's Image with the same photo and blurRadius={6}; FastImage with the same photo and blurRadius={6}; FastImage with a 256 px file of the photo and blurRadius={6}. Passes 0.5 s after all four have loaded.",
                    shows: "A sharp photo of green cliffs, then three blurred alike. On Android the second (React Native's Image) is nearly sharp: it blurs in the file's pixels, and this file is large.",
                }}
            />
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
                objectFit="contain"
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
                description={{
                    checks: 'blurRadius on other kinds of image: a bundled image, a tinted one, and a GIF, which shows its first frame, blurred and still.',
                    steps: 'Shows a bundled photo with blurRadius={6}; the logo with tintColor green, blurRadius={4} and objectFit="contain"; a jellyfish GIF with blurRadius={6}. Passes 0.5 s after all three have loaded.',
                    shows: "A blurred aerial photo of fields; a soft green React logo on gray; the jellyfish's first frame, blurred and not moving (a pink and orange blur on blue).",
                }}
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
                objectFit="contain"
                source={{ uri: LOGO }}
                tintColor={changed ? '#9324c3' : 'green'}
                blurRadius={4}
                onLoad={onLoad}
            />
            <FastImage
                style={[blurStyles.image, blurStyles.next]}
                objectFit="contain"
                source={{ uri: LOGO }}
                tintColor="#9324c3"
                blurRadius={4}
                onLoad={onLoad}
            />
            <CaseStatus
                id="blur-tint-change"
                status={done ? 'OK' : 'loading'}
                description={{
                    checks: 'tintColor changed on a blurred image after it has loaded shows the new color, blurred, like an image tinted that color from the start (iOS shows it without blurring the image again).',
                    steps: 'Loads the logo twice with blurRadius={4} and objectFit="contain": the left with tintColor green, changed to purple (#9324c3) 300 ms after both have loaded; the right purple from the start. Passes 500 ms after the change.',
                    shows: 'Two identical blurred purple React logos on gray. A green or sharp left one is the bug.',
                }}
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
            <CaseStatus
                id="blur-change"
                status={
                    late.length > 0
                        ? `fired again: ${late.join(', ')}`
                        : done
                          ? 'OK'
                          : 'waiting'
                }
                description={{
                    checks: "blurRadius changed once the image has loaded blurs or unblurs the image that's showing, without load events (Android loaded the image again, with its events).",
                    steps: 'Four photos of a pug: the first loads with blurRadius 0, set to 6 after its onLoadEnd; the second has 6 from the start; the third loads with 6, set to 0 after its onLoadEnd; the fourth has no blur. Fails if onLoadStart, onProgress, onLoad or onLoadEnd fires on the first or third after that; passes 1.5 s after both changes.',
                    shows: 'Two pugs blurred alike, a gap, then two sharp ones alike.',
                }}
            />
        </View>
    )
}

// blurRadius changed in steps once the image has loaded (after onLoadEnd, the
// load's last event): `interval` ms apart, or without one in renders one after
// the other (before the next frame), as an animated blur or a slider changes
// it. It's the image that's showing, so no load events fire again, and it ends
// up like the image next to it, blurred with the last step's radius from the
// start. With `progress`, the load must send onProgress first. Android loads
// the image that's showing again for each new blur, without events (from
// Glide's cache, or for `cache: 'web'` through the HTTP cache); a change while
// that was loading started the image's load again, which sent onLoad,
// onLoadEnd and, if it downloaded the image, onProgress.
function BlurStepsCase({
    id,
    description,
    source,
    steps,
    interval,
    progress = false,
}: {
    id: string
    description: Description
    source: Source
    steps: number[]
    interval?: number
    progress?: boolean
}) {
    const [step, setStep] = useState(-1)
    const [done, setDone] = useState(false)
    const [progressed, setProgressed] = useState(false)
    const [late, handlers] = useLateEvents(() => setStep(0))
    const last = step === steps.length - 1
    // Without an interval, each step renders right after the one before
    // (before the next frame): each is its own commit, so the view gets each
    // blurRadius.
    useLayoutEffect(() => {
        if (interval === undefined && step >= 0 && !last) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setStep(step + 1)
        }
    }, [interval, step, last])
    useEffect(() => {
        if (step < 0 || (interval === undefined && !last)) return
        // After the last step, long enough for a download from the slow
        // server (about 2 s) to end.
        const timer = last
            ? setTimeout(() => setDone(true), 4000)
            : setTimeout(() => setStep(step + 1), interval)
        return () => clearTimeout(timer)
    }, [step, last, interval])
    return (
        <View style={blurStyles.stacked}>
            <View style={blurStyles.images}>
                <FastImage
                    style={blurStyles.image}
                    source={source}
                    blurRadius={step < 0 ? 0 : steps[step]}
                    {...handlers}
                    onProgress={() => {
                        if (step < 0) setProgressed(true)
                        handlers.onProgress()
                    }}
                />
                <FastImage
                    style={[blurStyles.image, blurStyles.next]}
                    source={{ uri: PRELOAD }}
                    blurRadius={steps[steps.length - 1]}
                />
            </View>
            <CaseStatus
                id={id}
                status={
                    late.length > 0
                        ? `fired again: ${late.join(', ')}`
                        : !done
                          ? 'waiting'
                          : progress && !progressed
                            ? 'no onProgress before onLoad'
                            : 'OK'
                }
                description={description}
            />
        </View>
    )
}

// A `cache: 'web'` image from the slow server, which sends it without cache
// headers, so each load of it downloads it again (in about 2 s).
const BLUR_TWICE_SOURCE = {
    uri: slowImageUrl(`picsum/1025-200x200.jpg?blur-twice=${RUN}&delay=300`),
    headers: SLOW_HEADERS,
    cache: 'web' as const,
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
                description={{
                    checks: "blurRadius doesn't blur defaultSource, as with React Native's Image.",
                    steps: 'Loads a url the image server answers with a 404, with a bundled defaultSource and blurRadius={6}. Passes on onError.',
                    shows: 'The defaultSource, sharp: on iOS an aerial photo of fields, on Android a gray square with a short black line near the bottom.',
                }}
            />
        </View>
    )
}

const blurStyles = StyleSheet.create({
    image: { width: 64, height: 64, backgroundColor: '#eee' },
    large: { width: 144, height: 144, backgroundColor: '#eee' },
    next: { marginLeft: 8 },
    gap: { marginLeft: 16 },
    // The images, then the status under them, in one view: the runner
    // measures the view a CaseStatus is in as its case's area.
    stacked: { marginBottom: 12 },
    images: { flexDirection: 'row', marginBottom: 8 },
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
    objectFit = 'cover',
}: {
    id: string
    description: Description
    image: string
    size: string
    style: { width: number; height: number }
    objectFit?: FastImageProps['objectFit']
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
                objectFit={objectFit}
                source={{ uri: imageUrl(image) }}
                downsample
                onLoad={onLoad}
            />
            <FastImage
                style={[style, styles.gap]}
                objectFit={objectFit}
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
function DownsampleDetailCase() {
    // A url of its own each time it mounts, so the runner's retry counts its
    // own requests.
    const [detailPath] = useState(
        () => `/picsum/1016-2048x2048.jpg?downsample=${RUN}-${Date.now()}`,
    )
    const [loads, setLoads] = useState(0)
    const [requests, setRequests] = useState<number>()
    useEffect(() => {
        if (loads !== 2) return
        fetch(imageUrl(`requests?path=${encodeURIComponent(detailPath)}`))
            .then((response) => response.json())
            .then((json) => setRequests(json.count))
            .catch(() => setRequests(-1))
    }, [loads, detailPath])
    const source = { uri: imageUrl(detailPath.slice(1)) }
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
                description={{
                    checks: 'downsample: a larger view of an image already shown smaller decodes it again at its own size, from the disk cache, without downloading it again.',
                    steps: 'Loads a 2048x2048 photo (a url of its own) into a 48-point view with downsample; once it loads, a 96-point view of the same url mounts. Once both have loaded, asks the image server how many times the url was requested: passes at once.',
                    shows: 'A photo of orange rocks under a cloudy sky, small, then larger and sharp. A blurry larger photo is a failure.',
                }}
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
                description={{
                    checks: 'downsample: a view that grows after its image loaded decodes it again for the new size, without sending the load events again.',
                    steps: 'Loads a 1600x1000 page of text into a 48-point view with downsample; 300 ms after onLoad the view grows to 96 points. Passes a second later if onLoadStart and onLoad fired once each.',
                    shows: 'A 96-point crop of the middle of the page, the text sharp. Blurry text (the small decode enlarged) is a failure.',
                }}
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
                description={{
                    checks: 'downsample: an image in a view with no size until it loads (sized from onLoad) still loads.',
                    steps: 'Loads a 600x300 photo with downsample and no style, inside a 48-point gray square; onLoad sizes it 48 wide and 24 tall. Passes once it has been laid out with a width.',
                    shows: 'A photo of green hills across the top half of the gray square, gray below. An empty gray square is a failure.',
                }}
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
function DownsamplePreloadingCase() {
    // A url and request group of their own each time it mounts, so the
    // runner's retry counts its own requests.
    const [preloadingGroup] = useState(
        () => `downsample-preloading-${RUN}-${Date.now()}`,
    )
    const [preloading] = useState(() => ({
        uri: slowImageUrl(`text-page.png?delay=120&group=${preloadingGroup}`),
        headers: { 'x-token': 'fast-image' },
    }))
    const [size, setSize] = useState<string>()
    const [requests, setRequests] = useState<number>()
    // The view loads once the server has the preload's request, so it
    // mounts while the preload is downloading (a preload that hasn't started
    // isn't waited for).
    const [shown, setShown] = useState(false)
    useEffect(() => {
        let cancelled = false
        FastImage.preload([preloading])
        ;(async () => {
            for (let i = 0; i < 100 && !cancelled; i++) {
                const response = await fetch(
                    imageUrl(`requests?group=${preloadingGroup}`),
                ).catch(() => undefined)
                const count = (await response?.json())?.count ?? 0
                if (count > 0) break
                await new Promise<void>((r) => setTimeout(r, 50))
            }
            if (!cancelled) setShown(true)
        })()
        return () => {
            cancelled = true
        }
    }, [preloading, preloadingGroup])
    return (
        <View style={styles.row}>
            {shown ? (
                <FastImage
                    style={downsampleStyles.tall}
                    source={preloading}
                    downsample
                    onLoad={(e) => {
                        setSize(
                            `${e.nativeEvent.width}x${e.nativeEvent.height}`,
                        )
                        fetch(imageUrl(`requests?group=${preloadingGroup}`))
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
                          : requests !== 1
                            ? `requested ${requests} times`
                            : 'OK'
                }
                description={{
                    checks: "downsample: a view of an image that's still being preloaded shares the preload's download, decodes it to cover the view (cropped, not stretched), and onLoad reports its full size (iOS downloaded it again).",
                    steps: 'Preloads a 1600x1000 page of text from the slow server (about a second); once the server has the request, a 40x96 view with downsample loads the same source. Passes when onLoad reports 1600x1000 and the server got one request.',
                    shows: 'A tall crop of the middle of the page, the text at its usual shape. Squashed text (the page stretched to the tall view) is a failure.',
                }}
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
                description={{
                    checks: 'downsample: an animated GIF loads and plays, and onLoad reports its own size.',
                    steps: 'Loads a 500x281 GIF of a jellyfish into a 32-point view with downsample. Passes when onLoad reports 500x281.',
                    shows: "The jellyfish cropped to the small square; animated, so it isn't compared.",
                }}
            />
        </View>
    )
}

// Images that are downsampled (so each view waits for its size) and not
// cached, mounted together: they start loading in the order the views are
// (left to right), which is the order they download in. iOS started them as
// UIKit laid the views out, last first. Only checked there: Android (which
// doesn't wait for the size) loads in another order; with or without
// downsample.
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
                description={{
                    checks: 'downsample: images mounted together start loading in the order of their views, left to right (iOS started them as UIKit laid the views out, last first).',
                    steps: 'Mounts six 32-point cells, each with an image filling it, of a 2048x2048 photo at six new urls, with downsample. Passes once all six have started and loaded, and, on iOS with the New Architecture, their onLoadStart events came left to right (Android loads in another order, so the order is only checked on iOS).',
                    shows: 'Six small copies of a photo of orange rocks under a cloudy sky, in a row.',
                }}
            />
        </View>
    )
}

// A view that downsamples an image from the disk cache, after a view showed
// it at full size, doesn't leave its smaller copy where full-size views look
// (iOS: it was in the memory cache under the full-size image's key). A page of
// text at full size (left), the same smaller (middle), then at full size
// again (right), which should be as sharp as the left one.
function DownsampleMemoryCase() {
    // Not shared with other cases, so this case decides what's cached.
    const uri = imageUrl('text-page.png?case=downsample-memory')
    const [step, setStep] = useState(0)
    const next = (to: number) => () => {
        // After the full-size image has been written to the disk cache.
        setTimeout(() => setStep((s) => Math.max(s, to)), 300)
    }
    return (
        <View style={styles.row}>
            <FastImage
                style={downsampleStyles.page}
                source={{ uri }}
                downsample={false}
                onLoad={next(1)}
            />
            {step >= 1 && (
                <FastImage
                    style={[downsampleStyles.small, styles.gap]}
                    source={{ uri }}
                    onLoad={next(2)}
                />
            )}
            {step >= 2 && (
                <FastImage
                    style={[downsampleStyles.page, styles.gap]}
                    source={{ uri }}
                    downsample={false}
                    onLoad={next(3)}
                />
            )}
            <CaseStatus
                id="downsample-memory"
                status={step >= 3 ? 'OK' : `step ${step}`}
                description={{
                    checks: "A view that downsamples an image from the disk cache, after a view showed it at full size, doesn't leave its smaller copy where full-size views look (iOS kept it in the memory cache under the full-size image's key).",
                    steps: 'Loads a 1600x1000 page of text into an 80x50 view with downsample={false}; 300 ms after it loads, a 32-point view of the same url (downsampled, from the disk cache); 300 ms after that, another 80x50 view with downsample={false}. Passes once the third has loaded; the screenshot checks its sharpness.',
                    shows: 'The whole page small, a 32-point crop of it, then the whole page again, as sharp as the first. A blurrier right page is a failure.',
                }}
            />
        </View>
    )
}

// The same for a preload after a view that downsamples loaded the image from
// the disk cache: the preload resolves with the image's own size, 1600x1000
// (iOS resolved with the smaller copy's).
function DownsamplePreloadCase() {
    const uri = imageUrl('text-page.png?case=downsample-preload')
    const [step, setStep] = useState(0)
    const [status, setStatus] = useState('step 0')
    const next = (to: number) => () => {
        // After the full-size image has been written to the disk cache.
        setTimeout(() => setStep((s) => Math.max(s, to)), 300)
    }
    useEffect(() => {
        if (step < 2) return
        FastImage.preload([{ uri }]).then(([result]) =>
            setStatus(
                result.ok && result.width === 1600 && result.height === 1000
                    ? 'OK'
                    : `preload resolved ${JSON.stringify(result)}`,
            ),
        )
    }, [step, uri])
    return (
        <View style={styles.row}>
            <FastImage
                style={downsampleStyles.page}
                source={{ uri }}
                downsample={false}
                onLoad={next(1)}
            />
            {step >= 1 && (
                <FastImage
                    style={[downsampleStyles.small, styles.gap]}
                    source={{ uri }}
                    onLoad={next(2)}
                />
            )}
            <CaseStatus
                id="downsample-preload"
                status={status}
                description={{
                    checks: "FastImage.preload, after a view downsampled the image from the disk cache, resolves with the image's own size (iOS resolved with the smaller copy's).",
                    steps: 'Loads a 1600x1000 page of text into an 80x50 view with downsample={false}; 300 ms after it loads, a 32-point view of the same url (downsampled); 300 ms after that, preloads the url. Passes when the preload resolves ok with 1600x1000.',
                    shows: 'The whole page small, then a 32-point crop of it.',
                }}
            />
        </View>
    )
}

// A view zoomed in on with a transform, as a pinch-to-zoom viewer does: a
// page of text (1600x1000) in an 80x50 view drawn 4 times larger, its top
// left corner showing. With downsample false (right) it's decoded at full
// size, so the text is sharp; downsampled (left), it's decoded at about the
// view's size, so it's enlarged and blurry. Android decoded both at about the
// view's size.
function DownsampleZoomCase() {
    const [status, onLoad] = useLoadedThenOk(2)
    const source = { uri: imageUrl('text-page.png?case=downsample-zoom') }
    return (
        <View style={blurStyles.stacked}>
            <DownsampleZoomPair source={source} onLoad={onLoad} />
            <CaseStatus
                id="downsample-zoom"
                status={status}
                description={{
                    checks: "downsample={false} decodes an image at full size, so a view zoomed in on with a transform (as a pinch-to-zoom viewer does) stays sharp (Android decoded it at about the view's size either way).",
                    steps: 'Loads a 1600x1000 page of text into two 80x50 views drawn 4 times larger with a transform, each clipped to a 140x88 area showing its top-left corner: the left with downsample (the default), the right with downsample={false}. Passes once both have loaded (and a moment more).',
                    shows: 'The first lines of the page, enlarged, twice: blurry on the left, sharp on the right. Blurry text on the right is a failure.',
                }}
            />
        </View>
    )
}

// An image over 64 megapixels (10000x8000), at full size, zoomed in on its
// top left corner, of a black block and 1-pixel stripes: with
// downsample={false} it's decoded at 16 megapixels (on iOS it was decoded at
// its own size, 320 MB), so the stripes average out, and with objectFit none
// at its own size on iOS (on Android at 16 megapixels too, which Android can
// still draw). The block shows that the image is drawn, and where: on Android
// the stripes come out white. onLoad and preload report its own size.
function DownsampleOverLimitCase() {
    const capped = imageUrl('block-stripes-80mp.png?case=downsample-over-limit')
    const [sizes, setSizes] = useState<string[]>([])
    const [preloaded, setPreloaded] = useState<string>()
    const onLoad = (e: { nativeEvent: { width: number; height: number } }) => {
        // Read now: the event is reused after the handler.
        const size = `${e.nativeEvent.width}x${e.nativeEvent.height}`
        setSizes((s) => [...s, size])
    }
    const expected = '10000x8000'
    const done = sizes.length >= 2 && preloaded !== undefined
    return (
        <View style={styles.row}>
            <View style={downsampleStyles.overLimit}>
                <FastImage
                    style={downsampleStyles.overLimitZoomed}
                    source={{ uri: capped }}
                    objectFit="fill"
                    downsample={false}
                    onLoad={(e) => {
                        onLoad(e)
                        // From the memory cache.
                        FastImage.preload([{ uri: capped }]).then(([result]) =>
                            setPreloaded(
                                result.ok
                                    ? `${result.width}x${result.height}`
                                    : result.error,
                            ),
                        )
                    }}
                />
            </View>
            <FastImage
                style={[downsampleStyles.overLimit, styles.gap]}
                source={{
                    uri: imageUrl(
                        'block-stripes-80mp.png?case=downsample-over-limit-none',
                    ),
                }}
                objectFit="none"
                objectPosition="left top"
                onLoad={onLoad}
            />
            <CaseStatus
                id="downsample-over-limit"
                status={
                    !done
                        ? 'waiting'
                        : sizes.every((s) => s === expected) &&
                            preloaded === expected
                          ? 'OK'
                          : `onLoad ${sizes.join(', ')}, preload ${preloaded}, expected ${expected}`
                }
                description={{
                    checks: 'An image over 64 megapixels is decoded at 16 megapixels with downsample={false}, and at its own size with objectFit none on iOS; onLoad and preload report its own size.',
                    steps: 'Loads a 10000x8000 image, white with a 32x64 black block and 1-pixel black and white stripes in its top left corner, into two 96x64 views, each showing that corner at 1 point per pixel: the left with downsample={false}, zoomed 125 times with a transform; the right with objectFit="none" and objectPosition="left top". Once the left one has loaded, preloads its url. Passes once both onLoad events and the preload report 10000x8000.',
                    shows: 'Two rectangles, each with a black block over its left third. On iOS the rest of the left one is gray (the stripes, decoded smaller, average out), and the right one has stripes 1 point wide, soft-edged (on tvOS dark and light gray). On Android the rest of both is white: it decodes both at 16 megapixels, keeping every other pixel of the PNG (the white stripes).',
                }}
            />
        </View>
    )
}

// A view much larger than the screen (2400x2400, about 6300 px square on the
// Android emulator), drawn 20 times smaller with a transform. Glide fits an
// image to the view's size, so the bitmap would be about 160 MB, which Android
// won't draw ("Canvas: trying to draw too large bitmap"): the app crashed.
function LargeViewCase() {
    const [status, onLoad] = useLoadedThenOk(1)
    return (
        <View style={blurStyles.stacked}>
            <View style={downsampleStyles.largeViewClip}>
                <FastImage
                    style={downsampleStyles.largeView}
                    source={{ uri: imageUrl('quadrants.png?case=large-view') }}
                    onLoad={onLoad}
                />
            </View>
            <CaseStatus
                id="large-view"
                status={status}
                description={{
                    checks: "An image in a view far larger than the screen shows (on Android its bitmap was the view's size, about 160 MB, and the app crashed drawing it).",
                    steps: 'Loads a 20x20 image of four colored squares into a 2400x2400 view with cover, drawn 20 times smaller with a transform. Passes once it has loaded (and a moment more).',
                    shows: 'A 120x120 square of four colors: red, green, blue and yellow quadrants. The app closing is a failure.',
                }}
            />
        </View>
    )
}

// The same view, cross-dissolving to a new source: the fade drew what the
// view showed into a bitmap the view's size (about 160 MB), which Android
// won't draw either.
function LargeViewFadeCase() {
    const [second, setSecond] = useState(false)
    const [status, onLoad] = useLoadedThenOk(2)
    return (
        <View style={blurStyles.stacked}>
            <View style={downsampleStyles.largeViewClip}>
                <FastImage
                    style={downsampleStyles.largeView}
                    source={{
                        uri: imageUrl(
                            second
                                ? 'quadrants.png?case=large-view-fade-2'
                                : 'quadrants.png?case=large-view-fade',
                        ),
                    }}
                    transition={{ duration: 300, betweenImages: true }}
                    onLoad={() => {
                        onLoad()
                        setSecond(true)
                    }}
                />
            </View>
            <CaseStatus
                id="large-view-fade"
                status={status}
                description={{
                    checks: "transition's betweenImages in a view far larger than the screen (on Android the fade copied what the view showed into a bitmap the view's size, about 160 MB, and the app crashed drawing it).",
                    steps: 'The large-view case, with transition { duration: 300, betweenImages: true }: once the image loads, its source changes to the same image at another url, which cross-dissolves from it. Passes once both have loaded (and a moment more).',
                    shows: 'A 120x120 square of four colors: red, green, blue and yellow quadrants. The app closing is a failure.',
                }}
            />
        </View>
    )
}

// The same view with a GIF: the view's own copy of its animation (see
// FastImageGif) cropped each frame to the view's size, about 160 MB.
function LargeViewGifCase() {
    const [status, onLoad] = useLoadedThenOk(1)
    return (
        <View style={blurStyles.stacked}>
            <View style={downsampleStyles.largeViewClip}>
                <FastImage
                    style={downsampleStyles.largeView}
                    source={{
                        uri: imageUrl('loop-once.gif?case=large-view-gif'),
                    }}
                    onLoad={onLoad}
                />
            </View>
            <CaseStatus
                id="large-view-gif"
                status={status}
                description={{
                    checks: "A GIF in a view far larger than the screen shows (on Android each frame was cropped to the view's size, about 160 MB, and the app crashed drawing it).",
                    steps: 'Loads an 80x80 GIF that plays once, magenta then cyan, into a 2400x2400 view with cover, drawn 20 times smaller with a transform. Passes once it has loaded (and a moment more).',
                    shows: 'A 120x120 cyan square. The app closing is a failure.',
                }}
            />
        </View>
    )
}

// The same view with a placeholder url, shown while the image comes from the
// slow server: the placeholder was loaded at the view's size, about 160 MB.
function LargeViewPlaceholderCase() {
    const [status, onLoad] = useLoadedThenOk(1)
    return (
        <View style={blurStyles.stacked}>
            <View style={downsampleStyles.largeViewClip}>
                <FastImage
                    style={downsampleStyles.largeView}
                    source={{
                        uri: slowImageUrl(
                            'quadrants.png?case=large-view-placeholder&delay=600',
                        ),
                        headers: SLOW_HEADERS,
                    }}
                    placeholder={{
                        uri: imageUrl('logo.png?case=large-view-placeholder'),
                    }}
                    onLoad={onLoad}
                />
            </View>
            <CaseStatus
                id="large-view-placeholder"
                status={status}
                description={{
                    checks: "A placeholder url in a view far larger than the screen shows while the image loads (on Android it was loaded at the view's size, about 160 MB, and the app crashed drawing it).",
                    steps: 'The large-view case, with the image from the slow server (about 4 s) and a placeholder url of the logo, which shows meanwhile. Passes once the image has loaded (and a moment more).',
                    shows: 'A 120x120 square of four colors: red, green, blue and yellow quadrants. The app closing is a failure.',
                }}
            />
        </View>
    )
}

// As DownsampleZoomCase, with the image on disk but not in memory (as after
// the app restarts), both views mounted together. The downsampled view's
// image, decoded from the disk cache, was put in memory under the full-size
// image's key while the full-size view's load was reading the same file, so
// the right one showed it, blurry. A url of its own each run, preloaded to
// disk only (memoryCache: false).
function DownsampleFromDiskCase() {
    const [uri] = useState(() =>
        imageUrl(`text-page.png?case=downsample-from-disk-${RUN}`),
    )
    const [preloaded, setPreloaded] = useState<PreloadResult>()
    const [status, onLoad] = useLoadedThenOk(2)
    useEffect(() => {
        FastImage.preload([{ uri, memoryCache: false }]).then(([r]) =>
            setPreloaded(r),
        )
    }, [uri])
    return (
        <View style={blurStyles.stacked}>
            <DownsampleZoomPair
                source={preloaded?.ok ? { uri } : undefined}
                onLoad={onLoad}
            />
            <CaseStatus
                id="downsample-from-disk"
                status={
                    preloaded && !preloaded.ok
                        ? `preload: ${preloaded.error}`
                        : status
                }
                description={{
                    checks: "downsample={false} decodes at full size an image that's on disk but not in memory (as after the app restarts) when a downsampled view of it mounts at the same time (the downsampled view's copy showed, blurry).",
                    steps: 'Preloads a 1600x1000 page of text to the disk cache only (memoryCache: false), then mounts two 80x50 views of it together, drawn 4 times larger with a transform and clipped to 140x88: the left with downsample, the right with downsample={false}. Passes once both have loaded (and a moment more).',
                    shows: 'The first lines of the page, enlarged, twice: blurry on the left, sharp on the right. Blurry text on the right is a failure.',
                }}
            />
        </View>
    )
}

// As downsample-over-limit, with one url in both views, on disk but not in
// memory, the objectFit none view mounted a moment after the other: while it
// read the file, the left view's decode at 16 megapixels went into memory
// under the url's key, where SDImageCache found it (it looks in memory again
// before it decodes), so the right view showed that, gray and at less than
// half its size. A url of its own each run, preloaded to disk only
// (memoryCache: false). Its work isn't counted (uncounted, see
// scripts/verify.mts): whether iOS decodes the right view's image at full
// size at once or loads it again after depends on timing.
function DownsampleOverLimitSharedCase() {
    const [uri] = useState(() =>
        imageUrl(
            `block-stripes-80mp.png?case=downsample-over-limit-shared-${RUN}&uncounted`,
        ),
    )
    const [preloaded, setPreloaded] = useState<PreloadResult>()
    const [second, setSecond] = useState(false)
    // On iOS the right view loads again after its onLoad, without events.
    const [status, onLoad] = useLoadedThenOk(2, 3000)
    useEffect(() => {
        FastImage.preload([{ uri, memoryCache: false }]).then(([r]) =>
            setPreloaded(r),
        )
    }, [uri])
    useEffect(() => {
        if (!preloaded?.ok) return
        const timer = setTimeout(() => setSecond(true), 100)
        return () => clearTimeout(timer)
    }, [preloaded])
    return (
        <View style={styles.row}>
            <View style={downsampleStyles.overLimit}>
                <FastImage
                    style={downsampleStyles.overLimitZoomed}
                    source={preloaded?.ok ? { uri } : undefined}
                    objectFit="fill"
                    downsample={false}
                    onLoad={onLoad}
                />
            </View>
            <FastImage
                style={[downsampleStyles.overLimit, styles.gap]}
                source={second ? { uri } : undefined}
                objectFit="none"
                objectPosition="left top"
                onLoad={onLoad}
            />
            <CaseStatus
                id="downsample-over-limit-shared"
                status={
                    preloaded && !preloaded.ok
                        ? `preload: ${preloaded.error}`
                        : status
                }
                description={{
                    checks: "objectFit none shows an image over 64 megapixels at its own size on iOS when another view of the url decodes it at 16 megapixels at the same time, from the disk cache (the other view's copy showed, at less than half its size).",
                    steps: 'Preloads the 10000x8000 striped image of downsample-over-limit to the disk cache only (memoryCache: false), then shows it in the same two views, the right one 100 ms after the left. Passes 3 s after both have loaded (on iOS the right one loads again, without events).',
                    shows: 'Two rectangles, each with a black block over its left third. On iOS the rest of the left one is gray (the stripes, decoded smaller, average out), and the right one has stripes 1 point wide, soft-edged (on tvOS dark and light gray). On Android the rest of both is white: it decodes both at 16 megapixels, keeping every other pixel of the PNG (the white stripes).',
                }}
            />
        </View>
    )
}

// The page's top-left corner zoomed in on, downsampled (left) and with
// downsample={false} (right).
function DownsampleZoomPair({
    source,
    onLoad,
}: {
    source: { uri: string } | undefined
    onLoad: () => void
}) {
    return (
        <View style={blurStyles.images}>
            {[true, false].map((downsample) => (
                <View
                    key={String(downsample)}
                    style={[
                        downsampleStyles.zoomClip,
                        !downsample && styles.gap,
                    ]}
                >
                    <FastImage
                        style={downsampleStyles.zoomed}
                        source={source}
                        downsample={downsample}
                        onLoad={onLoad}
                    />
                </View>
            ))}
        </View>
    )
}

const downsampleStyles = StyleSheet.create({
    page: { width: 80, height: 50 },
    large: { width: 96, height: 96, backgroundColor: '#eee' },
    stripes: { width: 48, height: 48 },
    small: { width: 32, height: 32, backgroundColor: '#eee' },
    fill: { flex: 1 },
    tall: { width: 40, height: 96 },
    rotated: { width: 64, height: 96 },
    overLimit: { width: 96, height: 64, overflow: 'hidden' },
    // Scaled 125 times about its center, so its top left corner is the
    // clip's: 1 point per pixel of the image. Its edges are whole pixels at
    // 2, 2.625 and 3 pixels per point: React Native rounds them to pixels,
    // which the scale would make tens of pixels (at 100 times, 100 x 80, the
    // width rounded to 262 pixels on Android moved the image 25).
    overLimitZoomed: {
        position: 'absolute',
        left: 4960,
        top: 3968,
        width: 80,
        height: 64,
        transform: [{ scale: 125 }],
    },
    zoomClip: {
        width: 140,
        height: 88,
        overflow: 'hidden',
        backgroundColor: '#eee',
    },
    largeViewClip: { width: 120, height: 120, overflow: 'hidden' },
    // Scaled about its center, so it fills the clip.
    largeView: {
        position: 'absolute',
        left: -1140,
        top: -1140,
        width: 2400,
        height: 2400,
        transform: [{ scale: 0.05 }],
    },
    // Scaled about its center, so it spans 320x200 from the clip's top left.
    zoomed: {
        position: 'absolute',
        left: 120,
        top: 75,
        width: 80,
        height: 50,
        transform: [{ scale: 4 }],
    },
})

// Photo library images (ph://, iOS, with SDWebImagePhotosPlugin, which
// FastImage includes): a photo from the simulator's library by its id, listed
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
    description: Description
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
                description={{
                    checks: 'A photo library photo shown again after FastImage.clearMemoryCache(), in a new view, still has its own size in onLoad, not the size it was decoded at (iOS reported the view-sized copy, which it had stored on disk as the photo).',
                    steps: "Finds a JPEG in the simulator's photo library and shows it (ph://) in a 48 pt view. On onLoad it checks the size, calls clearMemoryCache and shows the photo in a new view. Passes when the second onLoad also has the photo's own size.",
                    shows: 'The same photo as the JPEG row (a waterfall; the four colored quadrants on tvOS), cropped to fill the square.',
                }}
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
                description={{
                    checks: 'A GIF from the photo library (ph://) animates.',
                    steps: "Finds the GIF verify.mts adds to the simulator's library (red, then blue, 400 ms each, looping) and shows it with paused and loop={false}. On onLoad it starts recording and sets paused={false}, so it plays once.",
                    shows: 'A blue square (the last frame). Recorded: red, then blue.',
                }}
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
    description: Description
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

// Several sources (source as an array of sizes): the view loads the one whose
// size in pixels is closest to its own. Solid colors so the screenshot shows
// which: 100 px red, 300 px green, 900 px blue. Each case checks onLoad's
// size against the same rule worked out here for the view's size.
const SIZES = [100, 300, 900]
const SIZE_COLORS: Record<number, string> = {
    100: 'red',
    300: 'green',
    900: 'blue',
}
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

// With `border`, the view has borders that wide: it picks for the box inside
// them, where the image is drawn (Android picked for the whole view).
function SeveralSourcesCase({
    id,
    size,
    border = 0,
}: {
    id: string
    size: number
    border?: number
}) {
    const [status, setStatus] = useState('loading')
    const inner = size - 2 * border
    const expected = expectedSize(inner, inner)
    return (
        <View style={styles.row}>
            <FastImage
                style={{
                    width: size,
                    height: size,
                    borderWidth: border,
                    borderColor: '#000000',
                }}
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
                description={{
                    checks: `source as an array of sizes: the view loads the one whose size in pixels is closest to its own${border ? ', measured inside its borders, where the image is drawn (Android picked for the whole view)' : ''}.`,
                    steps: `Gives a ${size} pt view${border ? ` with ${border} pt black borders` : ''} three sources: 100, 300 and 900 px squares (red, green, blue). Passes when onLoad's width is ${expected} px, the closest to the ${border ? 'inner box' : 'view'} at this screen's scale.`,
                    shows: border
                        ? `A ${size} pt black square (the borders) with the ${SIZE_COLORS[expected]} ${expected} px image filling the box inside them.`
                        : `A ${size} pt ${SIZE_COLORS[expected]} square (the ${expected} px image); another color means it picked another size.`,
                }}
            />
        </View>
    )
}

// A require()d image as one of the sizes, at its file's size (48 px magenta),
// with a 300 px green one from the server: a 16 pt view picks the bundled one,
// a 120 pt view the green one.
function SeveralSourcesBundledCase({ id, size }: { id: string; size: number }) {
    const [status, setStatus] = useState('loading')
    const expected = size < 50 ? 48 : 300
    return (
        <View style={styles.row}>
            <FastImage
                style={{ width: size, height: size }}
                source={[
                    require('./images/magenta.png'),
                    {
                        uri: imageUrl(`sized-300.png?${id}=${RUN}`),
                        width: 300,
                        height: 300,
                    },
                ]}
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
                description={{
                    checks: "A require()d image among several sources counts at its file's size (48 px): the view loads whichever source is closest to its own size in pixels.",
                    steps: `Gives a ${size} pt view two sources: the bundled 48 px magenta square and a 300 px green one from the image server. Passes when onLoad's width is ${expected} px.`,
                    shows:
                        expected === 48
                            ? `A tiny ${size} pt magenta square (the bundled image).`
                            : `A ${size} pt green square (the 300 px image); magenta would mean it picked the bundled one.`,
                }}
            />
        </View>
    )
}

// Borders come after the image loaded: the box inside them is smaller, and the
// view loads the size that fits it (Android kept the source picked for the
// whole view).
function SeveralSourcesBorderChangeCase() {
    const size = 120
    const border = 30
    const [bordered, setBordered] = useState(false)
    const [status, setStatus] = useState('loading')
    const first = expectedSize(size, size)
    const expected = expectedSize(size - 2 * border, size - 2 * border)
    return (
        <View style={styles.row}>
            <FastImage
                style={{
                    width: size,
                    height: size,
                    borderWidth: bordered ? border : 0,
                    borderColor: '#000000',
                }}
                source={sizedSources('several-border-change')}
                onLoad={(e) => {
                    const { width } = e.nativeEvent
                    if (!bordered) {
                        if (width !== first) {
                            setStatus(
                                `picked ${width} px, expected ${first} px before the borders`,
                            )
                            return
                        }
                        setStatus('waiting for the borders')
                        setBordered(true)
                        return
                    }
                    setStatus(
                        width === expected
                            ? 'OK'
                            : `picked ${width} px with the borders, expected ${expected} px`,
                    )
                }}
                onError={(e) => setStatus(`error: ${e.nativeEvent.error}`)}
            />
            <CaseStatus
                id="several-border-change"
                status={status}
                description={{
                    checks: 'source as an array of sizes, with borders added after the image loaded: the view loads the size that fits the box inside them (Android kept the source picked for the whole view).',
                    steps: `Gives a ${size} pt view three sources: 100, 300 and 900 px squares (red, green, blue). Once it has loaded the ${first} px one, it gets ${border} pt black borders. Passes when the next onLoad has the ${expected} px one.`,
                    shows: `A ${size} pt black square (the borders) with the ${SIZE_COLORS[expected]} ${expected} px image filling the box inside them${first === expected ? '' : `; ${SIZE_COLORS[first]} would mean it kept the first pick`}.`,
                }}
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
                description={{
                    checks: 'source as an array of sizes: a view that grows after its image loaded loads the size that fits it better.',
                    steps: `Gives a ${small} pt view three sources: 100, 300 and 900 px squares (red, green, blue). Once it has loaded the ${expectedSize(small, small)} px one, the view grows to ${large} pt. Passes when the next onLoad has the ${expectedSize(large, large)} px one.`,
                    shows: `A ${large} pt ${SIZE_COLORS[expectedSize(large, large)]} square; ${SIZE_COLORS[expectedSize(small, small)]} would mean it kept the small view's pick.`,
                }}
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
                description={{
                    checks: 'An array of one source loads that source as it is (not picked by size), and a view with no size loads the largest of several.',
                    steps: 'Shows a 48 pt view with an array of just the 900 px blue source, and a 0×0 view with all three (100, 300, 900 px). Passes when both onLoads have 900 px.',
                    shows: 'A blue square (the one-source array); the 0×0 view takes no space.',
                }}
            />
        </View>
    )
}

// Image formats, for the tables in docs/formats.md. The samples in the image
// server's images/formats/ are the same picture in each format (red, green,
// blue and yellow quadrants, 80x80), and the animated ones are red, then blue,
// 400 ms each, looping. A case passes when the format does what `expected`
// says on this platform, so a change in what's supported fails it (and the
// tables need updating). Check the screenshot: four flat quadrants.
type FormatResult = 'loads' | 'fails'
function FormatCase({
    id,
    file,
    expected,
    size = 80,
    description,
}: {
    id: string
    file: string
    expected: FormatResult
    // The sample's size: 80x80, except where the format has fixed sizes.
    size?: number
    description: Description
}) {
    const [status, setStatus] = useState('waiting')
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                objectFit="contain"
                source={{ uri: imageUrl(`formats/${file}`) }}
                onLoad={(e) => {
                    const { width, height } = e.nativeEvent
                    setStatus(
                        expected === 'fails'
                            ? `loaded (${width}x${height}), expected it to fail`
                            : width === size && height === size
                              ? 'OK'
                              : `loaded at ${width}x${height}, expected ${size}x${size}`,
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
    imageProps,
}: {
    id: string
    file: string
    expected: AnimationResult
    description: Description
    imageProps?: Partial<FastImageProps>
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
                        {...imageProps}
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

// SVG images (SDWebImageSVGCoder on iOS and AndroidSVG on Android, which
// FastImage includes). onLoad has the SVG's own size (its width and height,
// or its viewBox's). Check the screenshot: flat colors, sharp edges.
function SvgCase({
    id,
    source,
    style,
    expected,
    objectFit,
    tintColor,
    downsample,
    description,
}: {
    id: string
    source: Source | number
    style: { width: number; height: number }
    expected: [number, number]
    objectFit?: FastImageProps['objectFit']
    tintColor?: string
    downsample?: boolean
    description: Description
}) {
    const [status, setStatus] = useState('loading')
    return (
        <View style={styles.row}>
            <FastImage
                style={[style, { backgroundColor: '#eee' }]}
                source={source}
                objectFit={objectFit}
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
                description={{
                    checks: 'An SVG shown large is drawn at its size, not scaled up from a small bitmap.',
                    steps: 'Loads the same 20×20 SVG (three thin black rings on white) in a 24 pt view and a 160 pt view. Passes when both have fired onLoad; the sharpness is checked by the screenshot.',
                    shows: 'Small rings, then the same rings at 160 pt: thin, sharp black circles on white. Blurry or thick edges on the large one would mean it was scaled up from a bitmap.',
                }}
            />
        </View>
    )
}

// getCachePath for a `cache: 'web'` image as the app's first FastImage call
// (the runner's first group, without views): on Android the HTTP cache of
// `web` images is set up when FastImage's Glide components are registered,
// which Glide 4.15+ does when its registry is first used (by a load), so it
// failed with "Glide isn't set up".
const START_WEB_PATH = `/max-age/picsum/1025-200x200.jpg?start-web=${RUN}`
function WebCachePathAtStartCase() {
    const [status, setStatus] = useState('waiting')
    useEffect(() => {
        FastImage.getCachePath({
            uri: imageUrl(START_WEB_PATH.slice(1)),
            cache: 'web',
        })
            .then((result) =>
                setStatus(result.ok ? 'OK' : `error: ${result.error}`),
            )
            .catch((e) => setStatus(`error: ${e}`))
    }, [])
    return (
        <View style={styles.row}>
            <View style={styles.image} />
            <CaseStatus
                id="cache-path-web-at-start"
                status={status}
                description={{
                    checks: "FastImage.getCachePath for a cache: 'web' image works as the app's first Fast Image call (Android failed, saying Glide isn't set up: the HTTP cache of web images was only set up once a view had loaded an image).",
                    steps: "With no image view on screen, calls FastImage.getCachePath with cache: 'web' for a photo the image server marks as cacheable for an hour (a new url each run), which downloads it into the HTTP cache. Passes when the result is ok.",
                    shows: 'An empty gray square: the case shows no image.',
                }}
            />
        </View>
    )
}

// An image in the app by its name (#410): on iOS in the example apps' asset
// catalogs, on Android a drawable (regression_quadrants, the 80x80
// quadrants), as React Native's Image takes. iOS made the name a file in the
// app's resources, which an asset catalog image isn't, so it didn't load.
function AppImageNameCase() {
    const [status, setStatus] = useState('loading')
    return (
        <View style={styles.row}>
            <FastImage
                style={styles.image}
                source={{ uri: 'regression_quadrants' }}
                onLoad={(e) => {
                    const { width, height } = e.nativeEvent
                    setStatus(
                        width === 80 && height === 80
                            ? 'OK'
                            : `loaded at ${width}x${height}, expected 80x80`,
                    )
                }}
                onError={(e) => setStatus(`error: ${e.nativeEvent.error}`)}
            />
            <CaseStatus
                id="app-image-name"
                status={status}
                description={{
                    checks: "An image in the app by its name (in the asset catalog on iOS, a drawable on Android) loads (#410: iOS looked for a file of that name in the app's resources, which an asset catalog image isn't, so it didn't load).",
                    steps: "Loads { uri: 'regression_quadrants' }. Passes when onLoad reports 80x80, the image's size.",
                    shows: 'The quadrants filling the square: red top left, green top right, blue bottom left, yellow bottom right.',
                }}
            />
        </View>
    )
}

// FastImage is a single native view (10.0): the View style props are the
// image's own, so each platform has to draw and clip them as the View around
// the image did. Checked by screenshot; each case reports OK once its images
// have loaded. The wide image (2:1) shows how each box crops it.
function ViewStyleCase({
    id,
    description,
    images,
}: {
    id: string
    description: Description
    images: FastImageProps[]
}) {
    const [loaded, setLoaded] = useState(0)
    return (
        <View style={styles.row}>
            {images.map((props, i) => (
                <FastImage
                    key={i}
                    source={{ uri: WIDE.uri }}
                    {...props}
                    style={[i > 0 && styles.gap, props.style]}
                    onLoad={() => setLoaded((n) => n + 1)}
                />
            ))}
            <CaseStatus
                id={id}
                status={loaded >= images.length ? 'OK' : 'waiting'}
                description={description}
            />
        </View>
    )
}

const viewStyles = StyleSheet.create({
    box: { width: 56, height: 56, backgroundColor: '#ddd' },
    wide: { width: 96, height: 56, backgroundColor: '#ddd' },
})

// A gradient background (experimental_backgroundImage) under a contained
// image (a wide one in a square box: the gradient shows above and below it),
// next to a View with the same gradient (right). Checked by screenshot.
// Android drew no gradient on FastImage's view.
const GRADIENT = 'linear-gradient(#ff0000, #0000ff)'
function GradientCase() {
    const [loaded, setLoaded] = useState(false)
    return (
        <View style={styles.row}>
            <FastImage
                style={[
                    viewStyles.box,
                    { experimental_backgroundImage: GRADIENT },
                ]}
                objectFit="contain"
                source={{ uri: WIDE.uri }}
                onLoad={() => setLoaded(true)}
            />
            <View
                style={[
                    viewStyles.box,
                    styles.gap,
                    { experimental_backgroundImage: GRADIENT },
                ]}
            />
            <CaseStatus
                id="style-gradient"
                status={loaded ? 'OK' : 'waiting'}
                description={{
                    checks: "A gradient background (experimental_backgroundImage) shows under a contained image, as on a View (Android drew no gradient on FastImage's view).",
                    steps: 'Loads the wide photo with objectFit="contain" in a square with experimental_backgroundImage linear-gradient(#ff0000, #0000ff), next to a View with the same gradient. Passes on onLoad.',
                    shows: "Left: the photo across the middle, with the gradient's red above it and blue below. Right: the whole gradient, red at the top to blue at the bottom.",
                }}
            />
        </View>
    )
}

// A border that goes away after the image loaded (left): the image fills the
// box again, as the one that never had a border (right). Checked by
// screenshot. Android kept the image it loaded for the smaller box inside the
// border, stretched.
const BORDER_CHANGE_URI = imageUrl(
    `picsum/1018-600x300.jpg?border-change=${RUN}`,
)
function BorderChangeCase() {
    const [borderTop, setBorderTop] = useState(40)
    const [status, setStatus] = useState('waiting')
    const onLoad = () => {
        setTimeout(() => {
            setBorderTop(0)
            setTimeout(() => setStatus('OK'), 1000)
        }, 100)
    }
    return (
        <View style={styles.row}>
            <FastImage
                style={[
                    viewStyles.wide,
                    { borderTopWidth: borderTop, borderColor: 'black' },
                ]}
                source={{ uri: BORDER_CHANGE_URI }}
                onLoad={borderTop === 40 ? onLoad : undefined}
            />
            <FastImage
                style={[viewStyles.wide, styles.gap]}
                source={{ uri: BORDER_CHANGE_URI }}
            />
            <CaseStatus
                id="style-border-change"
                status={status}
                description={{
                    checks: 'A border removed after the image has loaded: the image fills the box again (Android kept the image it had loaded for the smaller box inside the border, stretched).',
                    steps: 'Loads a 600×300 photo in two 96×56 boxes; the left one has a 40 dp black top border, removed 100 ms after onLoad. Passes 1 s later.',
                    shows: 'Two identical photos of green cliffs filling their boxes. A black band at the top of the left one, or the photo stretched, is the bug.',
                }}
            />
        </View>
    )
}

// An edge's border width that leaves the style after the image loaded, under a
// width for every edge (left): the edge falls back to that width, and the
// image is inside the borders, as with that width from the start (right).
// Checked by screenshot. A removed width reaches the view as NaN, which
// Android's border insets keep (React Native 0.83 to 0.87) instead of falling
// back, so the image was drawn over the left border.
const BORDER_REMOVED_URI = imageUrl(
    `picsum/1018-600x300.jpg?border-removed=${RUN}`,
)
function BorderRemovedCase() {
    const [border, setBorder] = useState(true)
    const [status, setStatus] = useState('waiting')
    const onLoad = () => {
        setTimeout(() => {
            setBorder(false)
            setTimeout(() => setStatus('OK'), 1000)
        }, 100)
    }
    return (
        <View style={styles.row}>
            <FastImage
                style={[
                    viewStyles.wide,
                    { borderWidth: 6, borderColor: 'black' },
                    border && { borderLeftWidth: 30 },
                ]}
                source={{ uri: BORDER_REMOVED_URI }}
                onLoad={border ? onLoad : undefined}
            />
            <FastImage
                style={[
                    viewStyles.wide,
                    styles.gap,
                    { borderWidth: 6, borderColor: 'black' },
                ]}
                source={{ uri: BORDER_REMOVED_URI }}
            />
            <CaseStatus
                id="style-border-removed"
                status={status}
                description={{
                    checks: "One edge's border width removed after the image has loaded, under a width for every edge: that edge falls back to the width for every edge, and the image stays inside the borders (on Android with React Native 0.83 to 0.87, the removed width reached the view as NaN and the image was drawn over the left border).",
                    steps: 'Loads a 600×300 photo in two 96×56 boxes with a 6 dp black border; the left one also has borderLeftWidth 30, removed 100 ms after onLoad. Passes 1 s later.',
                    shows: 'Two identical photos inside even 6 dp black borders. A thick left border, or the photo over the left border, is the bug.',
                }}
            />
        </View>
    )
}

// overflow switched from hidden to visible after the image loaded, with a
// radius (left): square corners, as the one that was visible from the start
// (right). Checked by screenshot. iOS kept the image view's rounded mask.
function OverflowChangeCase() {
    const [hidden, setHidden] = useState(true)
    const [status, setStatus] = useState('waiting')
    const onLoad = () => {
        setTimeout(() => {
            setHidden(false)
            setTimeout(() => setStatus('OK'), 1000)
        }, 100)
    }
    return (
        <View style={styles.row}>
            <FastImage
                style={[
                    viewStyles.box,
                    {
                        borderRadius: 16,
                        overflow: hidden ? 'hidden' : 'visible',
                    },
                ]}
                source={{ uri: WIDE.uri }}
                onLoad={hidden ? onLoad : undefined}
            />
            <FastImage
                style={[
                    viewStyles.box,
                    styles.gap,
                    { borderRadius: 16, overflow: 'visible' },
                ]}
                source={{ uri: WIDE.uri }}
            />
            <CaseStatus
                id="style-overflow-change"
                status={status}
                description={{
                    checks: "overflow switched from 'hidden' to 'visible' after the image has loaded, with a borderRadius: the corners become square, as on an image that was visible from the start (iOS kept the rounded mask).",
                    steps: "Loads the wide photo in two squares with borderRadius 16; the left one starts with overflow: 'hidden', switched to 'visible' 100 ms after onLoad. Passes 1 s later.",
                    shows: 'Two identical photos of green cliffs with square corners. Rounded corners on the left one are the bug.',
                }}
            />
        </View>
    )
}

const VIEW_STYLE_CASES = [
    <ViewStyleCase
        key="style-corners"
        id="style-corners"
        description={{
            checks: 'Per-corner and logical corner radii, with a border: the image is clipped inside the border, with the matching inner radii.',
            steps: 'Two squares: one with corner radii 0 (top left), 24 (top right), 8 (bottom right) and 16 (bottom left) and a 3 dp blue border; one with borderTopStartRadius and borderBottomEndRadius 24.',
            shows: 'Left: the photo inside a blue border, its top left corner square, the top right much rounder than the bottom ones, and no photo outside the border. Right: the photo with its top left and bottom right corners rounded.',
        }}
        images={[
            {
                style: [
                    viewStyles.box,
                    {
                        borderTopLeftRadius: 0,
                        borderTopRightRadius: 24,
                        borderBottomRightRadius: 8,
                        borderBottomLeftRadius: 16,
                        borderWidth: 3,
                        borderColor: '#0066ff',
                    },
                ],
            },
            {
                style: [
                    viewStyles.box,
                    { borderTopStartRadius: 24, borderBottomEndRadius: 24 },
                ],
            },
        ]}
    />,
    <ViewStyleCase
        key="style-border-sides"
        id="style-border-sides"
        description={{
            checks: 'Borders of a different width and color on each side, a 50% radius on a wide box, and a dashed border.',
            steps: "Three images: a square with borderRadius 12 and borders of 2 (red, top), 6 (green, right), 10 (blue, bottom) and 4 (orange, left); a 96×56 box with borderRadius '50%'; a square with borderRadius 8 and a 2 dp dashed black border.",
            shows: 'Left to right: the photo framed by a thin red top, green right, thick blue bottom and orange left border, with rounded corners; the photo clipped to an ellipse; the photo inside a dashed black border with rounded corners.',
        }}
        images={[
            {
                style: [
                    viewStyles.box,
                    {
                        borderRadius: 12,
                        borderTopWidth: 2,
                        borderRightWidth: 6,
                        borderBottomWidth: 10,
                        borderLeftWidth: 4,
                        borderTopColor: 'red',
                        borderRightColor: 'green',
                        borderBottomColor: 'blue',
                        borderLeftColor: 'orange',
                    },
                ],
            },
            { style: [viewStyles.wide, { borderRadius: '50%' }] },
            {
                style: [
                    viewStyles.box,
                    {
                        borderRadius: 8,
                        borderWidth: 2,
                        borderColor: 'black',
                        borderStyle: 'dashed',
                    },
                ],
            },
        ]}
    />,
    <ViewStyleCase
        key="style-padding"
        id="style-padding"
        description={{
            checks: "padding doesn't inset the image, which fills the box as without padding, and overflow: 'visible' with a radius leaves the image's corners square.",
            steps: "Three squares: padding 8 with a 2 dp black border and borderRadius 12; the same border and radius without padding; borderRadius 16 with overflow: 'visible'.",
            shows: 'Left to right: two identical photos inside rounded black borders, filling them (a gap inside the left border is the bug); a photo with square corners.',
        }}
        images={[
            {
                style: [
                    viewStyles.box,
                    {
                        padding: 8,
                        borderWidth: 2,
                        borderColor: 'black',
                        borderRadius: 12,
                    },
                ],
            },
            {
                style: [
                    viewStyles.box,
                    { borderWidth: 2, borderColor: 'black', borderRadius: 12 },
                ],
            },
            {
                style: [
                    viewStyles.box,
                    { overflow: 'visible', borderRadius: 16 },
                ],
            },
        ]}
    />,
    <ViewStyleCase
        key="style-effects"
        id="style-effects"
        description={{
            checks: 'opacity, a rotation, a box shadow and elevation on the image, each with a radius but the first.',
            steps: "Four squares: opacity 0.5; borderRadius 12 rotated 15 degrees; borderRadius 12 with boxShadow '0 4px 8px rgba(0, 0, 0, 0.6)'; borderRadius 12 with elevation 8.",
            shows: 'Left to right: the photo at half opacity; rounded and tilted clockwise; rounded with a dark shadow below; rounded, with a soft shadow on Android only (elevation is Android only).',
        }}
        images={[
            { style: [viewStyles.box, { opacity: 0.5 }] },
            {
                style: [
                    viewStyles.box,
                    { borderRadius: 12, transform: [{ rotate: '15deg' }] },
                ],
            },
            {
                style: [
                    viewStyles.box,
                    {
                        borderRadius: 12,
                        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.6)',
                    },
                ],
            },
            {
                style: [viewStyles.box, { borderRadius: 12, elevation: 8 }],
            },
        ]}
    />,
    <ViewStyleCase
        key="style-backface"
        id="style-backface"
        description={{
            checks: "backfaceVisibility on an image turned around (rotateY 180°): 'hidden' doesn't show it, and 'visible' shows it mirrored.",
            steps: "Two squares with transform rotateY: '180deg': backfaceVisibility 'hidden', then 'visible'.",
            shows: 'Left: nothing at all, not even the gray background. Right: the photo mirrored, the cliffs on the left.',
        }}
        images={[
            {
                style: [
                    viewStyles.box,
                    {
                        backfaceVisibility: 'hidden',
                        transform: [{ rotateY: '180deg' }],
                    },
                ],
            },
            {
                style: [
                    viewStyles.box,
                    {
                        backfaceVisibility: 'visible',
                        transform: [{ rotateY: '180deg' }],
                    },
                ],
            },
        ]}
    />,
    <ViewStyleCase
        key="tint-prop-wins"
        id="tint-prop-wins"
        description={{
            checks: "The tintColor prop wins over tintColor in style, as with React Native's Image.",
            steps: 'Loads the logo with objectFit="contain", tintColor green and style tintColor red.',
            shows: "The React logo in solid green on a gray square. A red logo means style's tintColor won.",
        }}
        images={[
            {
                source: { uri: LOGO },
                tintColor: 'green',
                style: [viewStyles.box, { tintColor: 'red' }],
                objectFit: 'contain',
            },
        ]}
    />,
]

// source.thumbhash: a ThumbHash shows, decoded, while the image loads and if
// it fails, in place of defaultSource. Made with the reference encoder from
// flat test images: a 4:3 red-to-blue gradient, a 3:4 green-to-yellow one, a
// magenta disc on transparent, and a 4:3 cyan-to-orange gradient. Checked by
// screenshot: each case says what it shows.
const THUMBHASH_RED_BLUE = 'mKYCnZqXl/iIeIiHeIeIiH94+IiI'
const THUMBHASH_GREEN_YELLOW = 'HWwJNRp4eHB4iIh4iIh4iHhweAiH'
const THUMBHASH_DISC = 'Y8WDBQA396eIiH52qBd4cI33B1iIiIB5WA=='
const THUMBHASH_CYAN_ORANGE = 'YdgFjaSPiIiIiHh4h4iIh4B4CId3'

// A case's hold and request group: a new one once its hold is released, so
// the case mounted again (the runner's retry) is held again (the server
// doesn't hold a released name again).
const thumbhashReleases = new Map<string, number>()
const thumbhashName = (name: string) =>
    `thumbhash-${name}-${RUN}-${thumbhashReleases.get(name) ?? 0}`
// A slow server url held before it sends any of the image (until the case
// unmounts), so the placeholder stays. A byte a second while held (trickle),
// so the download doesn't time out (15 s without data) if the group takes
// long. Its requests are counted in its group.
const thumbhashHeld = (name: string) =>
    slowImageUrl(
        `picsum/1021-120x120.jpg?group=${thumbhashName(name)}&hold=${thumbhashName(name)}&holdAfter=0&trickle`,
    )
// Moves a case to its next hold and group, for its next mount.
const nextThumbhashName = (name: string) =>
    thumbhashReleases.set(name, (thumbhashReleases.get(name) ?? 0) + 1)
const releaseThumbhashHold = (name: string) => {
    const hold = thumbhashName(name)
    nextThumbhashName(name)
    return fetch(imageUrl(`release?hold=${hold}`)).catch(() => {})
}
const thumbhashRequests = (name: string) =>
    fetch(imageUrl(`requests?group=${thumbhashName(name)}`))
        .then((response) => response.json())
        .then((stats: { count: number }) => stats.count)

// Reports OK once the load has started (and the placeholder had a frame to
// show), or its error.
function useThumbhashStatus(expectError = false) {
    const [status, setStatus] = useState('waiting')
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
    useEffect(() => () => clearTimeout(timer.current), [])
    return {
        status,
        setStatus,
        onLoadStart: expectError
            ? undefined
            : () => {
                  clearTimeout(timer.current)
                  timer.current = setTimeout(() => setStatus('OK'), 500)
              },
        onLoad: () => setStatus('onLoad: the download should be held'),
        onError: (e: { nativeEvent: { error?: string } }) => {
            const error = String(e.nativeEvent.error)
            setStatus(expectError ? 'OK' : `onError: ${error}`)
        },
    }
}

// The hash shows while the download is held, in place of defaultSource.
function ThumbhashLoadingCase() {
    const { status, onLoadStart, onLoad, onError } = useThumbhashStatus()
    useEffect(() => () => void releaseThumbhashHold('loading'), [])
    return (
        <View style={caseStyles.row}>
            <FastImage
                style={thumbhashStyles.wide}
                source={{
                    uri: thumbhashHeld('loading'),
                    headers: SLOW_HEADERS,
                    thumbhash: THUMBHASH_RED_BLUE,
                }}
                defaultSource={require('./images/magenta.png')}
                onLoadStart={onLoadStart}
                onLoad={onLoad}
                onError={onError}
            />
            <CaseStatus
                id="thumbhash-loading"
                status={status}
                description={{
                    checks: 'source.thumbhash shows while the image loads, in place of defaultSource.',
                    steps: 'A 96 × 72 view loads a photo the slow server holds (it sends only the headers and a byte a second until the case unmounts), with a red-to-blue thumbhash and a magenta defaultSource. Passes half a second after onLoadStart; onLoad fails it (the download should be held).',
                    shows: 'A red-to-blue gradient, red on the left and blue on the right, filling the view. A failure: a magenta rectangle (defaultSource).',
                }}
            />
        </View>
    )
}

// A transparent hash, with objectFit scale-down: drawn as contain (the
// image's size isn't known yet), the row's background around the disc.
function ThumbhashScaleDownCase() {
    const { status, onLoadStart, onLoad, onError } = useThumbhashStatus()
    useEffect(() => () => void releaseThumbhashHold('scale-down'), [])
    return (
        <View style={caseStyles.row}>
            <FastImage
                style={thumbhashStyles.wide}
                objectFit="scale-down"
                source={{
                    uri: thumbhashHeld('scale-down'),
                    headers: SLOW_HEADERS,
                    thumbhash: THUMBHASH_DISC,
                }}
                onLoadStart={onLoadStart}
                onLoad={onLoad}
                onError={onError}
            />
            <CaseStatus
                id="thumbhash-scale-down"
                status={status}
                description={{
                    checks: "A thumbhash with transparency and objectFit scale-down is drawn as contain (the image's size isn't known yet), with the view's background around it.",
                    steps: 'A 96 × 72 view loads a photo the slow server holds, with the thumbhash of a magenta disc on transparent and objectFit="scale-down". Passes half a second after onLoadStart; onLoad fails it.',
                    shows: 'A soft, blurred magenta disc as tall as the view, centered on the gray background.',
                }}
            />
        </View>
    )
}

// The image fails: the hash shows (contain, in a wide view).
function ThumbhashFailsCase() {
    const { status, onLoad, onError } = useThumbhashStatus(true)
    return (
        <View style={caseStyles.row}>
            <FastImage
                style={thumbhashStyles.wide}
                objectFit="contain"
                source={{
                    uri: slowImageUrl(
                        `does-not-exist.jpg?thumbhash-fails=${RUN}&delay=50`,
                    ),
                    headers: SLOW_HEADERS,
                    thumbhash: THUMBHASH_GREEN_YELLOW,
                }}
                onLoad={onLoad}
                onError={onError}
            />
            <CaseStatus
                id="thumbhash-fails"
                status={status}
                description={{
                    checks: 'source.thumbhash stays when the image fails to load.',
                    steps: 'A 96 × 72 view with objectFit="contain" loads a url the slow server answers with a 404, with a 3:4 green-to-yellow thumbhash. Passes on onError.',
                    shows: 'A narrow green-to-yellow rectangle (green at the top, yellow at the bottom) centered on gray. A failure: an empty gray rectangle.',
                }}
            />
        </View>
    )
}

// The image has loaded; a second later its source gets another hash. Passes
// when it doesn't load again: one request, one onLoad.
function ThumbhashChangeLoadedCase() {
    // Its requests counted afresh when it's mounted again (the runner's
    // retry).
    useEffect(() => () => void nextThumbhashName('loaded'), [])
    const [thumbhash, setThumbhash] = useState(THUMBHASH_RED_BLUE)
    const [status, setStatus] = useState('waiting')
    const loads = useRef(0)
    const onLoad = () => {
        loads.current++
        if (loads.current > 1) {
            setStatus('loaded again after the thumbhash changed')
            return
        }
        setTimeout(() => setThumbhash(THUMBHASH_CYAN_ORANGE), 1000)
        setTimeout(async () => {
            const requests = await thumbhashRequests('loaded').catch(() => -1)
            setStatus((previous) =>
                previous !== 'waiting'
                    ? previous
                    : requests === 1 && loads.current === 1
                      ? 'OK'
                      : `${requests} requests, ${loads.current} onLoad`,
            )
        }, 2500)
    }
    return (
        <View style={caseStyles.row}>
            <FastImage
                style={thumbhashStyles.wide}
                source={{
                    uri: slowImageUrl(
                        `picsum/1021-120x120.jpg?group=${thumbhashName('loaded')}&delay=50`,
                    ),
                    headers: SLOW_HEADERS,
                    thumbhash,
                }}
                onLoad={onLoad}
                onError={(e) => setStatus(`onError: ${e.nativeEvent.error}`)}
            />
            <CaseStatus
                id="thumbhash-change-loaded"
                status={status}
                description={{
                    checks: "A new thumbhash for an image that has loaded doesn't load it again, and the photo stays.",
                    steps: 'A 96 × 72 view loads a photo from the slow server (about 350 ms) with a red-to-blue thumbhash; 1 s after onLoad the thumbhash changes to cyan-to-orange. Passes 2.5 s after onLoad if the server got one request for it and onLoad fired once.',
                    shows: 'A gray photo of a misty forest, cropped to fill the view. A failure: a cyan-to-orange gradient.',
                }}
            />
        </View>
    )
}

// placeholder's thumbhash arrives after the image has loaded, with
// defaultSource shown until then (none before): the placeholder image goes
// away without loading the image again (one request, one onLoad).
function ThumbhashPlaceholderLateCase() {
    // Its requests counted afresh when it's mounted again (the runner's
    // retry).
    useEffect(() => () => void nextThumbhashName('placeholder-late'), [])
    const [thumbhash, setThumbhash] = useState<string>()
    const [status, setStatus] = useState('waiting')
    const loads = useRef(0)
    const onLoad = () => {
        loads.current++
        if (loads.current > 1) {
            setStatus('loaded again after the thumbhash arrived')
            return
        }
        setTimeout(() => setThumbhash(THUMBHASH_CYAN_ORANGE), 1000)
        setTimeout(async () => {
            const requests = await thumbhashRequests('placeholder-late').catch(
                () => -1,
            )
            setStatus((previous) =>
                previous !== 'waiting'
                    ? previous
                    : requests === 1 && loads.current === 1
                      ? 'OK'
                      : `${requests} requests, ${loads.current} onLoad`,
            )
        }, 2500)
    }
    return (
        <View style={caseStyles.row}>
            <FastImage
                style={thumbhashStyles.wide}
                source={{
                    uri: slowImageUrl(
                        `picsum/1021-120x120.jpg?group=${thumbhashName('placeholder-late')}&delay=50`,
                    ),
                    headers: SLOW_HEADERS,
                }}
                placeholder={{ thumbhash }}
                defaultSource={MAGENTA_DEFAULT}
                onLoad={onLoad}
                onError={(e) => setStatus(`onError: ${e.nativeEvent.error}`)}
            />
            <CaseStatus
                id="thumbhash-placeholder-late"
                status={status}
                description={{
                    checks: "A placeholder thumbhash that arrives after the image has loaded doesn't load it again, and the photo stays.",
                    steps: 'A 96 × 72 view loads a photo from the slow server (about 350 ms) with a magenta defaultSource and placeholder={{ thumbhash: undefined }}; 1 s after onLoad, placeholder gets a cyan-to-orange thumbhash. Passes 2.5 s after onLoad if the server got one request for it and onLoad fired once.',
                    shows: 'A gray photo of a misty forest, cropped to fill the view. A failure: a cyan-to-orange gradient.',
                }}
            />
        </View>
    )
}

// While the download is held, the source gets another hash: it shows at once,
// without starting the download again (one request).
function ThumbhashChangeLoadingCase() {
    const [thumbhash, setThumbhash] = useState(THUMBHASH_RED_BLUE)
    const [status, setStatus] = useState('waiting')
    const started = useRef(false)
    useEffect(() => () => void releaseThumbhashHold('loading-change'), [])
    return (
        <View style={caseStyles.row}>
            <FastImage
                style={thumbhashStyles.wide}
                source={{
                    uri: thumbhashHeld('loading-change'),
                    headers: SLOW_HEADERS,
                    thumbhash,
                }}
                onLoadStart={() => {
                    if (started.current) {
                        setStatus('the load started again')
                        return
                    }
                    started.current = true
                    setTimeout(() => setThumbhash(THUMBHASH_CYAN_ORANGE), 500)
                    setTimeout(async () => {
                        const requests = await thumbhashRequests(
                            'loading-change',
                        ).catch(() => -1)
                        setStatus((previous) =>
                            previous !== 'waiting'
                                ? previous
                                : requests === 1
                                  ? 'OK'
                                  : `${requests} requests`,
                        )
                    }, 1500)
                }}
                onLoad={() => setStatus('onLoad: the download should be held')}
                onError={(e) => setStatus(`onError: ${e.nativeEvent.error}`)}
            />
            <CaseStatus
                id="thumbhash-change-loading"
                status={status}
                description={{
                    checks: 'A new thumbhash while the image loads shows at once, without starting the download again.',
                    steps: 'A 96 × 72 view loads a photo the slow server holds, with a red-to-blue thumbhash; half a second after onLoadStart the thumbhash changes to cyan-to-orange. Passes 1.5 s after onLoadStart if the server got one request; a second onLoadStart or an onLoad fails it.',
                    shows: 'A cyan-to-orange gradient, cyan on the left and orange on the right. A failure: the red-to-blue one.',
                }}
            />
        </View>
    )
}

// Several sizes, each with its own hash: the view (40 × 30) picks the small
// one (100 × 75 px), and shows its hash, not the large one's.
function ThumbhashSizesCase() {
    const { status, onLoadStart, onLoad, onError } = useThumbhashStatus()
    useEffect(
        () => () => {
            void releaseThumbhashHold('sizes-small')
            void releaseThumbhashHold('sizes-large')
        },
        [],
    )
    return (
        <View style={caseStyles.row}>
            <FastImage
                style={thumbhashStyles.small}
                source={[
                    {
                        uri: thumbhashHeld('sizes-small'),
                        headers: SLOW_HEADERS,
                        width: 100,
                        height: 75,
                        thumbhash: THUMBHASH_CYAN_ORANGE,
                    },
                    {
                        uri: thumbhashHeld('sizes-large'),
                        headers: SLOW_HEADERS,
                        width: 1000,
                        height: 750,
                        thumbhash: THUMBHASH_RED_BLUE,
                    },
                ]}
                onLoadStart={onLoadStart}
                onLoad={onLoad}
                onError={onError}
            />
            <CaseStatus
                id="thumbhash-sizes"
                status={status}
                description={{
                    checks: 'With several sizes, each with its own thumbhash, the view shows the thumbhash of the size it picks.',
                    steps: 'A 40 × 30 view gets two held sources: 100 × 75 with a cyan-to-orange thumbhash and 1000 × 750 with a red-to-blue one; it picks the small one. Passes half a second after onLoadStart; onLoad fails it.',
                    shows: "A small cyan-to-orange gradient. A failure: red to blue (the large size's hash).",
                }}
            />
        </View>
    )
}

// A recycled row: once the first image has loaded, the view gets another
// recyclingKey and a held source with a hash. It shows the new hash, not the
// previous row's image.
function ThumbhashRecycledCase() {
    const [second, setSecond] = useState(false)
    const { status, onLoadStart, onLoad, onError } = useThumbhashStatus()
    useEffect(() => () => void releaseThumbhashHold('recycled'), [])
    return (
        <View style={caseStyles.row}>
            <FastImage
                style={thumbhashStyles.wide}
                recyclingKey={second ? 'b' : 'a'}
                source={
                    second
                        ? {
                              uri: thumbhashHeld('recycled'),
                              headers: SLOW_HEADERS,
                              thumbhash: THUMBHASH_GREEN_YELLOW,
                          }
                        : {
                              uri: imageUrl(
                                  `picsum/1022-120x120.jpg?thumbhash-recycled=${RUN}`,
                              ),
                          }
                }
                onLoadStart={second ? onLoadStart : undefined}
                onLoad={second ? onLoad : () => setSecond(true)}
                onError={onError}
            />
            <CaseStatus
                id="thumbhash-recycled"
                status={status}
                description={{
                    checks: "A recycled view (a new recyclingKey) with a thumbhash shows the hash, not the previous item's image.",
                    steps: "A 96 × 72 view loads a photo with recyclingKey 'a'; on its onLoad, it gets recyclingKey 'b' and a photo the slow server holds, with a green-to-yellow thumbhash. Passes half a second after the second onLoadStart; its onLoad fails it.",
                    shows: 'A green-to-yellow gradient (green at the top, yellow at the bottom) filling the view. A failure: the first photo.',
                }}
            />
        </View>
    )
}

// placeholder as a data uri, and a source's blurDataUri: decoded at once,
// shown while the download is held. A 2 × 2 PNG of red, green, blue and
// yellow quadrants, and a 2 × 1 one, orange on the left and teal on the right.
const PLACEHOLDER_QUADRANTS =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR42mN4Jicnt8qGQSPgzocTIgAh2AVH0x5+BQAAAABJRU5ErkJggg=='
const PLACEHOLDER_BAND =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR42mP438HA0NEBAApBApjRI1qYAAAAAElFTkSuQmCC'

// The placeholder prop as a data uri, over defaultSource.
function PlaceholderDataUriCase() {
    const { status, onLoadStart, onLoad, onError } = useThumbhashStatus()
    useEffect(() => () => void releaseThumbhashHold('placeholder-data-uri'), [])
    return (
        <View style={caseStyles.row}>
            <FastImage
                style={thumbhashStyles.wide}
                source={{
                    uri: thumbhashHeld('placeholder-data-uri'),
                    headers: SLOW_HEADERS,
                }}
                placeholder={PLACEHOLDER_QUADRANTS}
                defaultSource={require('./images/magenta.png')}
                onLoadStart={onLoadStart}
                onLoad={onLoad}
                onError={onError}
            />
            <CaseStatus
                id="placeholder-data-uri"
                status={status}
                description={{
                    checks: 'The placeholder prop as a data uri shows while the image loads, decoded at once, in place of defaultSource.',
                    steps: 'A 96 × 72 view loads a photo the slow server holds, with placeholder set to a 2 × 2 PNG data uri (red, green, blue and yellow pixels) and a magenta defaultSource. Passes half a second after onLoadStart; onLoad fails it.',
                    shows: 'Red (top left), green (top right), blue (bottom left) and yellow (bottom right) blending into each other, filling the view. A failure: magenta.',
                }}
            />
        </View>
    )
}

// A source's blurDataUri, with objectFit scale-down: blurred, and drawn as a
// thumbhash is, as contain (the image's size isn't known yet), over the
// placeholder prop.
function BlurDataUriCase() {
    const { status, onLoadStart, onLoad, onError } = useThumbhashStatus()
    useEffect(() => () => void releaseThumbhashHold('blur-data-uri'), [])
    return (
        <View style={caseStyles.row}>
            <FastImage
                style={thumbhashStyles.wide}
                objectFit="scale-down"
                source={{
                    uri: thumbhashHeld('blur-data-uri'),
                    headers: SLOW_HEADERS,
                    blurDataUri: PLACEHOLDER_BAND,
                }}
                placeholder={require('./images/magenta.png')}
                onLoadStart={onLoadStart}
                onLoad={onLoad}
                onError={onError}
            />
            <CaseStatus
                id="blur-data-uri"
                status={status}
                description={{
                    checks: "A source's blurDataUri shows while the image loads, blurred, over the placeholder prop; with objectFit scale-down it's drawn as contain, as a thumbhash is.",
                    steps: 'A 96 × 72 view with objectFit="scale-down" loads a photo the slow server holds, with blurDataUri set to a 2 × 1 PNG (orange on the left, teal on the right) and a magenta placeholder. Passes half a second after onLoadStart; onLoad fails it.',
                    shows: 'An orange-to-teal band, blurred smoothly from one to the other, as wide as the view and two thirds as tall, centered on gray. A failure: magenta.',
                }}
            />
        </View>
    )
}

// Several sizes without their own hash, and one for all of them as the
// placeholder prop: the picked size shows it.
function PlaceholderSizesCase() {
    const { status, onLoadStart, onLoad, onError } = useThumbhashStatus()
    useEffect(
        () => () => {
            void releaseThumbhashHold('placeholder-sizes-small')
            void releaseThumbhashHold('placeholder-sizes-large')
        },
        [],
    )
    return (
        <View style={caseStyles.row}>
            <FastImage
                style={thumbhashStyles.wide}
                source={[
                    {
                        uri: thumbhashHeld('placeholder-sizes-small'),
                        headers: SLOW_HEADERS,
                        width: 100,
                        height: 75,
                    },
                    {
                        uri: thumbhashHeld('placeholder-sizes-large'),
                        headers: SLOW_HEADERS,
                        width: 1000,
                        height: 750,
                    },
                ]}
                placeholder={{ thumbhash: THUMBHASH_GREEN_YELLOW }}
                onLoadStart={onLoadStart}
                onLoad={onLoad}
                onError={onError}
            />
            <CaseStatus
                id="placeholder-sizes"
                status={status}
                description={{
                    checks: "With several sizes and no thumbhash of their own, the placeholder prop's thumbhash shows for the picked size.",
                    steps: 'A 96 × 72 view gets two held sources (100 × 75 and 1000 × 750) and placeholder={{ thumbhash }} with a green-to-yellow hash. Passes half a second after onLoadStart; onLoad fails it.',
                    shows: 'A green-to-yellow gradient (green at the top, yellow at the bottom) filling the view.',
                }}
            />
        </View>
    )
}

// A 48 × 48 PNG of red, green, blue and yellow quadrants.
const PLACEHOLDER_QUADRANTS_48 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwAgMAAAAqbBEUAAAADFBMVEX1xRgboUsiT+DlHCOuv+F4AAAAKUlEQVR42mP8z8DAwMAQxsDAwMDAxIAERjn4OCyrGRgYGBhWjwYIaRwAUXoDDQGcsqYAAAAASUVORK5CYII='

// The placeholder prop as a data uri with objectFit none: at its size, one
// pixel per point (Android drew it one pixel per pixel).
function PlaceholderDataUriSizeCase() {
    const { status, onLoadStart, onLoad, onError } = useThumbhashStatus()
    useEffect(
        () => () => void releaseThumbhashHold('placeholder-data-uri-size'),
        [],
    )
    return (
        <View style={caseStyles.row}>
            <FastImage
                style={thumbhashStyles.wide}
                objectFit="none"
                source={{
                    uri: thumbhashHeld('placeholder-data-uri-size'),
                    headers: SLOW_HEADERS,
                }}
                placeholder={PLACEHOLDER_QUADRANTS_48}
                onLoadStart={onLoadStart}
                onLoad={onLoad}
                onError={onError}
            />
            <CaseStatus
                id="placeholder-data-uri-size"
                status={status}
                description={{
                    checks: 'The placeholder prop as a data uri with objectFit none is drawn at its size, one pixel per point (Android drew it one pixel per pixel, much smaller).',
                    steps: 'A 96 × 72 view with objectFit="none" loads a photo the slow server holds, with placeholder set to a 48 × 48 PNG data uri of red, green, blue and yellow quadrants. Passes half a second after onLoadStart; onLoad fails it.',
                    shows: 'Sharp red, green, blue and yellow quadrants, 48 × 48 (half as wide as the view, two thirds as tall), centered on gray.',
                }}
            />
        </View>
    )
}

// tintColor with a transparent thumbhash: the preview is tinted, as the image
// will be (a blurred disc in the tint color).
function ThumbhashTintCase() {
    const { status, onLoadStart, onLoad, onError } = useThumbhashStatus()
    useEffect(() => () => void releaseThumbhashHold('thumbhash-tint'), [])
    return (
        <View style={caseStyles.row}>
            <FastImage
                style={thumbhashStyles.wide}
                objectFit="contain"
                tintColor="#1e40ff"
                source={{
                    uri: thumbhashHeld('thumbhash-tint'),
                    headers: SLOW_HEADERS,
                    thumbhash: THUMBHASH_DISC,
                }}
                onLoadStart={onLoadStart}
                onLoad={onLoad}
                onError={onError}
            />
            <CaseStatus
                id="thumbhash-tint"
                status={status}
                description={{
                    checks: 'tintColor tints a thumbhash with transparency, as it will tint the image.',
                    steps: 'A 96 × 72 view with objectFit="contain" and tintColor="#1e40ff" loads a photo the slow server holds, with the thumbhash of a magenta disc on transparent. Passes half a second after onLoadStart; onLoad fails it.',
                    shows: 'A soft blue disc, as tall as the view, centered on gray. A failure: a magenta disc.',
                }}
            />
        </View>
    )
}

// An HDR photo (a gain map: flat gray in standard range, its right half
// brighter in HDR) with each dynamicRangeLimit. They all load. The simulator
// can't show HDR: its ImageIO decodes a gain map to a 16-bit image that isn't
// HDR, drawn gray or black depending on SDWebImage's path, so the HDR ones
// are left out of the screenshot. Check them on an HDR iPhone.
function HdrCase() {
    const [loaded, setLoaded] = useState(0)
    const [error, setError] = useState<string>()
    const props = {
        source: { uri: imageUrl('hdr-half.jpg') },
        onLoad: () => setLoaded((count) => count + 1),
        onError: (e: { nativeEvent: { error?: string } }) =>
            setError(String(e.nativeEvent.error)),
    }
    return (
        <View style={caseStyles.row}>
            <FastImage
                {...props}
                style={hdrStyles.image}
                dynamicRangeLimit="standard"
            />
            <Masked>
                <View style={hdrStyles.row}>
                    {(['constrained', 'no-limit'] as const).map((limit) => (
                        <FastImage
                            key={limit}
                            {...props}
                            style={hdrStyles.image}
                            dynamicRangeLimit={limit}
                        />
                    ))}
                </View>
            </Masked>
            <CaseStatus
                id="hdr"
                status={
                    error ? `onError: ${error}` : loaded >= 3 ? 'OK' : 'waiting'
                }
                description={{
                    checks: "An HDR photo (a gain map) loads with each dynamicRangeLimit: 'standard', 'constrained' and 'no-limit'.",
                    steps: "Three 64 × 48 views load the same photo: flat gray in standard range, its right half brighter in HDR. Passes once all three have fired onLoad; onError fails it. The simulator can't show HDR, so the last two are left out of the comparison; Android ignores dynamicRangeLimit.",
                    shows: "A flat gray rectangle, then two that aren't compared (black or gray in the iOS simulator, gray on Android). On an HDR iPhone, the second's right half is brighter, and the third's brighter still.",
                }}
            />
        </View>
    )
}

const hdrStyles = StyleSheet.create({
    row: { flexDirection: 'row' },
    image: { width: 64, height: 48, marginRight: 6 },
})

// `placeholder` as a url: the quadrants (20 × 20), a url per case and run, so
// it isn't cached from an earlier run.
const placeholderUrl = (name: string) =>
    imageUrl(`quadrants.png?placeholder-url=${name}-${RUN}`)

// Reports OK a second after the load started (or failed): a url placeholder
// from the local server has loaded by then. Or what `check` resolves.
function usePlaceholderUrlStatus(check?: () => Promise<string>) {
    const [status, setStatus] = useState('waiting')
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
    useEffect(() => () => clearTimeout(timer.current), [])
    const after = () => {
        clearTimeout(timer.current)
        timer.current = setTimeout(() => {
            if (!check) return setStatus('OK')
            check().then(setStatus, (error) => setStatus(String(error)))
        }, 1000)
    }
    return { status, setStatus, after }
}

// A url as `placeholder`, not cached before, while the image's download is
// held: it loads, and shows.
function PlaceholderUrlCase() {
    const { status, setStatus, after } = usePlaceholderUrlStatus()
    useEffect(() => () => void releaseThumbhashHold('placeholder-url'), [])
    return (
        <View style={caseStyles.row}>
            <FastImage
                style={thumbhashStyles.wide}
                source={{
                    uri: thumbhashHeld('placeholder-url'),
                    headers: SLOW_HEADERS,
                }}
                placeholder={placeholderUrl('loads')}
                onLoadStart={after}
                onLoad={() => setStatus('onLoad: the download should be held')}
            />
            <CaseStatus
                id="placeholder-url"
                status={status}
                description={{
                    checks: "The placeholder prop as a url that isn't cached: it loads, and shows while the image loads.",
                    steps: 'A 96 × 72 view loads a photo the slow server holds, with placeholder set to the url of a 20 × 20 image of red, green, blue and yellow quadrants (a new url each run). Passes 1 s after onLoadStart; onLoad fails it.',
                    shows: 'Red, green, blue and yellow quadrants filling the view. A failure: an empty gray rectangle.',
                }}
            />
        </View>
    )
}

// A url as placeholder with cache 'cacheOnly' that isn't cached: nothing
// shows, and it isn't requested.
const PLACEHOLDER_URL_MISSING = `/cyan.png?placeholder-url-missing=${RUN}`
function PlaceholderUrlCacheOnlyCase() {
    const { status, setStatus, after } = usePlaceholderUrlStatus(() =>
        fetch(
            imageUrl(
                `requests?path=${encodeURIComponent(PLACEHOLDER_URL_MISSING)}`,
            ),
        )
            .then((response) => response.json())
            .then((json: { count: number }) =>
                json.count === 0 ? 'OK' : `requested ${json.count} times`,
            ),
    )
    useEffect(
        () => () => void releaseThumbhashHold('placeholder-url-cache-only'),
        [],
    )
    return (
        <View style={caseStyles.row}>
            <FastImage
                style={thumbhashStyles.wide}
                source={{
                    uri: thumbhashHeld('placeholder-url-cache-only'),
                    headers: SLOW_HEADERS,
                }}
                placeholder={{
                    uri: imageUrl(PLACEHOLDER_URL_MISSING.slice(1)),
                    cache: 'cacheOnly',
                }}
                onLoadStart={after}
                onLoad={() => setStatus('onLoad: the download should be held')}
            />
            <CaseStatus
                id="placeholder-url-cache-only"
                status={status}
                description={{
                    checks: "A url placeholder with cache: 'cacheOnly' that isn't cached shows nothing and isn't requested.",
                    steps: "A 96 × 72 view loads a photo the slow server holds, with placeholder={{ uri, cache: 'cacheOnly' }} for a cyan image not loaded before. Passes if, 1 s after onLoadStart, the image server got no request for the cyan url; onLoad fails it.",
                    shows: 'An empty gray rectangle. A failure: cyan.',
                }}
            />
        </View>
    )
}

// A url shown in a small view, then as a larger view's placeholder with cache
// 'cacheOnly' (a list's thumbnail while the full image loads): it shows.
function PlaceholderUrlCachedCase() {
    const url = placeholderUrl('cached')
    const [shown, setShown] = useState(false)
    const { status, setStatus, after } = usePlaceholderUrlStatus()
    useEffect(
        () => () => void releaseThumbhashHold('placeholder-url-cached'),
        [],
    )
    return (
        <View style={caseStyles.row}>
            <FastImage
                style={[thumbhashStyles.small, { marginRight: 8 }]}
                source={{ uri: url }}
                onLoad={() => setShown(true)}
            />
            {shown ? (
                <FastImage
                    style={thumbhashStyles.wide}
                    source={{
                        uri: thumbhashHeld('placeholder-url-cached'),
                        headers: SLOW_HEADERS,
                    }}
                    placeholder={{ uri: url, cache: 'cacheOnly' }}
                    onLoadStart={after}
                    onLoad={() =>
                        setStatus('onLoad: the download should be held')
                    }
                />
            ) : (
                <View style={thumbhashStyles.wide} />
            )}
            <CaseStatus
                id="placeholder-url-cached"
                status={status}
                description={{
                    checks: "A url placeholder with cache: 'cacheOnly' shows when it's cached, as for a list's thumbnail shown while the full image loads.",
                    steps: "A 40 × 30 view loads the quadrants image; on its onLoad, a 96 × 72 view mounts with a photo the slow server holds and placeholder={{ uri, cache: 'cacheOnly' }} for the same url. Passes 1 s after onLoadStart; onLoad fails it.",
                    shows: 'The red, green, blue and yellow quadrants small, then larger on the right. A failure: an empty gray rectangle on the right.',
                }}
            />
        </View>
    )
}

// The image fails: the url placeholder shows.
function PlaceholderUrlErrorCase() {
    const { status, after } = usePlaceholderUrlStatus()
    return (
        <View style={caseStyles.row}>
            <FastImage
                style={thumbhashStyles.wide}
                source={{ uri: MISSING }}
                placeholder={imageUrl(`cyan.png?placeholder-url-error=${RUN}`)}
                onError={after}
            />
            <CaseStatus
                id="placeholder-url-error"
                status={status}
                description={{
                    checks: 'A url placeholder shows when the image fails.',
                    steps: "A 96 × 72 view loads a url the image server answers with a 404, with placeholder set to a cyan image's url. Passes 1 s after onError.",
                    shows: 'A cyan rectangle. A failure: an empty gray rectangle.',
                }}
            />
        </View>
    )
}

// The image loads before the url placeholder (held): the placeholder doesn't
// replace it when it comes.
const PLACEHOLDER_URL_LATE_HOLD = `placeholder-url-late-${RUN}`
const releasePlaceholderUrlLate = () =>
    fetch(imageUrl(`release?hold=${PLACEHOLDER_URL_LATE_HOLD}`)).catch(() => {})
function PlaceholderUrlLateCase() {
    const { status, after } = usePlaceholderUrlStatus()
    useEffect(() => () => void releasePlaceholderUrlLate(), [])
    return (
        <View style={caseStyles.row}>
            <FastImage
                style={thumbhashStyles.wide}
                source={{
                    uri: imageUrl(`magenta.png?placeholder-url-late=${RUN}`),
                }}
                placeholder={slowImageUrl(
                    `quadrants.png?hold=${PLACEHOLDER_URL_LATE_HOLD}&holdAfter=0`,
                )}
                onLoad={() => {
                    void releasePlaceholderUrlLate()
                    after()
                }}
            />
            <CaseStatus
                id="placeholder-url-late"
                status={status}
                description={{
                    checks: "A url placeholder that arrives after the image has loaded doesn't replace it.",
                    steps: "A 96 × 72 view loads a magenta image, with placeholder set to the quadrants from the slow server, held until the image's onLoad releases it. Passes 1 s after onLoad.",
                    shows: 'A magenta rectangle. A failure: the red, green, blue and yellow quadrants.',
                }}
            />
        </View>
    )
}

const thumbhashStyles = StyleSheet.create({
    wide: { width: 96, height: 72, backgroundColor: '#eee' },
    small: { width: 40, height: 30, backgroundColor: '#eee' },
})

export const REGRESSION_GROUPS: RegressionGroup[] = [
    {
        // First, before any view has loaded an image.
        name: 'start',
        description: {
            checks: "Fast Image calls that must work as the app's first, before any view has loaded an image.",
        },
        cases: [<WebCachePathAtStartCase key="cache-path-web-at-start" />],
    },
    {
        name: 'load-end',
        description: {
            checks: "onLoadEnd's event: whether the load worked, with onLoad's size or onError's error.",
        },
        cases: [
            <LoadEndResultCase
                key="load-end-ok"
                id="load-end-ok"
                uri={LOGO}
                description={{
                    checks: "onLoadEnd's event has the load's result: for an image that loads, ok: true and the same width and height onLoad got.",
                    steps: "Loads the logo from the image server, with onLoad and onLoadEnd. Passes once both have fired and onLoadEnd's event is { ok: true, width, height } with onLoad's size.",
                    shows: 'The React logo (light blue) on the gray square.',
                }}
            />,
            <LoadEndResultCase
                key="load-end-error"
                id="load-end-error"
                uri={MISSING}
                description={{
                    checks: "onLoadEnd's event has the load's result: for an image that fails, ok: false and the same error onError got.",
                    steps: "Loads a url the image server answers with a 404, with onError and onLoadEnd. Passes once both have fired and onLoadEnd's event is { ok: false, error } with onError's error.",
                    shows: 'An empty gray square: the image never loads.',
                }}
            />,
        ],
    },
    {
        name: 'events',
        description: {
            checks: "Event handlers and source values that crashed or failed loads: tintColor without an image, handlers removed after firing, source values Fast Image doesn't know, and images without handlers.",
        },
        cases: [
            <EventCase
                key="tint-remote"
                id="tint-remote"
                description={{
                    checks: 'tintColor on a remote image without a defaultSource (#1082: iOS crashed tinting an image with no size, before the remote one had loaded).',
                    steps: 'Loads the logo with tintColor green and no defaultSource. Passes on onLoad.',
                    shows: 'The React logo in solid green instead of its usual light blue.',
                }}
                event="onLoad"
                source={{ uri: LOGO }}
                tintColor="green"
            />,
            <EventCase
                key="tint-404"
                id="tint-404"
                description={{
                    checks: 'tintColor on an image that fails to load (#1082: iOS crashed tinting an image with no size).',
                    steps: 'Loads a url the image server answers with a 404, with tintColor green. Passes on onError.',
                    shows: "An empty gray square: nothing loads, so there's nothing to tint.",
                }}
                event="onError"
                source={{ uri: MISSING }}
                tintColor="green"
            />,
            <EventCase
                key="remove-onLoad"
                id="remove-onLoad"
                description={{
                    checks: 'Removing the onLoad handler after it has fired (#1088: iOS called the removed handler and crashed).',
                    steps: 'Loads the logo with onLoad; when it fires, the case re-renders without onLoad. Passes once it has fired; a crash after that fails the whole run.',
                    shows: 'The React logo (light blue) on the gray square.',
                }}
                event="onLoad"
                removeAfter
                source={{ uri: LOGO }}
            />,
            <EventCase
                key="remove-onLoadEnd"
                id="remove-onLoadEnd"
                description={{
                    checks: 'Removing the onLoadEnd handler after it has fired (#1088: iOS called the removed handler and crashed).',
                    steps: 'Loads the logo with onLoadEnd; when it fires, the case re-renders without onLoadEnd. Passes once it has fired; a crash after that fails the whole run.',
                    shows: 'The React logo (light blue) on the gray square.',
                }}
                event="onLoadEnd"
                removeAfter
                source={{ uri: LOGO }}
            />,
            <EventCase
                key="remove-onError"
                id="remove-onError"
                description={{
                    checks: 'Removing the onError handler after it has fired (#1088: iOS called the removed handler and crashed).',
                    steps: 'Loads a url the image server answers with a 404 with onError; when it fires, the case re-renders without onError. Passes once it has fired; a crash after that fails the whole run.',
                    shows: 'An empty gray square: the image never loads.',
                }}
                event="onError"
                removeAfter
                source={{ uri: MISSING }}
            />,
            <EventCase
                key="unknown-cache"
                id="unknown-cache"
                description={{
                    checks: "A source.cache that isn't one of Fast Image's values ('sometimes') is treated as the default ('immutable') instead of failing.",
                    steps: "Loads the logo with cache: 'sometimes'. Passes on onLoad.",
                    shows: 'The React logo (light blue) on the gray square.',
                }}
                event="onLoad"
                // @ts-expect-error not one of Fast Image's values
                source={{ uri: LOGO, cache: 'sometimes' }}
            />,
            <EventCase
                key="react-native-reload"
                id="react-native-reload"
                description={{
                    checks: "React Native Image's cache: 'reload', which Fast Image doesn't have, is treated as the default instead of failing.",
                    steps: "Loads the logo with cache: 'reload'. Passes on onLoad.",
                    shows: 'The React logo (light blue) on the gray square.',
                }}
                event="onLoad"
                source={{ uri: LOGO, cache: 'reload' }}
            />,
            <EventCase
                key="unknown-priority"
                id="unknown-priority"
                description={{
                    checks: "A source.priority that isn't one of Fast Image's values ('urgent') is treated as the default ('normal') instead of failing.",
                    steps: "Loads the logo with priority: 'urgent'. Passes on onLoad.",
                    shows: 'The React logo (light blue) on the gray square.',
                }}
                event="onLoad"
                // @ts-expect-error not one of Fast Image's values
                source={{ uri: LOGO, priority: 'urgent' }}
            />,
            <EventCase
                key="non-string-cache"
                id="non-string-cache"
                description={{
                    checks: "A source.cache that isn't a string (the number 1) is treated as the default instead of failing or crashing.",
                    steps: 'Loads the logo with cache: 1. Passes on onLoad.',
                    shows: 'The React logo (light blue) on the gray square.',
                }}
                event="onLoad"
                // @ts-expect-error not one of Fast Image's values
                source={{ uri: LOGO, cache: 1 }}
            />,
            <NoHandlersCase key="no-handlers" />,
            <EventCase
                key="data-uri-cache-only"
                id="data-uri-cache-only"
                description={{
                    checks: "A data uri with cache: 'cacheOnly' loads: its data is the app's own, so cache doesn't apply (it's never downloaded). Android's Glide never loaded one (onlyRetrieveFromCache).",
                    steps: "Loads an 8×8 yellow PNG data uri with cache: 'cacheOnly'. Passes on onLoad.",
                    shows: 'A yellow square.',
                }}
                event="onLoad"
                source={{ uri: YELLOW_DATA_URI, cache: 'cacheOnly' }}
            />,
            <EventCase
                key="data-uri-utf8"
                id="data-uri-utf8"
                description={{
                    checks: "A percent-encoded (utf8, not base64) SVG data uri loads. Android's Glide only read base64 data uris, so it never loaded.",
                    steps: 'Loads a magenta square SVG as a data:image/svg+xml;utf8 uri, with its # written %23. Passes on onLoad.',
                    shows: 'A magenta square.',
                }}
                event="onLoad"
                source={{ uri: MAGENTA_SVG_UTF8_DATA_URI }}
            />,
        ],
    },
    {
        name: 'errors',
        description: {
            checks: "Sources that fail fire onError: a data uri that isn't an image, an empty or null uri, and a 404, whose error says so.",
        },
        cases: [
            <EventCase
                key="error-invalid-data-uri"
                id="error-invalid-data-uri"
                description={{
                    checks: "A data: uri whose data isn't an image fires onError (iOS fired onLoad, with a size of 0x0).",
                    steps: "Loads a data:image/png;base64 uri whose data is the text 'not an image'. Passes on onError.",
                    shows: 'An empty gray square: nothing loads.',
                }}
                event="onError"
                source={{ uri: 'data:image/png;base64,bm90IGFuIGltYWdl' }}
            />,
            <EventCase
                key="error-empty-uri"
                id="error-empty-uri"
                description={{
                    checks: "An empty uri fires onError (#1028: Android didn't fire it).",
                    steps: "Loads { uri: '' }. Passes on onError.",
                    shows: 'An empty gray square: nothing loads.',
                }}
                event="onError"
                source={{ uri: '' }}
            />,
            <EventCase
                key="error-null-uri-default"
                id="error-null-uri-default"
                description={{
                    checks: 'A null uri fires onError and shows defaultSource (#945: Android showed nothing).',
                    steps: 'Loads { uri: null } with a defaultSource bundled in the app. Passes on onError.',
                    shows: "The defaultSource: on iOS an aerial photo of fields; on Android a text field's underline drawable (a short black line near the bottom of the gray square). An empty gray square means defaultSource didn't show.",
                }}
                event="onError"
                source={{ uri: null as unknown as string }}
                defaultSource={DEFAULT}
            />,
            <EventCase
                key="error-null-uri-downsample"
                id="error-null-uri-downsample"
                description={{
                    checks: 'A null uri with downsample fires onError (iOS crashed).',
                    steps: 'Loads { uri: null } with downsample. Passes on onError; a crash fails the whole run.',
                    shows: 'An empty gray square: nothing loads.',
                }}
                event="onError"
                source={{ uri: null as unknown as string }}
                downsample
            />,
            <ErrorMessageCase key="error-message" />,
        ],
    },
    {
        name: 'headers-invalid',
        description: {
            checks: "source.headers that isn't an object of strings (null, an array, values that aren't strings) on views and in FastImage.preload, and a uri that isn't a string.",
        },
        cases: [
            <EventCase
                key="headers-null"
                id="headers-null"
                description={{
                    checks: 'headers: null (e.g. a header object built only when signed in) is treated as no headers, and the image loads (Android crashed).',
                    steps: 'Loads the logo with headers: null. Passes on onLoad.',
                    shows: 'The React logo (light blue) on the gray square.',
                }}
                event="onLoad"
                source={{ uri: LOGO, headers: null as unknown as {} }}
            />,
            <EventCase
                key="headers-array"
                id="headers-array"
                description={{
                    checks: "headers given as an array doesn't stop the image loading (Android crashed).",
                    steps: "Loads the logo with headers: ['x-token']. Passes on onLoad.",
                    shows: 'The React logo (light blue) on the gray square.',
                }}
                event="onLoad"
                source={{ uri: LOGO, headers: ['x-token'] as unknown as {} }}
            />,
            <EventCase
                key="headers-non-string"
                id="headers-non-string"
                description={{
                    checks: "Header values that aren't strings are left out and the string ones still sent (Android crashed; iOS sent no headers at all when one wasn't a string).",
                    steps: "Loads a photo from the image server's /private/ path, which answers 403 without the header x-token: fast-image, with headers { 'x-token': 'fast-image', 'x-null': null, 'x-object': {} }. Passes on onLoad, which needs x-token to have been sent.",
                    shows: "A photo of a bear on rocks, filling the square. An empty gray square means the string header wasn't sent (a 403).",
                }}
                event="onLoad"
                source={{ uri: HEADERS_PRIVATE, headers: INVALID_HEADERS }}
            />,
            <EventCase
                key="uri-non-string"
                id="uri-non-string"
                description={{
                    checks: "A uri that isn't a string fires onError.",
                    steps: 'Loads { uri: 1 }. Passes on onError.',
                    shows: 'An empty gray square: nothing loads.',
                }}
                event="onError"
                source={{ uri: 1 as unknown as string }}
            />,
            <PreloadInvalidHeadersCase key="headers-invalid-preload" />,
        ],
    },
    {
        name: 'no-crash',
        description: {
            checks: 'Props and calls that crashed the app or never loaded: defaultSource without a source, FastImage.preload with missing or unresolvable uris, asset:/ uris (Android), and views with a width or height of 0.',
        },
        cases: [
            <NoCrashCase
                key="default-no-source"
                id="default-no-source"
                description={{
                    checks: 'defaultSource with no source at all (#973: Android crashed).',
                    steps: 'Renders a FastImage with only a defaultSource bundled in the app. Passes if the app is still running 750 ms after it mounts.',
                    shows: "The defaultSource: on iOS an aerial photo of fields; on Android a text field's underline drawable (a short black line near the bottom of the gray square).",
                }}
            >
                <FastImage style={styles.image} defaultSource={DEFAULT} />
            </NoCrashCase>,
            <NoCrashCase
                key="preload-no-uri"
                id="preload-no-uri"
                description={{
                    checks: 'FastImage.preload with sources that have no uri, or a null source (#774: Android crashed).',
                    steps: "Calls FastImage.preload with { uri: '' }, {}, { uri: null } and null. Passes if the app is still running 750 ms later.",
                    shows: 'An empty gray square: the case shows no image.',
                }}
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
                description={{
                    checks: "FastImage.preload with a uri that can't be resolved, a bare file name (#849: Android crashed).",
                    steps: "Calls FastImage.preload with { uri: 'not-a-real-image.jpg' }. Passes if the app is still running 750 ms later.",
                    shows: 'An empty gray square: the case shows no image.',
                }}
                onMount={() =>
                    FastImage.preload([{ uri: 'not-a-real-image.jpg' }])
                }
            />,
            Platform.OS === 'android' ? (
                <EventCase
                    key="asset-uri"
                    id="asset-uri"
                    description={{
                        checks: "An asset:/ uri, a file in the app's Android assets, loads (#1068: Android didn't support them).",
                        steps: 'Loads asset:/fastimage-logo.png. Passes on onLoad.',
                        shows: 'The React logo (light blue) on the gray square.',
                    }}
                    event="onLoad"
                    source={{ uri: 'asset:/fastimage-logo.png' }}
                />
            ) : (
                <NoCrashCase
                    key="asset-uri"
                    id="asset-uri"
                    description={{
                        checks: "asset:/ uris are Android only (#1068), so there's nothing to check on iOS and tvOS.",
                        steps: 'Renders an empty placeholder. Passes 750 ms after it mounts.',
                        shows: 'An empty gray square.',
                    }}
                />
            ),
            <EventCase
                key="zero-size"
                id="zero-size"
                description={{
                    checks: 'An image in a view with a width and height of 0 still loads and fires onLoad (#865: Android never fired it).',
                    steps: 'Loads a photo with style { width: 0, height: 0 }. Passes on onLoad.',
                    shows: 'Nothing: the view has no size.',
                }}
                event="onLoad"
                source={{ uri: imageUrl('picsum/1020-120x120.jpg') }}
                style={{ width: 0, height: 0 }}
            />,
            <EventCase
                key="zero-height"
                id="zero-height"
                description={{
                    checks: 'An image in a view with a width but a height of 0 still loads and fires onLoad (#865: Android never fired it).',
                    steps: 'Loads a photo with style { width: 64, height: 0 }. Passes on onLoad.',
                    shows: 'Nothing: the view is 0 tall.',
                }}
                event="onLoad"
                source={{ uri: imageUrl('picsum/1021-120x120.jpg') }}
                style={{ width: 64, height: 0 }}
            />,
        ],
    },
    {
        name: 'layout',
        description: {
            checks: 'Layout and sizes: onLayout, measure through refs, images in the app by name, tintColor in style, and the image size onLoad reports.',
        },
        cases: [
            <LayoutCase key="layout" id="layout" />,
            <RefMeasureCase key="ref-measure" />,
            <AppImageNameCase key="app-image-name" />,
            <EventCase
                key="tint-style"
                id="tint-style"
                description={{
                    checks: "tintColor in style tints the image, as with React Native's Image (#946: iOS ignored it).",
                    steps: "Loads the logo with style tintColor: 'green'. Passes on onLoad.",
                    shows: 'The React logo in solid green instead of its usual light blue. A light blue logo means the tint was ignored.',
                }}
                event="onLoad"
                source={{ uri: LOGO }}
                style={[styles.image, { tintColor: 'green' }]}
            />,
            <SourceSizeCase
                key="source-size"
                id="source-size"
                description={{
                    checks: "onLoad reports the image's own size, not the size it was decoded at for the view (#608: Android reported the size of the smaller bitmap it decoded).",
                    steps: 'Loads a 600×300 photo into a 48×48 view with objectFit="contain". Passes when onLoad reports 600x300.',
                    shows: 'A wide photo of green cliffs, letterboxed: gray above and below it.',
                }}
                uri={imageUrl('picsum/1018-600x300.jpg')}
                width={600}
                height={300}
            />,
            <SourceSizeCase
                key="source-size-gif"
                id="source-size-gif"
                description={{
                    checks: "onLoad reports a GIF's own size too, not the size it was decoded at for the view (#608).",
                    steps: 'Loads a 500×281 animated GIF of a jellyfish into a 48×48 view with objectFit="contain". Passes when onLoad reports 500x281.',
                    shows: "The jellyfish GIF (a pink and orange jellyfish on deep blue), letterboxed: gray above and below it. Animated, so it isn't compared.",
                }}
                uri={imageUrl('jellyfish.gif')}
                width={500}
                height={281}
                animated
            />,
            <SourceSizeCachedCase key="source-size-cached" />,
        ],
    },
    {
        // FastImage's View style props, on its single native view (10.0).
        name: 'view-style',
        description: {
            checks: "View style props on FastImage's single native view: borders, radii, padding, overflow, opacity, transforms, shadows, backfaceVisibility and tintColor, drawn and clipped as on a View.",
            steps: 'Every image but the last is the same wide photo of green cliffs (2:1) with the default objectFit cover, in a 56 dp square or a 96×56 box. Each case passes once its images have loaded; the screenshot does the checking.',
        },
        cases: VIEW_STYLE_CASES,
    },
    {
        // Checked by screenshot as much as by status.
        name: 'view-style-more',
        description: {
            checks: 'Style changes after the image has loaded (a border removed, overflow switched) and a gradient background, each next to an image that should look the same.',
            steps: 'Each case passes a moment after its change (the gradient on onLoad); the screenshot does the checking.',
        },
        cases: [
            <GradientCase key="style-gradient" />,
            <BorderChangeCase key="style-border-change" />,
            <BorderRemovedCase key="style-border-removed" />,
            <OverflowChangeCase key="style-overflow-change" />,
        ],
    },
    {
        // Checked by screenshot as much as by status.
        name: 'visual',
        description: {
            checks: 'Changes after load, checked by screenshot (tintColor removed, objectFit changed, a view that gets taller), and a GIF without a loop count, checked by a video sample.',
        },
        cases: [
            <ClearTintCase key="clear-tint" />,
            <ObjectFitChangeCropCase key="fit-change" />,
            <GifLoopOnceCase key="gif-loop-once" />,
            <SizeChangeCase key="size-change" />,
        ],
    },
    {
        name: 'gif-loop',
        description: {
            checks: 'The loop and paused props on GIFs: stopping after one or two plays, looping a GIF that plays once, changing loop, pausing, and resuming.',
            steps: 'The GIFs have two frames of a solid color each (0.4 s each, unless a case says otherwise); each case waits for its plays after onLoad.',
        },
        cases: [
            <GifLoopCase
                key="gif-loop-false"
                id="gif-loop-false"
                description={{
                    checks: 'loop={false} plays a GIF that loops forever by itself once, and it stops on its last frame.',
                    steps: 'Loads a GIF that loops forever, red then blue, with loop={false}. Passes 1.4 s after onLoad (one play and a margin).',
                    shows: 'A blue square: the last frame. Red means it was still playing.',
                }}
                loop={false}
                plays={1}
                source="loop-forever.gif"
            />,
            <GifLoopCase
                key="gif-loop-count"
                id="gif-loop-count"
                description={{
                    checks: 'loop={2} plays a GIF that loops forever by itself twice, and it stops on its last frame.',
                    steps: 'Loads a GIF that loops forever, orange then purple, with loop={2}. Passes 2.2 s after onLoad (two plays and a margin).',
                    shows: 'A purple square: the last frame. Orange means it was still playing.',
                }}
                loop={2}
                plays={2}
                source="loop-forever-2.gif"
            />,
            <GifLoopCase
                key="gif-loop-true"
                id="gif-loop-true"
                description={{
                    checks: 'loop (true) keeps a GIF that plays once by itself looping.',
                    steps: "Loads a GIF without a loop count, yellow then green, with loop. Passes 1.4 s after onLoad if the app hasn't crashed.",
                    shows: "A yellow or green square: it's animated, so it's not compared.",
                }}
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
        description: {
            checks: 'imageRendering auto, smooth (iOS only) and pixelated, on images drawn smaller and larger than their size.',
        },
        cases: [
            ...RENDERING_CASES.map((c) => (
                <ImageRenderingCase key={c.id} {...c} />
            )),
            <ImageRenderingChangeCase key="image-rendering-change" />,
        ],
    },
    {
        name: 'blur',
        description: {
            checks: "blurRadius: how much it blurs (in points, whatever the file's size), on other kinds of image, changed after load, and not on defaultSource.",
        },
        cases: [
            <BlurCase key="blur" />,
            <BlurKindsCase key="blur-kinds" />,
            <BlurChangeCase key="blur-change" />,
            <BlurDefaultSourceCase key="blur-default-source" />,
        ],
    },
    {
        name: 'blur-tint',
        description: {
            checks: 'tintColor changed on a blurred image after it has loaded.',
        },
        cases: [<BlurTintChangeCase key="blur-tint-change" />],
    },
    {
        name: 'blur-events',
        // How many of the quick steps' blurs Android runs before the next
        // one replaces them depends on timing.
        countWork: false,
        description: {
            checks: 'blurRadius changed in quick steps after the image has loaded: no load events fire again, and the image ends up with the last radius.',
        },
        cases: [
            <BlurStepsCase
                key="blur-change-twice"
                id="blur-change-twice"
                description={{
                    checks: "blurRadius changed twice, 300 ms apart, after a slow cache: 'web' image has loaded: no load events fire again, and it ends up like an image blurred that much from the start (Android loads the image again for each new blur; a change during that load started the image's load again, which sent onProgress, onLoad and onLoadEnd).",
                    steps: "Loads a photo of a pug with cache: 'web' and onProgress from the slow server, which sends no cache headers, so each load downloads it again (in about 2 s). After its onLoadEnd, sets blurRadius 5, then 10 300 ms later. Fails if a load event fires after that first onLoadEnd or onProgress didn't fire before it; passes 4 s after the last change.",
                    shows: 'Two photos of a pug blurred alike: the one that changed, and one with blurRadius 10 from the start.',
                }}
                source={BLUR_TWICE_SOURCE}
                steps={[5, 10]}
                interval={300}
                progress
            />,
            <BlurStepsCase
                key="blur-change-steps"
                id="blur-change-steps"
                description={{
                    checks: 'blurRadius changed in five steps in renders right after each other (before the next frame), as an animated blur or a slider changes it, after the image has loaded: no load events fire again, and it ends up like an image blurred that much from the start.',
                    steps: 'Loads a photo of a pug. After its onLoadEnd, renders blurRadius 2, 4, 6, 8 and 10, each its own commit. Fails if a load event fires after that first onLoadEnd; passes 4 s after the last step.',
                    shows: 'Two photos of a pug blurred alike: the one that changed, and one with blurRadius 10 from the start.',
                }}
                source={{
                    uri: imageUrl(`picsum/1025-200x200.jpg?blur-steps=${RUN}`),
                }}
                steps={[2, 4, 6, 8, 10]}
            />,
        ],
    },
    {
        // Checked by screenshot.
        name: 'object-fit',
        description: {
            checks: "objectFit's values, checked by screenshot: images larger and smaller than the view, an SVG, with blurRadius, in style, and changed after load.",
        },
        cases: [
            <ObjectFitCase key="object-fit" />,
            <ObjectFitSizeCase key="object-fit-size" />,
            <ObjectFitBlurCase key="object-fit-blur" />,
            <ObjectFitSvgCase key="object-fit-svg" />,
            <ObjectFitSvgChangeCase key="object-fit-svg-change" />,
            <ObjectFitFromCoverCase key="object-fit-from-cover" />,
            <ObjectFitStyleCase key="object-fit-style" />,
            <ObjectFitChangeCase key="object-fit-change" />,
        ],
    },
    {
        // A new fit sends no load events (Android loaded the image again,
        // with onLoadStart, onLoad and onLoadEnd).
        name: 'object-fit-events',
        description: {
            checks: 'Changing objectFit after load sends no load events again.',
        },
        cases: [
            <ObjectFitEventsCase
                key="object-fit-events"
                id="object-fit-events"
                uri={imageUrl('center-large.png')}
            />,
            <ObjectFitEventsCase
                key="object-fit-events-gif"
                id="object-fit-events-gif"
                uri={imageUrl('jellyfish.gif')}
            />,
        ],
    },
    {
        // Changes after load: a new position sends no load events (Android
        // loaded the image again, with onLoadStart, onLoad and onLoadEnd),
        // and a fade into a positioned image keeps it in place (iOS moved the
        // image view during the fade, with its clip already moved).
        name: 'object-position-changes',
        description: {
            checks: 'Changes after load with objectPosition: a new position sends no load events, and a fade into a positioned image keeps it in place.',
        },
        cases: [
            <PositionEventsCase key="position-events" id="position-events" />,
            <PositionEventsCase
                key="position-events-full-size"
                id="position-events-full-size"
                downsample={false}
            />,
            <PositionEventsCase
                key="position-events-gif"
                id="position-events-gif"
                uri={imageUrl('jellyfish.gif')}
            />,
            <FadeCase
                key="fade-placeholder-positioned"
                id="fade-placeholder-positioned"
                from="placeholder"
                positioned
                fades
                description={{
                    checks: "A transition into an image with objectPosition left cross-dissolves from defaultSource with the image in place (iOS moved the image view during the fade, with its clip already moved, so the view's black background showed at its edge).",
                    steps: "A 48-point view on black, with a magenta defaultSource and no source; 500 ms later its source becomes a wide cyan image (600x300) from the slow server (about 350 ms), with cover, objectPosition 'left' and a 1 s transition. A video sample records the view's right 4 pixels.",
                    shows: 'A cyan square. The recording sees magenta, then blue-violet (halfway), then cyan; black must never appear.',
                }}
            />,
        ],
    },
    {
        // Checked by screenshot.
        name: 'object-position',
        description: {
            checks: "objectPosition's values, checked by screenshot: with cover, contain, none and scale-down, with the view's style and other props, changed after load, and for defaultSource.",
        },
        cases: [
            <ObjectPositionCoverCase key="object-position-cover" />,
            <ObjectPositionContainCase key="object-position-contain" />,
            <ObjectPositionStyleCase key="object-position-style" />,
            <ObjectPositionChangeCase key="object-position-change" />,
            <ObjectPositionDefaultSourceCase key="object-position-default-source" />,
        ],
    },
    {
        name: 'downsampling',
        description: {
            checks: "downsample decodes large images at about the view's size, keeping them sharp, upright and at their own reported size.",
        },
        cases: [
            <DownsampleCase
                key="downsample-stripes"
                id="downsample-stripes"
                description={{
                    checks: "downsample decodes a large image at about the view's size, and onLoad still reports the image's own size.",
                    steps: 'Loads a 1024x1024 image of 1-pixel black and white stripes into two 48-point views with cover: the left with downsample, the right with downsample={false}. Passes once both onLoad events report 1024x1024.',
                    shows: 'On iOS, an even gray square (the stripes averaged), then the stripes drawn smaller. On Android, a black square (Glide keeps every nth pixel of a PNG), then wide soft gray bands (the stripes, aliased).',
                }}
                image="stripes.png"
                size="1024x1024"
                style={downsampleStyles.stripes}
            />,
            <DownsampleCase
                key="downsample-cover"
                id="downsample-cover"
                description={{
                    checks: 'downsample with cover decodes a wide image large enough to cover a tall view, not to fit in it, and shows it a pixel per pixel on whole pixels (on iOS, centered, it was on a half pixel: blurred).',
                    steps: 'Loads a 1600x1000 page of text into two 40x96 views with cover: the left with downsample, the right with downsample={false}. Passes once both onLoad events report 1600x1000.',
                    shows: "Two tall crops of the middle of the page, both sharp: the left smooth (the page averaged to the view's size), the right crisper and more jagged (the whole page drawn smaller). Blurry text on the left is a failure.",
                }}
                image="text-page.png"
                size="1600x1000"
                style={downsampleStyles.tall}
            />,
            <DownsampleCase
                key="downsample-orientation"
                id="downsample-orientation"
                description={{
                    checks: "downsample keeps a JPEG's EXIF orientation: an image stored sideways shows upright, as sharp as without downsample.",
                    steps: 'Loads a JPEG stored sideways with EXIF orientation 6 (800x1200 upright) into two 64x96 views with objectFit="contain": the left with downsample, the right with downsample={false}. Passes once both onLoad events report 800x1200.',
                    shows: 'Two upright blue arrows over the word UP, each in a red frame, equally sharp. A sideways arrow is a failure.',
                }}
                image="exif-rotated.jpg"
                size="800x1200"
                style={downsampleStyles.rotated}
                objectFit="contain"
            />,
            <DownsampleOverLimitCase key="downsample-over-limit" />,
            <DownsampleOverLimitSharedCase key="downsample-over-limit-shared" />,
            <DownsampleMemoryCase key="downsample-memory" />,
            <DownsamplePreloadCase key="downsample-preload" />,
        ],
    },
    {
        name: 'downsampling-reload',
        description: {
            checks: 'downsample decoding an image again or sharing its download: larger and growing views, a view without a size, a GIF, a preload in flight, and the order images start in.',
        },
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
        name: 'downsample-zoom',
        description: {
            checks: "downsample={false} keeps an image that's zoomed in on with a transform sharp.",
        },
        cases: [<DownsampleZoomCase key="downsample-zoom" />],
    },
    {
        // A crash takes the app down: on its own.
        name: 'large-view',
        description: {
            checks: 'An image in a view far larger than the screen shows: a still image, one cross-dissolving to a new source, a GIF and a placeholder url.',
        },
        cases: [
            <LargeViewCase key="large-view" />,
            <LargeViewFadeCase key="large-view-fade" />,
            <LargeViewGifCase key="large-view-gif" />,
            <LargeViewPlaceholderCase key="large-view-placeholder" />,
        ],
    },
    {
        name: 'downsample-from-disk',
        description: {
            checks: "downsample={false} decodes at full size an image that's on disk but not in memory while a downsampled view of it loads.",
        },
        cases: [<DownsampleFromDiskCase key="downsample-from-disk" />],
    },
    {
        name: 'loading',
        description: {
            checks: "Loading: props that don't reload, source changes, onLoadStart and onProgress, cache: 'web' and cookies.",
        },
        cases: [
            <NoReloadCase key="no-reload" />,
            <SourceSwapCase key="source-swap" />,
            <LoadStartOnceCase key="load-start-once" />,
            <ProgressCase key="progress" />,
            <ProgressUnknownSizeCase key="progress-unknown-size" />,
            <ProgressGzipCase key="progress-gzip" />,
            <WebCacheCase key="web-cache" />,
            <WebCacheCase key="web-cache-avif" avif />,
            <CookiesCase key="cookies" />,
        ],
    },
    {
        name: 'progress-data-uri',
        description: {
            checks: 'onProgress for a data: image.',
        },
        cases: [<ProgressDataUriCase key="progress-data-uri" />],
    },
    {
        // Loads many images and churns views, so on its own. How many views
        // mount while the downloads last depends on timing.
        name: 'progress-shared-url',
        countWork: false,
        description: {
            checks: 'onProgress for many images on one url while others on it mount and unmount.',
        },
        cases: [<ProgressSharedUrlCase key="progress-shared-url" />],
    },
    {
        name: 'progress-by-url',
        description: {
            checks: 'onProgress reaching the right images when downloads are shared, urls are written differently or the server holds part of the download.',
        },
        cases: [
            <ProgressAfterLoadCase key="progress-after-load" />,
            <ProgressUrlFormCase key="progress-url-form" />,
            <ProgressCacheKeyCase key="progress-cache-key" />,
            <ProgressHeldBytesCase key="progress-held-bytes" />,
        ],
    },
    {
        // Holds sixteen downloads, so on its own.
        name: 'download-queue',
        description: {
            checks: "Android's downloads waiting to start: the priority and url a waiting download has as requests for it join and leave (three checks on one set of images).",
        },
        cases: [
            Platform.OS === 'android' ? (
                <PriorityLoweredCase key="priority-lowered" />
            ) : (
                <NoCrashCase
                    key="priority-lowered"
                    id="priority-lowered"
                    description={{
                        checks: "A waiting download's priority after a more urgent request for it leaves, and the url it downloads. Android only: iOS's downloads are SDWebImage's, whose order depends on timing.",
                        steps: 'Nothing to load on iOS: passes if the app is still running a moment after it mounts.',
                        shows: 'An empty gray square.',
                    }}
                />
            ),
        ],
    },
    {
        // Twenty-one downloads at once, so on its own.
        name: 'download-priority',
        description: {
            checks: "An image with priority: 'high' that starts loading after twenty others is downloaded before most of them.",
        },
        cases: [<DownloadPriorityCase key="download-priority" />],
    },
    {
        name: 'shared-downloads',
        description: {
            checks: 'Downloads shared by several images of one url (one request for all of them), through unmounts, errors and responses without a Content-Length, and a download that stalls.',
            steps: 'The images come from the slow server, which sends each in eight parts with a pause between them, and can hold the rest of a response until the case releases it. The images have no background, so where nothing shows the screen is white.',
        },
        cases: [
            <SharedDownloadSizesCase key="shared-download-sizes" />,
            <SharedDownloadCancelCase key="shared-download-cancel" />,
            <SharedDownloadErrorCase key="shared-download-error" />,
            <SharedDownloadChunkedCase key="shared-download-chunked" />,
            <ChunkedDownloadCancelCase key="chunked-download-cancel" />,
            <StalledDownloadCase key="stalled-download" />,
        ],
    },
    {
        // A cacheKey's urls when one fails (the shared download's retry).
        name: 'cachekey-retries',
        description: {
            checks: "Images with one cacheKey and different urls when one url fails: on Android, which shares one download per cacheKey, the download is retried with another of the cacheKey's urls.",
            steps: "In each case the first image's url 404s; the slow server holds that response until another image with the same cacheKey has mounted. The images have no background, so where nothing shows the screen is white.",
        },
        cases: [
            <SharedDownloadRetryCase key="shared-download-retry" />,
            <RetryProgressCase key="retry-progress" />,
            <RetryLatestUrlCase key="retry-latest-url" />,
            <RetryNewerUrlCase key="retry-newer-url" />,
        ],
    },
    {
        // Clears the caches, so on its own.
        name: 'web-cache-clear',
        description: {
            checks: "FastImage.clearDiskCache also clears the HTTP cache that cache: 'web' images use.",
        },
        cases: [<WebCacheClearCase key="web-cache-clear" />],
    },
    {
        // Clears the caches, so on its own.
        name: 'web-cache-clear-preload',
        description: {
            checks: "A cache: 'web' image preloaded right after FastImage.clearDiskCache resolves is downloaded again, not taken from the HTTP cache.",
        },
        cases: [<WebCacheClearPreloadCase key="web-cache-clear-preload" />],
    },
    {
        // The slow ones: the slow server takes about 1 s per image here, and
        // preload-limit loads 4 of them, 3 at a time.
        name: 'preload',
        description: {
            checks: 'FastImage.preload: what it downloads and caches, the headers it sends, how many sources it loads at once, its results, and the source values it accepts.',
        },
        cases: [
            <PreloadCase key="preload" />,
            <PreloadHeadersCase key="preload-headers" />,
            <PreloadReuseCase key="preload-reuse" />,
            <PreloadResultsCase key="preload-results" />,
            <PreloadLimitCase key="preload-limit" />,
            <PreloadDiskCase key="preload-disk" />,
            <PreloadCacheOnlyCase key="preload-cache-only" />,
            <PreloadRetryCase key="preload-retry" id="preload-retry" />,
            <PreloadUnknownValuesCase key="preload-unknown-values" />,
        ],
    },
    {
        name: 'bad-responses',
        description: {
            checks: "Urls whose response isn't the image (an HTML page, a 503, a 404): a later load downloads them again, and a failure isn't requested twice; and an image sent with the wrong Content-Type still loads.",
        },
        cases: [
            <PreloadRetryCase
                key="preload-retry-web"
                id="preload-retry-web"
                web
            />,
            <ViewRetryCase key="view-retry" />,
            <ReloadCase key="reload" />,
            <MislabeledCase key="mislabeled" />,
            <Web404Case key="web-404" />,
        ],
    },
    {
        name: 'cache-key',
        description: {
            checks: 'source.cacheKey, which caches an image under a key of its own instead of its url, and memoryCache: false.',
        },
        cases: [
            <CacheKeyCase
                key="cache-key"
                id="cache-key"
                description={{
                    checks: 'source.cacheKey: an image whose url has another token but the same cacheKey comes from the cache (#524: a key for images whose url changes, like short-lived private urls).',
                    steps: 'Loads a photo with ?token=a and a cacheKey; once it has loaded, a second view (downsample false) loads it with ?token=b and the same cacheKey. Passes when the second has loaded and the server got no request for the token=b url.',
                    shows: 'Two photos of a pug in a blanket side by side. An empty gray square on the right means the second never loaded.',
                }}
            />,
            <CacheKeyCase
                key="cache-key-preload"
                id="cache-key-preload"
                preload
                description={{
                    checks: 'source.cacheKey with FastImage.preload: a preloaded image is found under its cacheKey by a view of another url.',
                    steps: 'Preloads a photo with ?token=a and a cacheKey; once the preload resolves, a view loads it with ?token=b and the same cacheKey. Passes when the view has loaded and the server got no request for the token=b url.',
                    shows: 'An empty gray square (the preload has no view), then a photo of a pug in a blanket.',
                }}
            />,
            <CacheKeyCase
                key="cache-key-downsample"
                id="cache-key-downsample"
                downsample
                description={{
                    checks: 'source.cacheKey with downsample: a view that downsamples finds the file downloaded for the cacheKey instead of requesting its own url.',
                    steps: 'Loads a photo with ?token=a and a cacheKey; once it has loaded, a second view with downsample loads it with ?token=b and the same cacheKey. Passes when the second has loaded and the server got no request for the token=b url.',
                    shows: 'Two photos of a pug in a blanket side by side.',
                }}
            />,
            <MemoryCacheOffCase key="memory-cache-off" />,
        ],
    },
    {
        name: 'cache-only',
        description: {
            checks: "Views with cache: 'cacheOnly', or React Native's 'only-if-cached', for an image that isn't cached.",
        },
        cases: [
            <CacheOnlyMissCase key="cache-only-miss" />,
            <CacheOnlyMissCase
                key="only-if-cached-miss"
                id="only-if-cached-miss"
                cache="only-if-cached"
                description={{
                    checks: "React Native's cache: 'only-if-cached' works as cacheOnly: an image that isn't cached gets onError and onLoadEnd (not ok), without a request.",
                    steps: "Loads a photo of a pug that nothing has loaded (a url only this case uses) with cache: 'only-if-cached'. When onError fires, asks the image server how many requests it got for the url. Passes if it got none, onLoadEnd's ok was false, and onLoad never fired.",
                    shows: 'An empty gray square: the image is never loaded. The pug here would mean it was downloaded.',
                }}
            />,
        ],
    },
    {
        name: 'disk-cache',
        description: {
            checks: "source.diskCache false: the image isn't kept on disk or in an HTTP cache, or read from them.",
        },
        cases: [
            <DiskCacheOffCase key="disk-cache-off" />,
            <DiskCacheOffWebCase key="disk-cache-off-web" />,
        ],
    },
    {
        name: 'cache-path',
        description: {
            checks: "FastImage.getCachePath: the file of a source's image in the disk cache, or not ok when there isn't one.",
        },
        cases: [
            <CachePathCase
                key="cache-path"
                id="cache-path"
                loaded
                description={{
                    checks: 'getCachePath for an image a view has loaded gives its file in the disk cache.',
                    steps: "A view loads a 120×120 photo of a green aurora over a tree. On its onLoad, calls getCachePath with the same source and shows the file it gives in a second view, as a file:// uri. Passes once that view loads and the image server got one request for the url (the first view's).",
                    shows: 'The aurora photo twice: the view, then its file.',
                }}
            />,
            <CachePathCase
                key="cache-path-key"
                id="cache-path-key"
                loaded
                byCacheKey
                description={{
                    checks: 'getCachePath for an image with a cacheKey, which a view has loaded, gives its file.',
                    steps: 'A view loads the aurora photo with a cacheKey. On its onLoad, calls getCachePath with the same uri and cacheKey and shows the file it gives in a second view. Passes once that view loads and the image server got one request.',
                    shows: 'The aurora photo twice: the view, then its file.',
                }}
            />,
            <CachePathCase
                key="cache-path-download"
                id="cache-path-download"
                description={{
                    checks: "getCachePath for an image that wasn't loaded downloads it and gives its file.",
                    steps: 'Calls getCachePath for the aurora photo (a url nothing has loaded) on mount, and shows the file it gives. Passes once that view loads and the image server got exactly one request (the download).',
                    shows: 'An empty gray square (no view loads the url), then the aurora photo from the file.',
                }}
            />,
            <CachePathCase
                key="cache-path-cache-only"
                id="cache-path-cache-only"
                cacheOnly
                description={{
                    checks: "getCachePath with cache: 'cacheOnly' for an image that wasn't loaded resolves not ok, without downloading it.",
                    steps: "Calls getCachePath for the aurora photo (a url nothing has loaded) with cache: 'cacheOnly' on mount. Passes if it resolves not ok and the image server got no request for the url.",
                    shows: 'Two empty gray squares: no view loads the url, and there is no file to show. The photo on the right would mean it was downloaded.',
                }}
            />,
            <CachePathCase
                key="cache-path-404"
                id="cache-path-404"
                missing
                description={{
                    checks: 'getCachePath for a url that 404s resolves not ok, with the status in its error.',
                    steps: 'Calls getCachePath on mount for a url the image server answers with a 404. Passes if it resolves not ok with an error that has 404 in it.',
                    shows: "Two empty gray squares: there's no image and no file.",
                }}
            />,
            <CachePathCase
                key="cache-path-space"
                id="cache-path-space"
                loaded
                space
                description={{
                    checks: 'getCachePath for a url with a space in it gives its file (iOS caches such a url escaped).',
                    steps: 'A view loads the aurora photo from a url with a space in its query (name=a b). On its onLoad, calls getCachePath with the same source and shows the file it gives. Passes once that view loads and the image server got one request.',
                    shows: 'The aurora photo twice: the view, then its file.',
                }}
            />,
        ],
    },
    {
        name: 'cache-path-more',
        description: {
            checks: "More getCachePath cases: cache: 'web' images, only a cacheKey, and an image still downloading.",
        },
        cases: [
            <CachePathCase
                key="cache-path-web"
                id="cache-path-web"
                loaded
                web
                description={{
                    checks: "getCachePath for an image loaded with cache: 'web' gives its file (on Android, in the HTTP cache).",
                    steps: "A view loads the aurora photo with cache: 'web', from a url the image server sends with Cache-Control: max-age=3600. On its onLoad, calls getCachePath with the same source and shows the file it gives. Passes once that view loads and the image server got one request.",
                    shows: 'The aurora photo twice: the view, then its file.',
                }}
            />,
            <CachePathCase
                key="cache-path-web-cache-only"
                id="cache-path-web-cache-only"
                loaded
                web
                cacheOnly
                description={{
                    checks: "getCachePath with cache: 'cacheOnly' finds an image a view loaded with cache: 'web', on both platforms.",
                    steps: "A view loads the aurora photo with cache: 'web' (sent with max-age=3600). On its onLoad, calls getCachePath with the same uri and cache: 'cacheOnly' and shows the file it gives. Passes once that view loads and the image server got one request.",
                    shows: 'The aurora photo twice: the view, then its file.',
                }}
            />,
            <CachePathCase
                key="cache-path-key-only"
                id="cache-path-key-only"
                loaded
                keyOnly
                description={{
                    checks: 'getCachePath with only a cacheKey (no uri) finds the file of an image a view loaded with that cacheKey.',
                    steps: "A view loads the aurora photo with a cacheKey. On its onLoad, calls getCachePath with only the cacheKey and shows the file it gives. Passes once that view loads and the image server got one request (the view's).",
                    shows: 'The aurora photo twice: the view, then its file.',
                }}
            />,
            <CachePathCase
                key="cache-path-key-only-missing"
                id="cache-path-key-only-missing"
                keyOnly
                description={{
                    checks: "getCachePath with only a cacheKey that isn't cached resolves not ok, without a request.",
                    steps: 'Calls getCachePath on mount with only a cacheKey nothing has used. Passes if it resolves not ok and the image server got no request.',
                    shows: "Two empty gray squares: no view loads the image, and there's no file to show.",
                }}
            />,
            <CachePathCase
                key="cache-path-while-loading"
                id="cache-path-while-loading"
                whileLoading
                description={{
                    checks: "getCachePath while a view is still downloading the image gives its file, and shares the view's download (Android downloaded it a second time with Glide).",
                    steps: 'A view loads the aurora photo from the slow server (in 8 parts, 150 ms apart). On its onLoadStart, calls getCachePath with the same source and shows the file it gives. Passes once that view loads and the slow server got one request for both.',
                    shows: 'The aurora photo twice: the view, then its file.',
                }}
            />,
            <CachePathCase
                key="cache-path-data-uri"
                id="cache-path-data-uri"
                dataUri
                description={{
                    checks: 'getCachePath for a data uri stores its image in the disk cache and gives its file (Android resolved not ok: "Not a remote image").',
                    steps: 'Calls getCachePath on mount for an 8×8 yellow PNG data uri that no view has shown (it has a parameter of its own), and shows the file it gives. Passes once that view loads.',
                    shows: 'An empty gray square, then a yellow square from the file.',
                }}
            />,
        ],
    },
    {
        // Clears the disk cache, so on its own.
        name: 'cache-path-after-clear',
        description: {
            checks: 'getCachePath after FastImage.clearDiskCache(), for an image getCachePath downloaded.',
        },
        cases: [
            <CachePathAfterClearCase
                key="cache-path-after-clear"
                id="cache-path-after-clear"
                description={{
                    checks: "After clearDiskCache, getCachePath with cache: 'cacheOnly' doesn't find an image, and without it downloads the image again (#1294: Android kept the file's path in Glide's memory cache, so both gave the old path, though the clear had deleted the file).",
                    steps: "getCachePath downloads the aurora photo; then awaits FastImage.clearDiskCache(); then getCachePath with cache: 'cacheOnly', and then without it. Passes if the cacheOnly call resolves not ok, the other gives a file that's there, and the image server got two requests (the first download and the one after the clear).",
                    shows: 'An empty gray square: the case shows no image.',
                }}
            />,
        ],
    },
    {
        // Clears the disk cache, so on its own.
        name: 'cache-path-after-clear-loaded',
        description: {
            checks: 'getCachePath after FastImage.clearDiskCache(), for an image a view showed.',
        },
        cases: [
            <CachePathAfterClearCase
                key="cache-path-after-clear-loaded"
                id="cache-path-after-clear-loaded"
                loaded
                description={{
                    checks: "After clearDiskCache, getCachePath with cache: 'cacheOnly' doesn't find an image a view showed, and without it downloads the image again (#1294: Android kept the result of its lookup on disk in Glide's memory cache, so both gave the old path, though the clear had deleted the file).",
                    steps: "A view loads the aurora photo. On its onLoad, getCachePath finds its file; then awaits FastImage.clearDiskCache(); then getCachePath with cache: 'cacheOnly', and then without it. Passes if the cacheOnly call resolves not ok, the other gives a file that's there, and the image server got two requests (the view's and the one after the clear).",
                    shows: 'The aurora photo: the view, which keeps showing it after the clear.',
                }}
            />,
        ],
    },
    {
        // Clears the disk cache, so on its own.
        name: 'clear-disk-cache-thread',
        description: {
            checks: "FastImage.clearDiskCache() doesn't hold up native calls made after it.",
        },
        cases: [<ClearDiskCacheThreadCase key="clear-disk-cache-thread" />],
    },
    {
        name: 'write-to-cache',
        description: {
            checks: "FastImage.writeToCache: storing a local file as a source's image, and the cases where it resolves not ok.",
        },
        cases: [
            <WriteToCacheCase
                key="write-to-cache"
                id="write-to-cache"
                description={{
                    checks: "writeToCache stores a local file as a url's image: a view of the url shows the file, without a request.",
                    steps: "getCachePath downloads the aurora photo, and writeToCache stores its file as the image of a pug photo's url that nothing has loaded. Then a view shows that url. Passes on its onLoad if the image server got no request for the url.",
                    shows: 'The green aurora photo, not the pug the url would download.',
                }}
            />,
            <WriteToCacheCase
                key="write-to-cache-avif"
                id="write-to-cache-avif"
                avif
                description={{
                    checks: "writeToCache with an AVIF file: a view of the url shows it, without a request (iOS rejected the file as not an image, since SDWebImage's format check didn't know AVIF; fixed in #1239).",
                    steps: "getCachePath downloads an AVIF of four colored quadrants, and writeToCache stores its file as the image of a pug photo's url. Then a view shows that url. Passes on its onLoad if the image server got no request for the url.",
                    shows: 'Four quadrants: red, green, blue and yellow. The pug would mean the url was downloaded.',
                }}
            />,
            <WriteToCacheCase
                key="write-to-cache-key"
                id="write-to-cache-key"
                byCacheKey
                description={{
                    checks: 'writeToCache for a source with a cacheKey: a view of that source shows the stored file, without a request.',
                    steps: "getCachePath downloads the aurora photo, and writeToCache stores its file for a pug photo's url with a cacheKey. Then a view shows the same url and cacheKey. Passes on its onLoad if the image server got no request for the url.",
                    shows: 'The green aurora photo, not the pug.',
                }}
            />,
            <WriteToCacheCase
                key="write-to-cache-key-only"
                id="write-to-cache-key-only"
                keyOnly
                description={{
                    checks: 'writeToCache with only a cacheKey (no uri): a view of a url with that cacheKey shows the stored file, without a request.',
                    steps: "getCachePath downloads the aurora photo, and writeToCache stores its file under only a cacheKey. Then a view shows a pug photo's url with that cacheKey. Passes on its onLoad if the image server got no request for the url.",
                    shows: 'The green aurora photo, not the pug.',
                }}
            />,
            <WriteToCacheCase
                key="write-to-cache-cached"
                id="write-to-cache-cached"
                cached
                description={{
                    checks: "writeToCache for a url that's already cached doesn't replace its image: it resolves not ok.",
                    steps: "getCachePath downloads the aurora photo (the file) and the pug photo's url (so it's cached). Then writeToCache stores the file for the pug's url. Passes if it resolves not ok with 'Already in the disk cache'.",
                    shows: 'An empty gray square: no view is shown.',
                }}
            />,
            <WriteToCacheCase
                key="write-to-cache-missing"
                id="write-to-cache-missing"
                missing
                description={{
                    checks: "writeToCache with a file that doesn't exist resolves not ok.",
                    steps: 'Calls writeToCache for a pug photo\'s url with file:///no/such/image.jpg. Passes if it resolves not ok with "Can\'t read the file".',
                    shows: 'An empty gray square: no view is shown.',
                }}
            />,
            <WriteToCacheCase
                key="write-to-cache-web"
                id="write-to-cache-web"
                web
                description={{
                    checks: "writeToCache for a cache: 'web' source resolves not ok: those images are kept by HTTP caching, not stored this way.",
                    steps: "getCachePath downloads the aurora photo, and writeToCache stores its file for a pug photo's url with cache: 'web'. Passes if it resolves not ok with \"Can't store cache: 'web'\".",
                    shows: 'An empty gray square: no view is shown.',
                }}
            />,
        ],
    },
    {
        name: 'source-change',
        description: {
            checks: 'Changing or clearing source while a slow image is still loading: the old load is cancelled, sends no events, and never replaces what is shown.',
        },
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
        // Video samples, stepped where the app can pause its animations.
        name: 'fade',
        description: {
            checks: 'transition fades an image in when it loads: downloads and blurred images fade, images from the memory cache show at once unless skipOnCacheHit is none.',
            steps: "Video samples: each case makes its change with the app's animations paused, then they're stepped through the fade with a screenshot at 0, 25, 50, 75 and 100% (where the app can't pause them, the screen is recorded). The color in the middle of its black 48 × 48 view must go through the listed colors in order. The runner turns fades off by default; these cases pass transition { duration: 1000 } (1 s), with the other settings each names.",
        },
        cases: [
            <FadeCase
                key="fade"
                id="fade"
                from="download"
                fades
                description={{
                    checks: 'transition fades a downloaded image in over its duration.',
                    steps: 'A black view mounts with a cyan image from the slow server (about 350 ms to download), with transition { duration: 1000 }. Recorded from the mount until 1.5 s after onLoad.',
                    shows: 'Recorded: black, then one steady fade through teal (half cyan) to cyan. At the end, a cyan square.',
                }}
            />,
            <FadeCase
                key="fade-memory"
                id="fade-memory"
                from="memory"
                fades={false}
                description={{
                    checks: "With transition's default skipOnCacheHit ('memory'), an image from the memory cache shows at once, without a fade.",
                    steps: 'A view (left) loads a cyan image; once it has, a second view (right, on black) mounts with the same source and transition { duration: 1000 }, so it comes from the memory cache. Recorded on the right until 1.5 s after its onLoad.',
                    shows: 'Recorded: black, then cyan; never teal (half cyan, a fade). At the end, two cyan squares.',
                }}
            />,
            <FadeCase
                key="fade-memory-none"
                id="fade-memory-none"
                from="memory"
                skipOnCacheHit="none"
                fades
                description={{
                    checks: "transition with skipOnCacheHit: 'none' fades in an image from the memory cache too.",
                    steps: "A view (left) loads a cyan image; once it has, a second view (right, on black) mounts with the same source and transition { duration: 1000, skipOnCacheHit: 'none' }, so it comes from the memory cache.",
                    shows: 'Recorded on the right: black, teal (half cyan), cyan. At the end, two cyan squares.',
                }}
            />,
            <FadeCase
                key="fade-blur"
                id="fade-blur"
                from="download"
                blurRadius={6}
                fades
                description={{
                    checks: 'transition with blurRadius: a downloaded image fades in already blurred.',
                    steps: 'A black view mounts with a cyan image from the slow server (about 350 ms), with blurRadius={6} and transition { duration: 1000 }. Blurring a flat color keeps it, so the colors are those of a plain fade.',
                    shows: 'Recorded: black, teal (half cyan), cyan. At the end, a cyan square.',
                }}
            />,
        ],
    },
    {
        // Video samples, stepped where the app can pause its animations.
        name: 'fade-web',
        description: {
            checks: "cache: 'web' images shown again: they show at once without transition and with it, and fade in with skipOnCacheHit none (Android faded them in each time, from its HTTP cache).",
            steps: "Video samples, as in the fade group. In each case a view (left) loads a cyan image the server sends with Cache-Control: max-age=3600, with cache: 'web'; then a second view (right, on black) mounts with the same source: Android reads it from its HTTP cache without a request, iOS from the memory cache.",
        },
        cases: [
            <FadeCase
                key="fade-web"
                id="fade-web"
                from="web"
                defaultTransition
                fades={false}
                description={{
                    checks: "Without transition (the built-in default), a cache: 'web' image shown again from its HTTP cache shows at once (Android faded it in each time).",
                    steps: 'The right view has no transition prop, and the built-in default is turned back on for it (FastImage.setDefaults({ transition: null })), which fades on Android (300 ms) and not on iOS.',
                    shows: 'Recorded on the right: black, then cyan; never teal (half cyan, a fade). At the end, two cyan squares.',
                }}
            />,
            <FadeCase
                key="fade-web-transition"
                id="fade-web-transition"
                from="web"
                fades={false}
                description={{
                    checks: "transition: a cache: 'web' image shown again shows at once, on Android from its HTTP cache (Android faded it in each time).",
                    steps: 'The right view has transition { duration: 1000 }.',
                    shows: 'Recorded on the right: black, then cyan; never teal (half cyan, a fade). At the end, two cyan squares.',
                }}
            />,
            <FadeCase
                key="fade-web-none"
                id="fade-web-none"
                from="web"
                skipOnCacheHit="none"
                fades
                description={{
                    checks: "transition with skipOnCacheHit: 'none' fades in a cache: 'web' image shown again from its HTTP cache.",
                    steps: "The right view has transition { duration: 1000, skipOnCacheHit: 'none' }.",
                    shows: 'Recorded on the right: black, teal (half cyan), cyan. At the end, two cyan squares.',
                }}
            />,
        ],
    },
    {
        // Video samples, stepped where the app can pause its animations.
        name: 'fade-default',
        description: {
            checks: 'The built-in default transition: downloads fade in on Android (300 ms) and show at once on iOS.',
            steps: 'A video sample, as in the fade group.',
        },
        cases: [
            <FadeCase
                key="fade-default"
                id="fade-default"
                from="download"
                defaultTransition
                fades={Platform.OS === 'android'}
                description={
                    Platform.OS === 'android'
                        ? {
                              checks: 'Without transition, a downloaded image fades in by default on Android (300 ms).',
                              steps: 'A black view mounts with a cyan image from the slow server (about 350 ms) and no transition prop, with the built-in default turned back on (FastImage.setDefaults({ transition: null }); the runner turns fades off otherwise).',
                              shows: 'Recorded: black, teal (half cyan), cyan. At the end, a cyan square.',
                          }
                        : {
                              checks: 'Without transition, a downloaded image shows at once by default on iOS.',
                              steps: 'A black view mounts with a cyan image from the slow server (about 350 ms) and no transition prop, with the built-in default turned back on (FastImage.setDefaults({ transition: null }); the runner turns fades off otherwise).',
                              shows: 'Recorded: black, then cyan; never teal (half cyan, a fade). At the end, a cyan square.',
                          }
                }
            />,
        ],
    },
    {
        // Video samples, stepped where the app can pause its animations.
        name: 'fade-source',
        description: {
            checks: 'transition by where the image comes from: a new source from the memory cache shows at once, local files and bundled images fade in.',
            steps: 'Video samples, as in the fade group.',
        },
        cases: [
            <FadeCase
                key="fade-change"
                id="fade-change"
                from="change"
                fades={false}
                description={{
                    checks: 'transition without betweenImages: a new source from the memory cache replaces the image showing at once, as in a reused list row.',
                    steps: "A view (left) loads a cyan image; a second one (right, on black) shows a magenta image, with transition { duration: 1000 }. Once both have loaded (and 1.5 s more for the fades), the right view's source changes to the cyan one, from the memory cache.",
                    shows: 'Recorded on the right: magenta, then cyan; never blue-violet (a cross-dissolve). At the end, two cyan squares.',
                }}
            />,
            <FadeCase
                key="fade-file"
                id="fade-file"
                from="file"
                fades
                description={{
                    checks: "transition fades in a local file:// image: it isn't a memory cache hit.",
                    steps: 'A view (left) loads a cyan image; FastImage.getCachePath gives its file in the disk cache, and a second view (right, on black) mounts with that file as a file:// source and transition { duration: 1000 }.',
                    shows: 'Recorded on the right: black, teal (half cyan), cyan. At the end, two cyan squares.',
                }}
            />,
            <FadeCase
                key="fade-bundled"
                id="fade-bundled"
                from="bundled"
                fades
                description={{
                    checks: 'transition fades in a bundled require() image too, not only downloaded ones.',
                    steps: "A black view mounts with require('./images/cyan.png') (from Metro in debug builds, from the app in release builds) and transition { duration: 1000 }.",
                    shows: 'Recorded: black, teal (half cyan), cyan. At the end, a cyan square.',
                }}
            />,
        ],
    },
    {
        // Video samples, stepped where the app can pause its animations.
        name: 'fade-between',
        description: {
            checks: "transition's betweenImages: without it a new source replaces the image showing at once, with it the new image cross-dissolves from the old one.",
            steps: 'Video samples, as in the fade group. Each view shows a magenta image first, then its source changes to cyan.',
        },
        cases: [
            <FadeCase
                key="fade-change-download"
                id="fade-change-download"
                from="change-download"
                fades={false}
                description={{
                    checks: 'transition without betweenImages: a new source that downloads replaces the image showing at once, once it has loaded.',
                    steps: 'The view (on black) shows a magenta image, with transition { duration: 1000 }; 1.5 s after it loads, its source changes to a cyan image from the slow server (about 350 ms).',
                    shows: 'Recorded: magenta (kept while cyan downloads), then cyan; never blue-violet (a cross-dissolve). At the end, a cyan square.',
                }}
            />,
            <FadeCase
                key="fade-between"
                id="fade-between"
                from="change-download"
                betweenImages
                fades
                description={{
                    checks: 'transition with betweenImages: a new source that downloads cross-dissolves from the image showing.',
                    steps: 'The view (on black) shows a magenta image, with transition { duration: 1000, betweenImages: true }; 1.5 s after it loads, its source changes to a cyan image from the slow server (about 350 ms).',
                    shows: 'Recorded: magenta, blue-violet (halfway), cyan. At the end, a cyan square.',
                }}
            />,
            <FadeCase
                key="fade-between-memory"
                id="fade-between-memory"
                from="change"
                betweenImages
                skipOnCacheHit="none"
                fades
                description={{
                    checks: "transition with betweenImages and skipOnCacheHit: 'none': a new source from the memory cache cross-dissolves from the image showing.",
                    steps: "A view (left) loads a cyan image; a second one (right, on black) shows a magenta image, with transition { duration: 1000, betweenImages: true, skipOnCacheHit: 'none' }. Once both have loaded (and 1.5 s more), the right view's source changes to the cyan one, from the memory cache.",
                    shows: 'Recorded on the right: magenta, blue-violet (halfway), cyan. At the end, two cyan squares.',
                }}
            />,
        ],
    },
    {
        // Recorded (video samples). Not in fade-between: with six fades in
        // one group, the legacy example's recordings on the Android emulator
        // had pauses of 200 to 350 ms, and missed some fades' middle.
        name: 'fade-placeholder',
        description: {
            checks: "transition from defaultSource: the image cross-dissolves from it, and defaultSource fades out under images with transparency and where the image doesn't cover the view (Android skips fading it out only under an opaque image that covers the view).",
            steps: 'Video samples, as in the fade group. Each view (on black) shows a magenta defaultSource with no source; half a second later it gets a cyan image from the slow server (about 350 ms), with transition { duration: 1000 }.',
        },
        cases: [
            <FadeCase
                key="fade-placeholder"
                id="fade-placeholder"
                from="placeholder"
                fades
                description={{
                    checks: 'transition: an image that downloads cross-dissolves from defaultSource.',
                    steps: 'The view shows a magenta defaultSource; half a second later it gets a cyan image from the slow server.',
                    shows: 'Recorded: magenta, blue-violet (halfway), cyan. At the end, a cyan square.',
                }}
            />,
            <FadeCase
                key="fade-placeholder-translucent"
                id="fade-placeholder-translucent"
                from="placeholder"
                image="cyan-half"
                fades
                description={{
                    checks: 'transition: an image with transparency cross-dissolves from defaultSource, which fades out under it.',
                    steps: 'The view shows a magenta defaultSource; half a second later it gets a cyan image at half opacity (cyan-half.png) from the slow server.',
                    shows: 'Recorded: magenta, dark blue-violet (halfway), teal (half cyan over black); never blue-violet (magenta left under the image). At the end, a teal square.',
                }}
            />,
            <FadeCase
                key="fade-placeholder-contain"
                id="fade-placeholder-contain"
                from="placeholder"
                tall
                fades
                description={{
                    checks: "transition with objectFit contain: defaultSource fades out where the image doesn't cover the view.",
                    steps: 'The view is 48 × 144 with objectFit contain, cut to its top third: the square cyan image covers the middle third, so the part shown has only defaultSource (magenta; on iOS a tall one, since iOS fits defaultSource as it fits the image), then the black background.',
                    shows: 'Recorded: magenta, half magenta (dark purple), black; never cyan. At the end, a black square.',
                }}
            />,
            // Android's: how it decides the image covers the view.
            ...(Platform.OS === 'android'
                ? [
                      <FadeCase
                          key="fade-placeholder-edge"
                          id="fade-placeholder-edge"
                          from="placeholder"
                          edge
                          fades
                          description={{
                              checks: 'transition with objectFit contain and an image that leaves half a pixel of the view uncovered: defaultSource fades out there too (Android checks whether the image covers the view to skip fading defaultSource out).',
                              steps: 'A 16 dp view on black, magnified 8 times, with objectFit contain and a cyan image (42 × 41 px) a pixel shorter than the view (42 px on the emulator): it leaves half a pixel at the top and bottom, 4 px on the screen. Recorded in the top 4 px.',
                              shows: 'Recorded: magenta, half magenta (dark purple), black; never cyan. At the end, a large cyan square with a thin black line along its top and bottom edges.',
                          }}
                      />,
                  ]
                : []),
        ],
    },
    {
        // source.thumbhash, checked by screenshot (see ThumbhashLoadingCase).
        name: 'thumbhash',
        description: {
            checks: "source.thumbhash: the ThumbHash shows, decoded, while the image loads and when it fails, in place of defaultSource, and changing it after the load starts or ends doesn't load again.",
            steps: 'Most cases hold their download on the slow server (it sends only the headers and a byte a second until the case unmounts), so the hash stays on screen for the screenshot. The hashes come from flat test images: a 4:3 red-to-blue gradient, a 3:4 green-to-yellow one, a magenta disc on transparent, and a 4:3 cyan-to-orange gradient.',
        },
        cases: [
            <ThumbhashLoadingCase key="thumbhash-loading" />,
            <ThumbhashScaleDownCase key="thumbhash-scale-down" />,
            <ThumbhashFailsCase key="thumbhash-fails" />,
            <ThumbhashChangeLoadedCase key="thumbhash-change-loaded" />,
            <ThumbhashChangeLoadingCase key="thumbhash-change-loading" />,
            <ThumbhashPlaceholderLateCase key="thumbhash-placeholder-late" />,
            <ThumbhashSizesCase key="thumbhash-sizes" />,
            <ThumbhashRecycledCase key="thumbhash-recycled" />,
        ],
    },
    {
        name: 'placeholder',
        description: {
            checks: "The placeholder prop and a source's blurDataUri: data uris and ThumbHashes shown while the image loads, sized and tinted as the image will be.",
            steps: 'Each case holds its download on the slow server (it sends only the headers and a byte a second until the case unmounts), so the placeholder stays on screen for the screenshot.',
        },
        cases: [
            <PlaceholderDataUriCase key="placeholder-data-uri" />,
            <BlurDataUriCase key="blur-data-uri" />,
            <PlaceholderSizesCase key="placeholder-sizes" />,
            <PlaceholderDataUriSizeCase key="placeholder-data-uri-size" />,
            <ThumbhashTintCase key="thumbhash-tint" />,
        ],
    },
    {
        name: 'hdr',
        description: {
            checks: 'An HDR photo loads with each dynamicRangeLimit.',
        },
        cases: [<HdrCase key="hdr" />],
    },
    {
        name: 'placeholder-url',
        description: {
            checks: "The placeholder prop as a url: it loads and shows while the image loads or after it fails, with cache: 'cacheOnly' only if cached, and never over an image that has loaded.",
        },
        cases: [
            <PlaceholderUrlCase key="placeholder-url" />,
            <PlaceholderUrlCacheOnlyCase key="placeholder-url-cache-only" />,
            <PlaceholderUrlCachedCase key="placeholder-url-cached" />,
            <PlaceholderUrlErrorCase key="placeholder-url-error" />,
            <PlaceholderUrlLateCase key="placeholder-url-late" />,
        ],
    },
    {
        // Video samples, stepped where the app can pause its animations.
        name: 'fade-drawables',
        description: {
            checks: 'transition with other kinds of drawables: an animated WebP fading in and, on Android, vector and animated WebP defaultSource drawables fading out around or under the image.',
            steps: 'Video samples, as in the fade group.',
        },
        cases: [
            <FadeCase
                key="fade-animated-webp"
                id="fade-animated-webp"
                from="download"
                image="cyan-animated"
                fades
                description={{
                    checks: 'transition fades in a downloaded animated WebP (an AnimatedImageDrawable on Android 9+).',
                    steps: 'A black view mounts with an animated WebP of two cyan frames from the slow server (about 350 ms), with transition { duration: 1000 }.',
                    shows: 'Recorded: black, teal (half cyan), cyan. At the end, a cyan square.',
                }}
            />,
            // defaultSource drawables that are only Android's.
            ...(Platform.OS === 'android'
                ? [
                      <FadeCase
                          key="fade-placeholder-vector-contain"
                          id="fade-placeholder-vector-contain"
                          from="placeholder"
                          tall
                          defaultDrawable="vector"
                          fades
                          description={{
                              checks: "transition with objectFit contain over a vector drawable defaultSource (a VectorDrawable): it fades out where the image doesn't cover the view.",
                              steps: 'The view is 48 × 144 with objectFit contain, cut to its top third, and shows a magenta vector drawable as defaultSource; half a second later it gets a square cyan image from the slow server, which covers the middle third, with transition { duration: 1000 }.',
                              shows: 'Recorded: magenta, half magenta (dark purple), black; never cyan. At the end, a black square.',
                          }}
                      />,
                      <FadeCase
                          key="fade-placeholder-animated-translucent"
                          id="fade-placeholder-animated-translucent"
                          from="placeholder"
                          image="cyan-half"
                          defaultDrawable="animated"
                          fades
                          description={{
                              checks: 'transition: an image with transparency cross-dissolves from an animated WebP drawable defaultSource (an AnimatedImageDrawable on Android 9+), which fades out under it.',
                              steps: 'The view (on black) shows a magenta animated WebP drawable as defaultSource; half a second later it gets a cyan image at half opacity from the slow server, with transition { duration: 1000 }.',
                              shows: 'Recorded: magenta, dark blue-violet (halfway), teal (half cyan over black); never blue-violet (magenta left under the image). At the end, a teal square.',
                          }}
                      />,
                  ]
                : []),
        ],
    },
    {
        // Recorded (video samples). A group of their own: see
        // fade-placeholder.
        name: 'fade-opacity',
        description: {
            checks: "transition at half opacity: the image cross-dissolves from what the view showed, which fades out under it (on Android, React Native applies a View's opacity to each drawing in it, so what the view showed would otherwise show through).",
            steps: 'Video samples, as in the fade group. Each case fades from magenta to an opaque cyan image from the slow server (about 350 ms), at half opacity over black.',
        },
        cases: [
            <FadeCase
                key="fade-placeholder-opacity"
                id="fade-placeholder-opacity"
                from="placeholder"
                opacity="style"
                fades
                description={{
                    checks: 'transition with opacity 0.5 in the style: an image that downloads cross-dissolves from defaultSource, which fades out under it.',
                    steps: 'FastImage (opacity 0.5, in a black view) shows a magenta defaultSource; half a second later it gets a cyan image from the slow server, with transition { duration: 1000 }.',
                    shows: 'Recorded: half magenta (dark purple), dark blue (halfway), teal (half cyan); never light blue (magenta left under the image). At the end, a teal square.',
                }}
            />,
            <FadeCase
                key="fade-between-opacity"
                id="fade-between-opacity"
                from="change-download"
                betweenImages
                opacity="parent"
                fades
                description={{
                    checks: 'transition with betweenImages, in a View at opacity 0.5: a new source that downloads cross-dissolves from the image showing, which fades out under it.',
                    steps: 'FastImage, in a View at opacity 0.5 on black, shows a magenta image, with transition { duration: 1000, betweenImages: true }; 1.5 s after it loads, its source changes to a cyan image from the slow server.',
                    shows: 'Recorded: half magenta (dark purple), dark blue (halfway), teal (half cyan); never light blue (magenta left under the image). At the end, a teal square.',
                }}
            />,
            // Android's: a view animation, which the example apps' MainActivity
            // starts.
            ...(Platform.OS === 'android'
                ? [
                      <FadeCase
                          key="fade-placeholder-animation"
                          id="fade-placeholder-animation"
                          from="placeholder"
                          opacity="animation"
                          fades
                          description={{
                              checks: "transition in a View with a view animation at half alpha (an AlphaAnimation, which doesn't change the View's opacity): an image that downloads cross-dissolves from defaultSource, which fades out under it.",
                              steps: "The example app's MainActivity starts the AlphaAnimation (0.5) on the View FastImage is in (in the runner only). FastImage shows a magenta defaultSource; half a second later it gets a cyan image from the slow server, with transition { duration: 1000 }.",
                              shows: 'Recorded: half magenta (dark purple), dark blue (halfway), teal (half cyan); never light blue (magenta left under the image). At the end, a teal square.',
                          }}
                      />,
                  ]
                : []),
        ],
    },
    {
        // Recorded. Clears the memory cache, so on its own.
        name: 'fade-disk',
        description: {
            checks: 'transition for images from the disk cache: they fade in by default, and show at once with skipOnCacheHit all.',
            steps: 'Video samples, as in the fade group. In each case a view (left) loads a cyan image, then unmounts; half a second later FastImage.clearMemoryCache() runs, and a second view (right, on black) mounts with the same source, so it loads from the disk cache.',
        },
        cases: [
            <FadeCase
                key="fade-disk"
                id="fade-disk"
                from="disk"
                fades
                description={{
                    checks: "transition fades in an image from the disk cache (the default skipOnCacheHit, 'memory', only skips the memory cache).",
                    steps: 'The right view has transition { duration: 1000 }.',
                    shows: 'Recorded on the right: black, teal (half cyan), cyan. At the end, an empty gray square and a cyan square.',
                }}
            />,
            <FadeCase
                key="fade-disk-all"
                id="fade-disk-all"
                from="disk"
                skipOnCacheHit="all"
                fades={false}
                description={{
                    checks: "transition with skipOnCacheHit: 'all': an image from the disk cache shows at once.",
                    steps: "The right view has transition { duration: 1000, skipOnCacheHit: 'all' }.",
                    shows: 'Recorded on the right: black, then cyan; never teal (half cyan, a fade). At the end, an empty gray square and a cyan square.',
                }}
            />,
        ],
    },
    {
        // Recorded. An empty key is a key: iOS took it as none (Codegen sends
        // '' for a key that isn't set), so the image stayed.
        name: 'recycling-key-empty',
        description: {
            checks: "recyclingKey '' is a key like any other.",
            steps: 'A video sample: the screen is recorded while the case changes its source, and the color in the middle of the view must go through the listed colors in order.',
        },
        cases: [
            <KeepPreviousCase
                key="recycling-key-empty"
                id="recycling-key-empty"
                recycle
                emptyKey
                description={{
                    checks: "Changing recyclingKey from '' with the source clears the image while the new one loads (iOS took '' as no key, since Codegen sends '' for a key that isn't set, so the previous image stayed).",
                    steps: "The view shows a magenta image with recyclingKey ''; then its source changes to a cyan image from the slow server (about 1 s) and recyclingKey to 'second'. Recorded until cyan's onLoad.",
                    shows: "Recorded: magenta, blank (the view's light gray background), cyan. At the end, a cyan square.",
                }}
            />,
        ],
    },
    {
        // Recorded (video samples).
        name: 'keep-previous',
        description: {
            checks: 'A source change keeps the image showing until the new one has loaded, and clears it when recyclingKey changes too.',
            steps: 'Video samples: the screen is recorded while each case changes its source from a magenta image to a cyan one from the slow server (about 1 s), and the color in the middle of the view must go through the listed colors in order.',
        },
        cases: [
            <KeepPreviousCase
                key="keep-previous"
                id="keep-previous"
                description={{
                    checks: 'Changing the source keeps the image showing until the new one has loaded (#747: the view went blank between the two images).',
                    steps: "The view shows a magenta image; then its source changes to a cyan image from the slow server (about 1 s). Recorded until cyan's onLoad.",
                    shows: "Recorded: magenta, then cyan; never blank (the view's light gray background). At the end, a cyan square.",
                }}
            />,
            <KeepPreviousCase
                key="recycling-key"
                id="recycling-key"
                recycle
                description={{
                    checks: 'Changing recyclingKey with the source clears the image while the new one loads, for views reused for other content.',
                    steps: "The view shows a magenta image with recyclingKey 'first'; then its source changes to a cyan image from the slow server (about 1 s) and recyclingKey to 'second'. Recorded until cyan's onLoad.",
                    shows: "Recorded: magenta, blank (the view's light gray background), cyan. At the end, a cyan square.",
                }}
            />,
            <KeepPreviousCase
                key="keep-previous-no-memory"
                id="keep-previous-no-memory"
                memoryCache={false}
                description={{
                    checks: "Changing the source keeps the image showing until the new one has loaded, with memoryCache: false (the image isn't kept in the memory cache).",
                    steps: "As the first row, with memoryCache: false on both sources. Recorded until cyan's onLoad.",
                    shows: "Recorded: magenta, then cyan; never blank (the view's light gray background). At the end, a cyan square.",
                }}
            />,
            <KeepPreviousCase
                key="keep-previous-twice"
                id="keep-previous-twice"
                twice
                description={{
                    checks: 'Changing the source twice quickly keeps the image showing until the last one has loaded (Android went blank).',
                    steps: "The view shows a magenta image; then its source changes to a slow image (about 7 s), and 150 ms later to a cyan one from the slow server (about 1 s). Recorded until cyan's onLoad.",
                    shows: "Recorded: magenta, then cyan; never blank (the view's light gray background). At the end, a cyan square.",
                }}
            />,
            <KeepPreviousCase
                key="keep-previous-twice-no-memory"
                id="keep-previous-twice-no-memory"
                memoryCache={false}
                twice
                description={{
                    checks: 'Changing the source twice quickly keeps the image showing until the last one has loaded, with memoryCache: false (Android went blank).',
                    steps: "As the row above, with memoryCache: false on all three sources. Recorded until cyan's onLoad.",
                    shows: "Recorded: magenta, then cyan; never blank (the view's light gray background). At the end, a cyan square.",
                }}
            />,
        ],
    },
    {
        // Recorded (video samples).
        name: 'tint',
        description: {
            checks: 'tintColor over time, recorded on video: a tinted GIF playing, and tintColor changed or removed after the image loaded.',
        },
        cases: [
            <TintSampleCase
                key="tint-gif"
                id="tint-gif"
                uri="blink-once.gif"
                change="play"
                expect={[GREEN, BLANK, GREEN]}
                description={{
                    checks: "A tinted GIF plays, with every frame tinted (#1195: iOS showed the first frame tinted and didn't play it).",
                    steps: 'Loads a GIF that plays once (magenta, transparent, magenta, 400 ms each) with tintColor green and paused. On onLoad it starts recording and sets paused={false}. Passes when the recording sees green, blank, green, in that order.',
                    shows: 'A green square (the last frame, tinted). Recorded: green, blank (the gray background through the transparent frame), then green.',
                }}
            />,
            <TintSampleCase
                key="tint-change"
                id="tint-change"
                uri="magenta.png"
                change="recolor"
                expect={[GREEN, CYAN]}
                description={{
                    checks: 'Changing tintColor after the image loaded retints it.',
                    steps: 'Loads a magenta square with tintColor green. On onLoad it starts recording and changes tintColor to cyan. Passes when the recording sees green, then cyan.',
                    shows: 'A cyan square. Recorded: green, then cyan.',
                }}
            />,
            <TintSampleCase
                key="tint-gif-clear"
                id="tint-gif-clear"
                uri="blink-once.gif"
                change="clear"
                expect={[GREEN, MAGENTA]}
                description={{
                    checks: "Removing tintColor from a paused GIF shows the frame's own colors again.",
                    steps: 'Loads a GIF (magenta, transparent, magenta) with tintColor green and paused, so it stays on its first frame. On onLoad it starts recording and removes tintColor. Passes when the recording sees green, then magenta.',
                    shows: 'A magenta square (the first frame, untinted). Recorded: green, then magenta.',
                }}
            />,
        ],
    },
    {
        name: 'several-sources',
        description: {
            checks: 'source as an array of sizes: the view loads the source whose size in pixels is closest to its own, including a require()d image among them.',
        },
        cases: [
            <SeveralSourcesCase key="several-48" id="several-48" size={48} />,
            <SeveralSourcesCase
                key="several-120"
                id="several-120"
                size={120}
            />,
            <SeveralSourcesEdgeCase key="several-edge" />,
            <SeveralSourcesBundledCase
                key="several-bundled-16"
                id="several-bundled-16"
                size={16}
            />,
            <SeveralSourcesBundledCase
                key="several-bundled-120"
                id="several-bundled-120"
                size={120}
            />,
        ],
    },
    {
        // Large views, on their own.
        name: 'several-sources-large',
        description: {
            checks: 'source as an array of sizes in large views: a large view picks the source closest to its size in pixels (the 900 px one on iPhone, 300 px on Android and tvOS), and a view that grows loads a larger one.',
        },
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
        // Bordered views: the source fits the box inside the borders.
        name: 'several-sources-border',
        description: {
            checks: 'source as an array of sizes in views with borders: the source is picked for the box inside the borders, where the image is drawn.',
        },
        cases: [
            <SeveralSourcesCase
                key="several-border"
                id="several-border"
                size={120}
                border={30}
            />,
            <SeveralSourcesBorderChangeCase key="several-border-change" />,
        ],
    },
    {
        name: 'image-background',
        description: {
            checks: 'FastImageBackground draws its image behind its children.',
        },
        cases: [<ImageBackgroundCase key="image-background" />],
    },
    {
        name: 'formats',
        description: {
            checks: 'Which still image formats load on each platform, for the tables in docs/formats.md: each case loads the same picture in one format.',
        },
        cases: [
            <FormatCase
                key="format-jpeg"
                id="format-jpeg"
                file="quadrants.jpg"
                expected="loads"
                description={{
                    checks: 'A JPEG image loads on every platform, at its own size (as the tables in docs/formats.md say).',
                    steps: 'Loads the test picture as a JPEG (80×80: red, green, blue and yellow quadrants) in a 48 pt view with objectFit="contain". Passes when onLoad has 80×80.',
                    shows: 'The four quadrants: red top left, green top right, blue bottom left, yellow bottom right. A blank gray square means it failed.',
                }}
            />,
            <FormatCase
                key="format-png"
                id="format-png"
                file="quadrants.png"
                expected="loads"
                description={{
                    checks: 'A PNG image loads on every platform, at its own size (as the tables in docs/formats.md say).',
                    steps: 'Loads the test picture as a PNG (80×80: red, green, blue and yellow quadrants) in a 48 pt view with objectFit="contain". Passes when onLoad has 80×80.',
                    shows: 'The four quadrants: red top left, green top right, blue bottom left, yellow bottom right. A blank gray square means it failed.',
                }}
            />,
            <FormatCase
                key="format-gif"
                id="format-gif"
                file="quadrants.gif"
                expected="loads"
                description={{
                    checks: 'A still GIF image loads on every platform, at its own size (as the tables in docs/formats.md say).',
                    steps: 'Loads the test picture as a still GIF (80×80: red, green, blue and yellow quadrants) in a 48 pt view with objectFit="contain". Passes when onLoad has 80×80.',
                    shows: 'The four quadrants: red top left, green top right, blue bottom left, yellow bottom right. A blank gray square means it failed.',
                }}
            />,
            <FormatCase
                key="format-webp"
                id="format-webp"
                file="quadrants.webp"
                expected="loads"
                description={{
                    checks: 'A WebP image loads on every platform, at its own size (as the tables in docs/formats.md say).',
                    steps: 'Loads the test picture as a WebP (80×80: red, green, blue and yellow quadrants) in a 48 pt view with objectFit="contain". Passes when onLoad has 80×80.',
                    shows: 'The four quadrants: red top left, green top right, blue bottom left, yellow bottom right. A blank gray square means it failed.',
                }}
            />,
            <FormatCase
                key="format-avif"
                id="format-avif"
                file="quadrants.avif"
                expected="loads"
                description={{
                    checks: 'An AVIF image loads on every platform, at its own size (as the tables in docs/formats.md say).',
                    steps: 'Loads the test picture as an AVIF (80×80: red, green, blue and yellow quadrants) in a 48 pt view with objectFit="contain". Passes when onLoad has 80×80.',
                    shows: 'The four quadrants: red top left, green top right, blue bottom left, yellow bottom right. A blank gray square means it failed.',
                }}
            />,
            <FormatCase
                key="format-heic"
                id="format-heic"
                file="quadrants.heic"
                expected="loads"
                description={{
                    checks: 'A HEIC image loads on every platform, at its own size (as the tables in docs/formats.md say).',
                    steps: 'Loads the test picture as a HEIC (80×80: red, green, blue and yellow quadrants) in a 48 pt view with objectFit="contain". Passes when onLoad has 80×80.',
                    shows: 'The four quadrants: red top left, green top right, blue bottom left, yellow bottom right. A blank gray square means it failed.',
                }}
            />,
            <FormatCase
                key="format-bmp"
                id="format-bmp"
                file="quadrants.bmp"
                expected="loads"
                description={{
                    checks: 'A BMP image loads on every platform, at its own size (as the tables in docs/formats.md say).',
                    steps: 'Loads the test picture as a BMP (80×80: red, green, blue and yellow quadrants) in a 48 pt view with objectFit="contain". Passes when onLoad has 80×80.',
                    shows: 'The four quadrants: red top left, green top right, blue bottom left, yellow bottom right. A blank gray square means it failed.',
                }}
            />,
            <FormatCase
                key="format-ico"
                id="format-ico"
                file="quadrants.ico"
                expected="loads"
                description={{
                    checks: 'An ICO image loads on every platform, at its own size (as the tables in docs/formats.md say).',
                    steps: 'Loads the test picture as an ICO (80×80: red, green, blue and yellow quadrants) in a 48 pt view with objectFit="contain". Passes when onLoad has 80×80.',
                    shows: 'The four quadrants: red top left, green top right, blue bottom left, yellow bottom right. A blank gray square means it failed.',
                }}
            />,
            <FormatCase
                key="format-tiff"
                id="format-tiff"
                file="quadrants.tiff"
                expected={Platform.OS === 'ios' ? 'loads' : 'fails'}
                description={{
                    checks: "A TIFF image loads on iOS and fails on Android, as docs/formats.md says (a change in what's supported fails the case).",
                    steps: 'Loads the test picture as a TIFF (80×80: red, green, blue and yellow quadrants) in a 48 pt view with objectFit="contain". Passes on iOS when onLoad has 80×80, on Android on onError.',
                    shows: 'iOS: the four quadrants (red top left, green top right, blue bottom left, yellow bottom right). Android: an empty gray square.',
                }}
            />,
            <FormatCase
                key="format-icns"
                id="format-icns"
                file="quadrants.icns"
                // tvOS's ImageIO doesn't decode ICNS or PSD.
                expected={
                    Platform.OS === 'ios' && !Platform.isTV ? 'loads' : 'fails'
                }
                // An icon size (formats.sh).
                size={128}
                description={{
                    checks: "An ICNS image loads on iOS and fails on Android and tvOS (whose ImageIO doesn't decode it), as docs/formats.md says (a change in what's supported fails the case).",
                    steps: 'Loads the test picture as an ICNS (128×128, an icon size: red, green, blue and yellow quadrants) in a 48 pt view with objectFit="contain". Passes on iOS when onLoad has 128×128, on Android and tvOS on onError.',
                    shows: 'iOS: the four quadrants (red top left, green top right, blue bottom left, yellow bottom right). Android and tvOS: an empty gray square.',
                }}
            />,
            <FormatCase
                key="format-psd"
                id="format-psd"
                file="quadrants.psd"
                expected={
                    Platform.OS === 'ios' && !Platform.isTV ? 'loads' : 'fails'
                }
                description={{
                    checks: "A PSD image loads on iOS and fails on Android and tvOS (whose ImageIO doesn't decode it), as docs/formats.md says (a change in what's supported fails the case).",
                    steps: 'Loads the test picture as a PSD (80×80: red, green, blue and yellow quadrants) in a 48 pt view with objectFit="contain". Passes on iOS when onLoad has 80×80, on Android and tvOS on onError.',
                    shows: 'iOS: the four quadrants (red top left, green top right, blue bottom left, yellow bottom right). Android and tvOS: an empty gray square.',
                }}
            />,
        ],
    },
    {
        name: 'formats-animated',
        description: {
            checks: 'Which animated formats animate on each platform (GIF, APNG, WebP, a large downsampled WebP, AVIF), checked by recording each view.',
        },
        cases: [
            <FormatAnimationCase
                key="format-animated-gif"
                id="format-animated-gif"
                file="animated.gif"
                expected="animates"
                description={{
                    checks: 'An animated GIF animates.',
                    steps: 'Loads an animated GIF (red, then blue, 400 ms each, looping) in a 48 pt view. On onLoad it records the view for two plays. Passes when the recording sees both red and blue.',
                    shows: 'A red or blue square, depending on the frame: animated, so masked and not compared.',
                }}
            />,
            <FormatAnimationCase
                key="format-animated-apng"
                id="format-animated-apng"
                file="animated.png"
                expected="animates"
                description={{
                    checks: 'An animated PNG (APNG) animates (on Android with APNG4Android, which Fast Image includes).',
                    steps: 'Loads an APNG (red, then blue, 400 ms each, looping) in a 48 pt view. On onLoad it records the view for two plays. Passes when the recording sees both red and blue.',
                    shows: 'A red or blue square, depending on the frame: animated, so masked and not compared.',
                }}
            />,
            <FormatAnimationCase
                key="format-animated-webp"
                id="format-animated-webp"
                file="animated.webp"
                expected="animates"
                description={{
                    checks: 'An animated WebP animates.',
                    steps: 'Loads an animated WebP (red, then blue, 400 ms each, looping) in a 48 pt view. On onLoad it records the view for two plays. Passes when the recording sees both red and blue.',
                    shows: 'A red or blue square, depending on the frame: animated, so masked and not compared.',
                }}
            />,
            <FormatAnimationCase
                key="format-animated-webp-downsampled"
                id="format-animated-webp-downsampled"
                file="animated-large.webp"
                expected="animates"
                description={{
                    checks: "A large animated WebP, decoded at about the view's size (downsample, the default), still animates.",
                    steps: 'Loads a 400×400 animated WebP (red, then blue, 400 ms each, looping) in a 48 pt view. On onLoad it records the view for two plays. Passes when the recording sees both red and blue.',
                    shows: 'A red or blue square, depending on the frame: animated, so masked and not compared.',
                }}
            />,
            <FormatAnimationCase
                key="format-animated-avif"
                id="format-animated-avif"
                file="animated.avif"
                expected="animates"
                description={{
                    checks: 'An animated AVIF animates.',
                    steps: 'Loads an animated AVIF (red, then blue, 400 ms each, looping) in a 48 pt view. On onLoad it records the view for two plays. Passes when the recording sees both red and blue.',
                    shows: 'A red or blue square, depending on the frame: animated, so masked and not compared.',
                }}
            />,
        ],
    },
    {
        // loop and paused with an animated AVIF (ImageIO's on iOS, Android's
        // ImageDecoder on Android).
        name: 'avif-animation',
        description: {
            checks: "loop and paused with an animated AVIF (ImageIO's decoder on iOS, Android's ImageDecoder on Android).",
        },
        cases: [
            <GifLoopCase
                key="avif-loop-false"
                id="avif-loop-false"
                description={{
                    checks: 'loop={false} on an animated AVIF that loops forever by itself: it plays once and stops on its last frame.',
                    steps: 'Loads an animated AVIF that loops forever (red, then blue, 400 ms each) with loop={false}. Passes a play (0.8 s) and a margin after onLoad.',
                    shows: 'A blue square (the last frame, where it stopped); one that kept looping could show either frame.',
                }}
                loop={false}
                plays={1}
                source="formats/animated.avif"
            />,
            <GifLoopCase
                key="avif-loop-file"
                id="avif-loop-file"
                description={{
                    checks: 'Without loop, an animated AVIF that plays once by itself (no repetitions in the file) plays once and stops on its last frame.',
                    steps: 'Loads an animated AVIF that plays once (red, then blue, 400 ms each) without loop. Passes a play (0.8 s) and a margin after onLoad.',
                    shows: 'A blue square (the last frame); red would mean it never played.',
                }}
                plays={1}
                source="formats/animated-once.avif"
            />,
            <GifPausedCase
                key="avif-paused"
                name="AVIF"
                source="formats/animated.avif"
            />,
            <GifPausedCase
                key="avif-resume"
                name="AVIF"
                source="formats/animated.avif"
                resume
            />,
        ],
    },
    {
        // loop, paused and two views, with an animated WebP.
        name: 'webp-animation',
        description: {
            checks: 'loop, paused, two views of one image, and blurRadius with an animated WebP.',
        },
        cases: [
            <GifLoopCase
                key="webp-loop-false"
                id="webp-loop-false"
                description={{
                    checks: 'loop={false} on an animated WebP that loops forever by itself: it plays once and stops on its last frame.',
                    steps: 'Loads an animated WebP that loops forever (red, then blue, 400 ms each) with loop={false}. Passes a play (0.8 s) and a margin after onLoad.',
                    shows: 'A blue square (the last frame, where it stopped); one that kept looping could show either frame.',
                }}
                loop={false}
                plays={1}
                source="formats/animated.webp"
            />,
            <WebpLoopUnsetCase
                key="webp-loop-unset"
                id="webp-loop-unset"
                description={{
                    checks: 'loop={false}, then loop removed on the same view: the animated WebP loops forever again, as the file says, rather than staying stopped.',
                    steps: 'Loads an animated WebP that loops forever (red, then blue, 400 ms each) with loop={false}. After a play it removes loop, waits a play, then records the view. Passes when the recording sees both red and blue (still looping).',
                    shows: 'A red or blue square: animated, so masked and not compared.',
                }}
            />,
            <WebpLoopUnsetCase
                key="webp-loop-remount"
                id="webp-loop-remount"
                remount
                description={{
                    checks: "A new view without loop shows an animated WebP looping forever, as the file says, after another view showed it with loop={false} (on Android a new view can get the drawable a view that's gone had, with its loop).",
                    steps: 'Loads an animated WebP that loops forever (red, then blue) with loop={false}; after a play the view switches to another image (the quadrants), then a new view without loop shows the WebP again. A play after it loads, the view is recorded. Passes when the recording sees both red and blue.',
                    shows: 'A red or blue square: animated, so masked and not compared.',
                }}
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
            // Two views of the same animated WebP both animate. On Android,
            // Glide would give every view of it the same drawable, so the
            // views would share its playback (webp-paused would play, with
            // the others): FastImageAnimated gives each its own.
            <FormatAnimationCase
                key="format-animated-webp-twice-1"
                id="format-animated-webp-twice-1"
                file="animated.webp"
                expected="animates"
                description={{
                    checks: 'The same animated WebP in two views: each animates on its own (on Android, Glide would give both views one drawable, which would share its playback with the paused one).',
                    steps: 'Loads the animated WebP the paused cases above use (red, then blue, 400 ms each, looping) in a 48 pt view. On onLoad it records the view for two plays. Passes when the recording sees both red and blue.',
                    shows: 'A red or blue square, depending on the frame: animated, so masked and not compared.',
                }}
            />,
            <FormatAnimationCase
                key="format-animated-webp-twice-2"
                id="format-animated-webp-twice-2"
                file="animated.webp"
                expected="animates"
                description={{
                    checks: 'The second view of the same animated WebP also animates.',
                    steps: 'Loads the same animated WebP (red, then blue, 400 ms each, looping) in a 48 pt view. On onLoad it records the view for two plays. Passes when the recording sees both red and blue.',
                    shows: 'A red or blue square, depending on the frame: animated, so masked and not compared.',
                }}
            />,
            // Not animated (as a GIF isn't): blurred.
            <FormatAnimationCase
                key="blur-webp"
                id="blur-webp"
                file="animated.webp"
                expected="first frame"
                imageProps={{ blurRadius: 6 }}
                description={{
                    checks: 'blurRadius on an animated WebP: it shows its first frame, blurred and still, as a blurred GIF does.',
                    steps: 'Loads the animated WebP (red, then blue, 400 ms each, looping) with blurRadius 6. On onLoad it records the view for two plays. Passes when the recording sees only red.',
                    shows: 'A red square (the first frame; blurring a flat color leaves it the same): masked, so not compared.',
                }}
            />,
        ],
    },
    {
        // As webp-animation, for APNG (on Android, with APNG4Android).
        name: 'apng-animation',
        description: {
            checks: 'loop, paused, two views of one image, and blurRadius with an APNG (on Android with APNG4Android, which Fast Image includes).',
        },
        cases: [
            <GifLoopCase
                key="png-loop-false"
                id="png-loop-false"
                description={{
                    checks: 'loop={false} on an APNG that loops forever by itself: it plays once and stops on its last frame.',
                    steps: 'Loads an APNG that loops forever (red, then blue, 400 ms each) with loop={false}. Passes a play (0.8 s) and a margin after onLoad.',
                    shows: 'A blue square (the last frame, where it stopped); one that kept looping could show either frame.',
                }}
                loop={false}
                plays={1}
                source="formats/animated.png"
            />,
            <GifPausedCase
                key="png-paused"
                name="PNG"
                source="formats/animated.png"
            />,
            <GifPausedCase
                key="png-resume"
                name="PNG"
                source="formats/animated.png"
                resume
            />,
            <FormatAnimationCase
                key="format-animated-apng-twice-1"
                id="format-animated-apng-twice-1"
                file="animated.png"
                expected="animates"
                description={{
                    checks: 'The same APNG in two views: each animates on its own, rather than sharing one playback with the paused one.',
                    steps: 'Loads the APNG the paused cases above use (red, then blue, 400 ms each, looping) in a 48 pt view. On onLoad it records the view for two plays. Passes when the recording sees both red and blue.',
                    shows: 'A red or blue square, depending on the frame: animated, so masked and not compared.',
                }}
            />,
            <FormatAnimationCase
                key="format-animated-apng-twice-2"
                id="format-animated-apng-twice-2"
                file="animated.png"
                expected="animates"
                description={{
                    checks: 'The second view of the same APNG also animates.',
                    steps: 'Loads the same APNG (red, then blue, 400 ms each, looping) in a 48 pt view. On onLoad it records the view for two plays. Passes when the recording sees both red and blue.',
                    shows: 'A red or blue square, depending on the frame: animated, so masked and not compared.',
                }}
            />,
            <FormatAnimationCase
                key="blur-apng"
                id="blur-apng"
                file="animated.png"
                expected="first frame"
                imageProps={{ blurRadius: 6 }}
                description={{
                    checks: 'blurRadius on an APNG: it shows its first frame, blurred and still, as a blurred GIF does.',
                    steps: 'Loads the APNG (red, then blue, 400 ms each, looping) with blurRadius 6. On onLoad it records the view for two plays. Passes when the recording sees only red.',
                    shows: 'A red square (the first frame; blurring a flat color leaves it the same): masked, so not compared.',
                }}
            />,
        ],
    },
    {
        name: 'svg',
        description: {
            checks: 'SVG images (SDWebImageSVGCoder on iOS, AndroidSVG on Android, which Fast Image includes): remote and bundled, their sizes in onLoad, a wrong Content-Type, tintColor and downsample.',
        },
        cases: [
            <SvgCase
                key="svg-remote"
                id="svg-remote"
                source={{ uri: imageUrl('svg-flag.svg') }}
                style={{ width: 96, height: 48 }}
                expected={[100, 50]}
                description={{
                    checks: 'A remote SVG loads, and onLoad has its own size.',
                    steps: 'Loads the 100×50 SVG (left half red, right half blue) from the image server in a 96×48 view. Passes when onLoad has 100×50.',
                    shows: 'A 96×48 rectangle: red on the left, blue on the right.',
                }}
            />,
            <SvgCase
                key="svg-bundled"
                id="svg-bundled"
                source={require('./images/svg-flag.svg')}
                style={{ width: 96, height: 48 }}
                expected={[100, 50]}
                description={{
                    checks: 'A require()d SVG, bundled with the app, loads, in debug and release builds.',
                    steps: "Shows the 100×50 SVG (left half red, right half blue) from the app's bundle in a 96×48 view. Passes when onLoad has 100×50.",
                    shows: 'A 96×48 rectangle: red on the left, blue on the right.',
                }}
            />,
            <SvgCase
                key="svg-viewbox"
                id="svg-viewbox"
                source={{ uri: imageUrl('svg-viewbox.svg') }}
                style={{ width: 64, height: 32 }}
                expected={[60, 30]}
                description={{
                    checks: "An SVG with only a viewBox (no width or height) loads, and onLoad has the viewBox's size.",
                    steps: 'Loads an SVG with viewBox="0 0 60 30" (left half green, right half yellow) in a 64×32 view. Passes when onLoad has 60×30.',
                    shows: 'A 64×32 rectangle: green on the left, yellow on the right.',
                }}
            />,
            <SvgCase
                key="svg-nosize"
                id="svg-nosize"
                source={{ uri: imageUrl('svg-nosize.svg') }}
                style={{ width: 64, height: 32 }}
                expected={[300, 150]}
                description={{
                    checks: 'An SVG with no width, height or viewBox loads at 300×150, the default size for one.',
                    steps: 'Loads an SVG without a size (a 300×150 magenta rectangle with a 150×150 cyan square on its left) in a 64×32 view. Passes when onLoad has 300×150.',
                    shows: 'A 64×32 rectangle: cyan on the left, magenta on the right (the whole SVG, scaled down).',
                }}
            />,
            <SvgCase
                key="svg-mislabeled"
                id="svg-mislabeled"
                source={{ uri: imageUrl('mislabeled/svg-flag.svg') }}
                style={{ width: 96, height: 48 }}
                expected={[100, 50]}
                description={{
                    checks: 'An SVG the server sends with Content-Type: text/plain still loads.',
                    steps: 'Loads the 100×50 SVG (left half red, right half blue) from a server route that sends it as text/plain, in a 96×48 view. Passes when onLoad has 100×50.',
                    shows: 'A 96×48 rectangle: red on the left, blue on the right.',
                }}
            />,
            <SvgCase
                key="svg-tint"
                id="svg-tint"
                source={{ uri: imageUrl('svg-icon.svg') }}
                style={{ width: 48, height: 48 }}
                expected={[24, 24]}
                tintColor="green"
                description={{
                    checks: 'tintColor on an SVG icon tints it.',
                    steps: 'Loads a 24×24 SVG icon (a black ring) with tintColor green in a 48×48 view. Passes when onLoad has 24×24.',
                    shows: 'A green ring filling the gray square; a black ring would mean the tint was ignored.',
                }}
            />,
            <SvgCase
                key="svg-downsample"
                id="svg-downsample"
                source={{ uri: imageUrl('svg-flag.svg') }}
                style={{ width: 96, height: 48 }}
                expected={[100, 50]}
                downsample
                description={{
                    checks: "An SVG with downsample stays a vector image, drawn sharp, and onLoad has its own size (iOS drew it into a bitmap the view's size).",
                    steps: 'Loads the 100×50 SVG (left half red, right half blue) with downsample in a 96×48 view. Passes when onLoad has 100×50.',
                    shows: 'A 96×48 rectangle: red on the left, blue on the right, with a sharp edge between them.',
                }}
            />,
        ],
    },
    {
        // Checked by screenshot.
        name: 'zoom',
        description: {
            checks: 'Images zoomed in on as a pinch-to-zoom viewer does, with downsample={false} and without, checked by screenshot.',
        },
        cases: [
            <ZoomCase
                key="zoom-transform"
                id="zoom-transform"
                description={{
                    checks: 'A 30-point image scaled 4 times with a transform: downsample={false} keeps a photo sharp (decoded at full size), and an SVG as sharp as at its own size.',
                    steps: 'Four 30-point views in 120-point clips, each scaled 4 times about its center: a 1600x1000 page of text with downsample={false} and with downsample, then a 120x120 SVG of thin rings with downsample={false} and with downsample. Passes once all four have loaded; the screenshot checks the sharpness.',
                    shows: 'Top: large text, sharp on the left and blurry on the right. Bottom: thin rings filling the square, sharp on the left (iOS 10.9.8: soft, the SVG was drawn for 30 points) and soft on the right.',
                }}
            />,
            <ZoomCase
                key="zoom-scroll-view"
                id="zoom-scroll-view"
                scrollView
                description={{
                    checks: 'A 30-point image in a ScrollView zoomed 4 times (zoomScale, iOS only), as a pinch-to-zoom viewer zooms: downsample={false} keeps a photo sharp, and an SVG as sharp as at its own size.',
                    steps: 'Four 120-point ScrollViews with maximumZoomScale and zoomScale 4, each with a 30-point image: a 1600x1000 page of text with downsample={false} and with downsample, then a 120x120 SVG of thin rings with downsample={false} and with downsample. Passes once all four have loaded; the screenshot checks the sharpness.',
                    shows: 'iOS: the same as zoom-transform. Android has no ScrollView zoom: four 30-point images in the top-left corners of their squares.',
                }}
            />,
            <ZoomDataUriCase key="zoom-data-uri" />,
        ],
    },
    {
        name: 'svg-sizes',
        description: {
            checks: 'How SVGs fit their views: objectFit contain and cover, and an SVG drawn sharp at a large size.',
        },
        cases: [
            <SvgCase
                key="svg-contain"
                id="svg-contain"
                source={{ uri: imageUrl('svg-flag.svg') }}
                style={{ width: 64, height: 64 }}
                expected={[100, 50]}
                objectFit="contain"
                description={{
                    checks: 'objectFit="contain" on an SVG: the whole image fits inside the view.',
                    steps: 'Loads the 100×50 SVG (left half red, right half blue) in a 64×64 view with objectFit="contain". Passes when onLoad has 100×50.',
                    shows: 'A 64 pt square: a red and blue band across the middle (the whole SVG), with gray above and below.',
                }}
            />,
            <SvgCase
                key="svg-cover"
                id="svg-cover"
                source={{ uri: imageUrl('svg-flag.svg') }}
                style={{ width: 64, height: 64 }}
                expected={[100, 50]}
                objectFit="cover"
                description={{
                    checks: 'objectFit="cover" on an SVG: the image fills the view, cropped at the sides.',
                    steps: 'Loads the 100×50 SVG (left half red, right half blue) in a 64×64 view with objectFit="cover". Passes when onLoad has 100×50.',
                    shows: 'A 64 pt square, the left half red and the right half blue (the middle of the SVG); gray above and below would mean it was contained.',
                }}
            />,
            <SvgSharpCase key="svg-sharp" />,
            <SvgTintPlaceholderCase key="svg-tint-placeholder" />,
            <SvgFullSizeLargerCase key="svg-full-size-larger" />,
        ],
    },
    {
        name: 'photo-library',
        description: {
            checks: 'Photo library images (ph:// urls, iOS, with SDWebImagePhotosPlugin): a JPEG and a HEIC, a photo shown again after clearing the memory cache, an animated GIF, and urls that fail.',
            steps: "Uses the simulator's photo library, which verify.mts grants access to and adds a GIF to (and on tvOS, whose simulator has no photos, a JPEG and a HEIC of the four colored quadrants).",
        },
        cases:
            Platform.OS === 'ios'
                ? [
                      <PhotoLibraryCase
                          key="photo-library-jpeg"
                          id="photo-library-jpeg"
                          type="public.jpeg"
                          description={{
                              checks: "A JPEG from the photo library (a ph:// url) loads, and onLoad has the photo's own size, not the size it's decoded at (#410: local photos didn't load on iOS).",
                              steps: "Finds a JPEG in the simulator's photo library and shows it by its ph:// url in a 48 pt view. Passes when onLoad has the photo's width and height as the library lists them.",
                              shows: 'A photo of a waterfall, cropped to fill the square (on tvOS, the four colored quadrants verify.mts adds).',
                          }}
                      />,
                      <PhotoLibraryCase
                          key="photo-library-heic"
                          id="photo-library-heic"
                          type="public.heic"
                          description={{
                              checks: "A HEIC photo from the photo library (a ph:// url) loads, and onLoad has the photo's own size, not the size it's decoded at (#410: local photos didn't load on iOS).",
                              steps: "Finds a HEIC photo in the simulator's photo library and shows it by its ph:// url in a 48 pt view. Passes when onLoad has the photo's width and height as the library lists them.",
                              shows: 'A photo of pink and red flowers, cropped to fill the square (on tvOS, the four colored quadrants verify.mts adds).',
                          }}
                      />,
                      <PhotoLibraryAgainCase key="photo-library-again" />,
                      <PhotoLibraryGifCase key="photo-library-gif" />,
                      <PhotoLibraryErrorCase
                          key="photo-library-missing"
                          id="photo-library-missing"
                          uri="ph://00000000-0000-0000-0000-000000000000/L0/001"
                          expected="localIdentifier"
                          description={{
                              checks: "A ph:// url whose id isn't in the photo library fails with onError.",
                              steps: "Loads ph://00000000-0000-0000-0000-000000000000/L0/001, an id no photo has. Passes when onError's error mentions the localIdentifier.",
                              shows: 'An empty gray square: nothing loads.',
                          }}
                      />,
                      <PhotoLibraryErrorCase
                          key="photo-library-assets-library"
                          id="photo-library-assets-library"
                          uri="assets-library://asset/asset.JPG?id=00000000-0000-0000-0000-000000000000&ext=JPG"
                          expected="ph://"
                          description={{
                              checks: 'An assets-library:// url (the old camera roll url) fails with onError, with a message pointing to ph:// urls (#314: they showed a blank image on iOS, with no error).',
                              steps: "Loads an assets-library://asset/asset.JPG?id=… url. Passes when onError's error mentions ph://.",
                              shows: 'An empty gray square: nothing loads.',
                          }}
                      />,
                  ]
                : [
                      <NoCrashCase
                          key="photo-library"
                          id="photo-library"
                          description={{
                              checks: "Photo library (ph://) urls are iOS only: Android's photo pickers give content:// urls, which load like other local files. A placeholder for the group on Android.",
                              steps: 'Shows nothing. Passes once the app has run for a moment.',
                              shows: 'An empty gray square.',
                          }}
                      />,
                  ],
    },
    {
        // Empties the disk cache on iOS, so it's near the end.
        name: 'configure-cache',
        description: {
            checks: 'FastImage.configureCache and the disk cache limit set in the native config.',
        },
        cases: [<ConfigureCacheCase key="configure-cache" />],
    },
    {
        // Near the end: before the fix, these crashed the app, which ended
        // the run.
        name: 'non-object-sources',
        description: {
            checks: 'preload, getCachePath and writeToCache with a url string where a source object goes: each resolves not ok instead of crashing the app.',
        },
        cases: [
            <PreloadNonObjectCase key="preload-non-object" />,
            <CachePathNonObjectCase key="cache-path-non-object" />,
            <CachePathNonObjectCase key="write-to-cache-non-object" write />,
        ],
    },
    {
        // Tapped by scripts/verify.mts (maestro/touch.yaml) while it's shown.
        // Last, so starting maestro-runner doesn't hold up the others.
        name: 'touch',
        description: {
            checks: 'Touches, accessibility labels and keyboard focus on FastImage, with real input: the touch flow (maestro/touch.yaml) taps each case while the group is shown.',
            steps: 'The flow taps, in order: the image inside the Touchable, the Pressable under the pointerEvents="none" image, the one under the box-none image, the image found by its accessibilityLabel, the one found by its aria-label, and the small gray square beside the hitSlop image; on Android it then taps the focus case\'s text field and presses Tab twice. tvOS leaves this group out.',
        },
        cases: [
            <TouchableCase key="touchable" />,
            <PointerEventsCase key="pointer-events" />,
            <PointerEventsBoxNoneCase key="pointer-events-box-none" />,
            <AccessibleCase key="accessible" />,
            <AriaLabelCase key="aria-label" />,
            <HitSlopCase key="hit-slop" />,
            ...(Platform.OS === 'android' ? [<FocusCase key="focus" />] : []),
        ],
    },
]

export default function RegressionExample() {
    const statusBarHeight = useStatusBarHeight()
    // Each description's steps and what it shows, not only what it checks.
    const [details, setDetails] = useState(false)
    return (
        <DetailsContext.Provider value={details}>
            <ScrollView
                style={{ marginTop: statusBarHeight }}
                contentContainerStyle={styles.container}
            >
                <Text style={styles.title}>Regression checks</Text>
                <View style={styles.details}>
                    <Text>Details</Text>
                    <Switch value={details} onValueChange={setDetails} />
                </View>
                <BackgroundCases />
                <ClearWithoutActivityCase />
                {REGRESSION_GROUPS.map((group) => (
                    <React.Fragment key={group.name}>
                        <DescriptionText
                            title={group.name}
                            description={group.description}
                            style={styles.group}
                        />
                        {group.cases}
                    </React.Fragment>
                ))}
            </ScrollView>
        </DetailsContext.Provider>
    )
}
