// FastImage on the web (react-native-web): a View with an <img> in it, with
// FastImage's props and events. Bundlers that resolve `.web` files, or the
// package's `browser` field, pick this file instead of index.tsx, which uses
// the native views.
//
// The View (a div) has FastImage's style, ref and View props. The <img> fills
// it inside its borders, with object-fit for resizeMode (see Picture).
// defaultSource is a second <img> under it until the image has loaded (the
// browser draws the image over it as it arrives), resizeMode="repeat" tiles
// the image as a CSS background, and tintColor is an SVG filter next to them.
//
// Works: source (uri, require(), or several sizes: see sizedSources),
// defaultSource, resizeMode, tintColor, blurRadius, style, children,
// onLoadStart, onLoad, onError, onLoadEnd, and View props (testID,
// accessibility, onLayout, pointerEvents). The native-only props (cache,
// priority, headers, transition, downsample, loop, paused, imageRendering,
// recyclingKey, fallback) and onProgress are ignored.
import React, {
    forwardRef,
    memo,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react'
import { Image, PixelRatio, StyleSheet, View } from 'react-native'
// @ts-expect-error react-native-web has no type declarations.
import { getAssetByID } from 'react-native-web/dist/modules/AssetRegistry'
import { cacheControl, priority, resizeMode } from './constants'
import type {
    CachePathResult,
    CacheState,
    FastImageBackgroundProps,
    FastImageProps,
    FastImageStaticProperties,
    PreloadResult,
    ResizeMode,
    Source,
} from './index'

export type * from './index'

// The native versions never reject: these resolve with an error.
const notSupported: CachePathResult = {
    ok: false,
    error: 'Not supported on the web',
}

// An id that's the same on the server and in the browser: React's useId,
// from React 18 (this package's React types are older), without the
// characters an SVG id can't have (:r0: in React 18, «r0» in React 19). On
// React 17, a counter's (which can differ from the server's).
let ids = 0
const useCounterId = () => useState(() => `${++ids}`)[0]
const useSvgId: () => string =
    (React as unknown as { useId?: () => string }).useId ?? useCounterId

// A layout effect in the browser (it runs before the image can show), and an
// effect when rendering on a server, where layout effects warn.
const useClientLayoutEffect =
    (globalThis as { document?: unknown }).document === undefined
        ? useEffect
        : useLayoutEffect

function FastImageBase({
    source,
    defaultSource,
    tintColor,
    blurRadius,
    onLoadStart,
    onLoad,
    onError,
    onLoadEnd,
    style,
    children,
    resizeMode: mode = 'cover',
    forwardedRef,
    // On the wrapper, as on native.
    onLayout,
    pointerEvents,
    // Native only.
    fallback: _fallback,
    recyclingKey: _recyclingKey,
    loop: _loop,
    imageRendering: _imageRendering,
    paused: _paused,
    transition: _transition,
    downsample: _downsample,
    onProgress: _onProgress,
    ...props
}: FastImageProps & { forwardedRef: React.Ref<any> }) {
    // The label is the wrapper's aria-label, as react-native-web's Image gave
    // it (its View warns that accessibilityLabel is deprecated), and the
    // <img>'s alt text.
    const {
        accessibilityLabel,
        'aria-label': ariaLabel,
        ...viewProps
    } = props as typeof props & { 'aria-label'?: string }
    const label = ariaLabel || accessibilityLabel || undefined
    const several =
        Array.isArray(source) && source.length > 1 ? source : undefined
    const sized = several ? sizedSources(several) : undefined
    const src = sized ? sized.src : resolveUri(source)
    const srcSet = sized?.srcSet
    // What the <img> loads. Another image gets a new <img>, so the previous
    // one doesn't stay while it loads; with several sizes, the <img> stays,
    // and the browser shows the previous image until the new one has loaded.
    const key = srcSet ?? src
    const defaultUri = resolveUri(defaultSource)
    // Whether the image for `key` loaded, or failed.
    const [result, setResult] = useState<{ key: string; ok: boolean }>()
    const ok = result && result.key === key ? result.ok : undefined
    // The same on the server and in the browser. React's ids have characters
    // an SVG id can't (:r0: in React 18, «r0» in React 19).
    const tintId = `fast-image-tint-${useSvgId().replace(/[^\w-]/g, '')}`
    // Tiles are of one image: several sizes are shown as cover.
    const fit = several && mode === 'repeat' ? 'cover' : mode
    const filter =
        [
            blurRadius ? `blur(${blurRadius}px)` : '',
            tintColor ? `url(#${tintId})` : '',
        ]
            .filter(Boolean)
            .join(' ') || undefined
    // defaultSource shows until the image has loaded, and if it fails.
    const showDefault = !!defaultUri && ok !== true

    useClientLayoutEffect(() => {
        if (key) onLoadStart?.()
        // Once per image the browser is asked for.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])

    return (
        <View
            {...viewProps}
            {...({ 'aria-label': label } as {})}
            style={[styles.container, style]}
            onLayout={onLayout}
            pointerEvents={pointerEvents}
            ref={forwardedRef}
        >
            {defaultUri && showDefault ? (
                <Picture
                    key={`default ${defaultUri}`}
                    src={defaultUri}
                    mode={fit}
                    filter={filter}
                    // The image has the label, if there is one.
                    alt={key ? '' : (label ?? '')}
                />
            ) : null}
            {key && src ? (
                <Picture
                    key={several ? 'sizes' : key}
                    src={src}
                    srcSet={srcSet}
                    lazy={!!several}
                    mode={fit}
                    filter={filter}
                    // Shown as it loads, over defaultSource, and not if it
                    // failed (no broken image icon or alt text).
                    hidden={ok === false}
                    alt={label ?? ''}
                    onLoad={(image) => {
                        const { width, height } = loadedSize(image, sized)
                        setResult({ key, ok: true })
                        onLoad?.({ nativeEvent: { width, height } })
                        onLoadEnd?.({ ok: true, width, height })
                    }}
                    onError={(uri) => {
                        const error = `Failed to load resource ${uri}`
                        setResult({ key, ok: false })
                        onError?.({ nativeEvent: { error } })
                        onLoadEnd?.({ ok: false, error })
                    }}
                />
            ) : null}
            {tintColor ? <TintFilter id={tintId} color={tintColor} /> : null}
            {children}
        </View>
    )
}

// A source's (or defaultSource's) uri. Expo's web builds make a require()d
// image a { uri, width, height } object (or a string). Other setups can make
// it a number in react-native-web's asset registry, resolved as its Image
// does: the file for the scale closest to the screen's.
function resolveUri(source: unknown): string | undefined {
    let uri: string | undefined
    if (typeof source === 'number') {
        const asset: PackagerAsset | undefined = getAssetByID(source)
        if (!asset) return undefined
        const scale = asset.scales.reduce(
            (best, scale) =>
                Math.abs(scale - PixelRatio.get()) <
                Math.abs(best - PixelRatio.get())
                    ? scale
                    : best,
            asset.scales[0] ?? 1,
        )
        const suffix = scale !== 1 ? `@${scale}x` : ''
        uri = `${asset.httpServerLocation}/${asset.name}${suffix}.${asset.type}`
    } else if (typeof source === 'string') {
        uri = source
    } else if (Array.isArray(source)) {
        // An array of one is that source.
        return resolveUri(source[0])
    } else if (source && typeof (source as Source).uri === 'string') {
        uri = (source as Source).uri
    }
    // An SVG's markup in a data uri, escaped: a # in it would end the uri.
    const svg = uri?.match(/^(data:image\/svg\+xml;utf8,)(.*)/)
    return svg ? svg[1] + encodeURIComponent(svg[2]) : uri || undefined
}

// An image in react-native-web's asset registry.
type PackagerAsset = {
    httpServerLocation: string
    name: string
    type: string
    scales: number[]
}

// Several sizes of an image, as a srcset (each size's width, times its
// scale), from which the browser loads the one for the image's width in
// device pixels, usually the smallest at least as wide, as expo-image does.
// sizes="auto" has the browser use the width the image is laid out at; it
// only applies to lazy images, and browsers without it use the next value,
// 100vw (the viewport's width). src is the largest, for browsers without
// srcset.
function sizedSources(sources: Source[]) {
    const widths = sources
        .filter((source) => source?.uri && source.width)
        .map((source) => ({
            uri: source.uri as string,
            width: Math.round((source.width ?? 0) * (source.scale ?? 1)),
        }))
    const largest = widths.reduce<(typeof widths)[number] | undefined>(
        (best, source) => (!best || source.width > best.width ? source : best),
        undefined,
    )
    return {
        src: largest?.uri ?? sources.find((source) => source?.uri)?.uri,
        srcSet:
            widths.length > 0
                ? widths
                      .map((source) => `${source.uri} ${source.width}w`)
                      .join(', ')
                : undefined,
        widths,
    }
}

// An <img> that loaded. The DOM's types aren't in this package's TypeScript
// setup.
type LoadedImage = {
    naturalWidth: number
    naturalHeight: number
    currentSrc: string
    complete?: boolean
    decode?: () => Promise<void>
}

// The size of the image that loaded, in pixels, as on native. With a srcset,
// the natural size is divided by the density the browser picked (the
// candidate's width over `sizes`): it's the picked candidate's size instead.
function loadedSize(
    image: LoadedImage,
    sized: ReturnType<typeof sizedSources> | undefined,
) {
    const picked = sized?.srcSet
        ? sized.widths.find(
              (source) =>
                  new URL(source.uri, image.currentSrc).href ===
                  image.currentSrc,
          )
        : undefined
    return {
        width: picked?.width ?? image.naturalWidth,
        height: picked
            ? Math.round(
                  (image.naturalHeight * picked.width) / image.naturalWidth,
              )
            : image.naturalHeight,
    }
}

// resizeMode as object-fit: center shows the image at its size, scaled down if
// it's larger than the view. repeat tiles it instead (see Picture).
const OBJECT_FIT = {
    cover: 'cover',
    contain: 'contain',
    stretch: 'fill',
    center: 'scale-down',
    repeat: 'cover',
} as const

const fill = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
} as const

// An image filling the view: an <img> with object-fit. With
// resizeMode="repeat", a div's CSS background instead, repeated from the left
// edge (vertically centered), at the image's size in pixels, scaled down to
// fit if it's larger than the view; the <img> is on top of it, transparent,
// for its load events, screen readers and the browser's menu (save, copy).
function Picture({
    src,
    srcSet,
    lazy,
    mode,
    filter,
    hidden,
    alt,
    onLoad,
    onError,
}: {
    src: string
    srcSet?: string
    // Several sizes load lazily, for sizes="auto" (see sizedSources).
    lazy?: boolean
    mode: ResizeMode
    filter?: string
    hidden?: boolean
    alt: string
    onLoad?: (image: LoadedImage) => void
    onError?: (uri: string) => void
}) {
    const repeat = mode === 'repeat'
    const image = useRef<HTMLImageElement>(null)
    const tiles = useRef<HTMLDivElement>(null)
    const mounted = useRef(true)
    // The load that was handled: the file, for these sources. The image can
    // have loaded when this mounts: from the memory cache (it also gets a load
    // event), or before the page's JavaScript ran, in a page rendered on a
    // server (it doesn't). The browser fires load for each new srcset, also
    // when it keeps the same file, and can load another size later.
    const handled = useRef<{ sources: string; file: string } | undefined>(
        undefined,
    )
    const [natural, setNatural] = useState<Size>()
    const [box, setBox] = useState<Size>()

    const loaded = (target: LoadedImage) => {
        const file = target.currentSrc || src
        const sources = srcSet ?? src
        if (
            !mounted.current ||
            (handled.current?.sources === sources &&
                handled.current.file === file)
        ) {
            return
        }
        handled.current = { sources, file }
        // For the tiles.
        setNatural({ width: target.naturalWidth, height: target.naturalHeight })
        // Once it's decoded, as react-native-web's Image did, so it shows at
        // once (e.g. in place of defaultSource). Safari can fail to decode an
        // SVG, which still shows.
        const done = () => {
            if (mounted.current) onLoad?.(target)
        }
        Promise.resolve(target.decode?.()).then(done, done)
    }

    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
        }
    }, [])

    // An image that loaded or failed before this mounted (in a page rendered
    // on a server, before the page's JavaScript ran) had its event then. A
    // broken image is complete with no size; so can an SVG without one be in
    // some browsers, which decodes.
    useClientLayoutEffect(() => {
        const target = image.current as unknown as LoadedImage | null
        if (!target?.complete) return
        if (target.naturalWidth > 0) return loaded(target)
        Promise.resolve(target.decode?.()).then(
            () => loaded(target),
            () => {
                if (mounted.current) onError?.(target.currentSrc || src)
            },
        )
        // When it mounts.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // The tiles' size depends on the view's.
    useClientLayoutEffect(() => {
        const Observer = (globalThis as any).ResizeObserver
        const node = tiles.current
        if (!repeat || !node || !Observer) return
        const observer = new Observer((entries: any[]) => {
            const { width, height } = entries[0].contentRect
            setBox({ width, height })
        })
        observer.observe(node)
        return () => observer.disconnect()
    }, [repeat])

    const img = (
        <img
            ref={image}
            src={src}
            srcSet={srcSet}
            sizes={srcSet ? 'auto, 100vw' : undefined}
            loading={lazy ? 'lazy' : undefined}
            alt={alt}
            draggable={false}
            style={{
                ...fill,
                objectFit: OBJECT_FIT[mode] ?? 'cover',
                filter: repeat ? undefined : filter,
                opacity: repeat || hidden ? 0 : undefined,
            }}
            onLoad={(event) =>
                loaded(event.currentTarget as unknown as LoadedImage)
            }
            onError={(event) => {
                const target = event.currentTarget as unknown as
                    | LoadedImage
                    | undefined
                if (mounted.current) onError?.(target?.currentSrc || src)
            }}
        />
    )
    return (
        <>
            {repeat ? (
                <div
                    ref={tiles}
                    style={{
                        ...fill,
                        backgroundImage: `url("${src}")`,
                        backgroundRepeat: 'repeat',
                        backgroundPosition: '0',
                        backgroundSize: tileSize(natural, box),
                        filter,
                        opacity: hidden ? 0 : undefined,
                    }}
                />
            ) : null}
            {img}
        </>
    )
}

type Size = { width: number; height: number }

// The image's size, scaled down to fit in the view if it's larger, rounded up
// to whole pixels. Until both are known, the image's size.
function tileSize(natural: Size | undefined, box: Size | undefined) {
    if (!natural?.width || !natural.height || !box?.width || !box.height) {
        return undefined
    }
    const scale = Math.min(
        1,
        box.width / natural.width,
        box.height / natural.height,
    )
    return `${Math.ceil(scale * natural.width)}px ${Math.ceil(scale * natural.height)}px`
}

// tintColor: an SVG filter that fills the image's pixels with the color,
// keeping their alpha.
function TintFilter({ id, color }: { id: string; color: unknown }) {
    return (
        <svg style={tintStyle}>
            <defs>
                <filter id={id}>
                    {/* A new element for a new color, which browsers apply. */}
                    <feFlood floodColor={String(color)} key={String(color)} />
                    <feComposite in2="SourceAlpha" operator="in" />
                </filter>
            </defs>
        </svg>
    )
}

const tintStyle = {
    position: 'absolute',
    width: 0,
    height: 0,
    visibility: 'hidden',
} as const

const FastImageMemo = memo(FastImageBase)

const FastImageComponent: React.ComponentType<FastImageProps> = forwardRef(
    (props: FastImageProps, ref: React.Ref<any>) => (
        <FastImageMemo forwardedRef={ref} {...props} />
    ),
)

FastImageComponent.displayName = 'FastImage'

// The image's size, or 0 by 0 if it can't be read.
function getSize(uri: string) {
    return new Promise<{ width: number; height: number }>((resolve) => {
        Image.getSize(
            uri,
            (width, height) => resolve({ width, height }),
            () => resolve({ width: 0, height: 0 }),
        )
    })
}

const FastImage: React.ComponentType<FastImageProps> &
    FastImageStaticProperties = FastImageComponent as any

FastImage.resizeMode = resizeMode

FastImage.cacheControl = cacheControl

FastImage.priority = priority

// Loads each source into the browser's cache, with a result per source.
FastImage.preload = (sources: Source[]) =>
    Promise.all(
        sources.map((source): Promise<PreloadResult> => {
            const uri = source ? source.uri : undefined
            if (typeof uri !== 'string' || !uri) {
                return Promise.resolve({
                    ok: false,
                    error: 'Invalid source: no uri',
                    uri,
                })
            }
            return Image.prefetch(uri).then(
                () => getSize(uri).then((size) => ({ ok: true, uri, ...size })),
                () => ({ ok: false, error: 'Failed to load the image', uri }),
            )
        }),
    )

// The browser manages its own cache: these don't clear it.
FastImage.clearMemoryCache = () => Promise.resolve(notSupported)

FastImage.clearDiskCache = () => Promise.resolve(notSupported)

FastImage.configureCache = (): Promise<CacheState> => Promise.resolve({})

FastImage.writeToCache = () => Promise.resolve(notSupported)

FastImage.getCachePath = () => Promise.resolve(notSupported)

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
    },
})

// FastImage forwards its ref, which its type doesn't say.
const FastImageWithRef = FastImageComponent as React.ComponentType<
    FastImageProps & { ref?: React.Ref<any> }
>

export const FastImageBackground: React.ComponentType<FastImageBackgroundProps> =
    forwardRef(
        (
            {
                style,
                imageStyle,
                imageRef,
                children,
                ...props
            }: FastImageBackgroundProps,
            ref: React.Ref<any>,
        ) => (
            <View style={style} ref={ref}>
                <FastImageWithRef
                    {...props}
                    style={[StyleSheet.absoluteFill, imageStyle]}
                    ref={imageRef}
                />
                {children}
            </View>
        ),
    )

FastImageBackground.displayName = 'FastImageBackground'

export default FastImage
