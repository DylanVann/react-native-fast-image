import React, { forwardRef, memo, useRef } from 'react'
import {
    View,
    Image,
    NativeModules,
    requireNativeComponent,
    StyleSheet,
    LayoutChangeEvent,
    StyleProp,
    ViewStyle,
    ImageRequireSource,
    Platform,
    AccessibilityProps,
    ViewProps,
} from 'react-native'
import { cacheControl, priority, resizeMode } from './constants'

// React Native's ColorValue, which its types only export since 0.63. Taken
// from ViewStyle so the types also work with older React Native types, where
// it's string.
type ColorValue = NonNullable<ViewStyle['backgroundColor']>

export type ResizeMode = 'contain' | 'cover' | 'stretch' | 'center' | 'repeat'

export type Priority = 'low' | 'normal' | 'high'

export type Cache = 'immutable' | 'web' | 'cacheOnly'

export type Source = {
    uri?: string
    headers?: { [key: string]: string }
    priority?: Priority
    cache?: Cache
    /**
     * The key the image is cached under, instead of its uri. For urls that
     * change while the image stays the same, e.g. signed urls with a token or
     * an expiry: use something stable, like the image's id.
     */
    cacheKey?: string
    /**
     * Whether the decoded image is kept in the memory cache (default true).
     * With false it's only kept on disk: a view doesn't leave it in memory
     * once it stops showing it, and `FastImage.preload` downloads it without
     * decoding it. For large images shown once, like a full-screen photo; a
     * list scrolled back decodes them again.
     */
    memoryCache?: boolean
    /**
     * With several sources (`source` as an array), the image's size at this
     * uri in pixels (width and height, times `scale` if given): the view
     * loads the source closest to its own size.
     */
    width?: number
    height?: number
    scale?: number
}

export type Transition = {
    /**
     * How long the fade takes, in milliseconds; 0 means no fade. Defaults to
     * the platform's usual length: 300 ms on Android, 250 ms on iOS.
     */
    duration?: number
    /**
     * Also fades between images: a new `source` replacing an image that's
     * showing cross-dissolves from it. Otherwise only an image that appears
     * over nothing (or over `defaultSource`) fades in, and a new source
     * replaces the image showing at once, once it has loaded.
     * @default false
     */
    betweenImages?: boolean
    /**
     * Skips the fade for an image from a cache, so images already loaded
     * show at once, e.g. in a list scrolled back up or a reused row.
     *
     * - `'memory'`: skips it for images from the memory cache.
     * - `'all'`: skips it for images from the memory or disk cache too, so
     *   images that download fade in, and local files and bundled images
     *   usually only the first time (the disk cache usually keeps them too).
     * - `'none'`: always fades.
     *
     * Downloads, local files and bundled images (`require()`) fade in.
     * @default 'memory'
     */
    skipOnCacheHit?: 'none' | 'memory' | 'all' | null
}

export interface OnLoadEvent {
    nativeEvent: {
        width: number
        height: number
        // The view's React tag. Missing on Android with the legacy architecture.
        // TODO: make it required once the New Architecture is the minimum.
        target?: number
    }
}

export interface OnErrorEvent {
    nativeEvent: {
        // What went wrong, e.g. an HTTP status code or an image that can't be
        // decoded.
        error: string
    }
}

// A load's result, as onLoadEnd gets it: ok with the image's size, or not ok
// with the error (as onLoad and onError get them).
export type LoadResult =
    | { ok: true; width: number; height: number }
    | { ok: false; error: string }

// configureCache's changes: a number (0 for no limit), or null to go back to
// the app's native config (Info.plist, AndroidManifest.xml) or the platform's
// default. Leave one out to keep it. Changes are saved, and used on the next
// launches too. Android only has maxDiskSize.
export interface CacheLimits {
    // The most bytes of images kept on disk. When it's over, the least
    // recently used are removed (on iOS, until it's half this size). Default:
    // no limit on iOS, 250 MB on Android.
    maxDiskSize?: number | null
    // iOS: the seconds an image is kept on disk after it was last used, or 0
    // to keep them until maxDiskSize removes them. Default: 1 week.
    maxDiskAge?: number | null
    // iOS: the most bytes of decoded images kept in memory. Default: no limit
    // (they're removed when the system is low on memory).
    maxMemorySize?: number | null
}

// configureCache's result: the limits in effect (0 for no limit), and the bytes
// the disk cache uses now. Android only has maxDiskSize and diskSize, and
// neither if the app has its own AppGlideModule.
export interface CacheState {
    maxDiskSize?: number
    maxDiskAge?: number
    maxMemorySize?: number
    diskSize?: number
}

// getCachePath's result: ok with the file's path, or not ok with the error.
export type CachePathResult =
    | { ok: true; path: string }
    | { ok: false; error: string }

export interface OnProgressEvent {
    nativeEvent: {
        loaded: number
        total: number
        // loaded / total, from 0 to 1.
        progress: number
    }
}

// Extends ViewStyle rather than FlexStyle/TransformsStyle/ShadowStyleIOS, which
// React Native 0.80+'s default types no longer export. Only the image's own keys
// are added; the rest (radii, opacity, colors) come from ViewStyle, so they're
// the app's React Native types (e.g. string radii, Animated values).
export interface ImageStyle extends ViewStyle {
    overlayColor?: ViewStyle['backgroundColor']
    tintColor?: ViewStyle['backgroundColor']
}

export interface FastImageProps extends AccessibilityProps, ViewProps {
    /**
     * The image: a source, a `require()`d image, or several sources of the
     * same image at different sizes (each with its `width` and `height` in
     * pixels), of which the view loads the one closest to its size.
     */
    source?: Source | Source[] | ImageRequireSource
    defaultSource?: ImageRequireSource
    resizeMode?: ResizeMode
    fallback?: boolean
    /**
     * When `source` changes, the image showing stays until the new one has
     * loaded. For views that get reused for other content, such as rows in
     * FlashList or recyclerlistview, set this to something that identifies the
     * content (e.g. the item's id): when it changes, the image is cleared
     * right away instead, so a reused row doesn't show the previous row's
     * image. Unlike changing `key`, the view is kept.
     */
    recyclingKey?: string | null
    /**
     * How many times an animated image (GIF, animated WebP, APNG, and animated
     * AVIF on Android) plays: the file's own loop count by default, `true` to
     * loop forever, `false` to play once, or a number of times. Changing it
     * restarts the animation.
     */
    loop?: boolean | number
    /**
     * How the image is filtered when it's drawn smaller or larger than its
     * size: `'auto'` (default, the platform's usual filtering), `'smooth'`
     * (iOS only: keeps a large image drawn much smaller from looking jagged
     * or noisy; uses more memory, see the README) or `'pixelated'` (sharp
     * pixels, e.g. for pixel art).
     */
    imageRendering?: 'auto' | 'smooth' | 'pixelated'
    /**
     * Pauses an animated image (GIF, animated WebP, APNG, and animated AVIF on
     * Android) on the frame it's showing; `false` plays it again from there
     * (on Android, an animated WebP or AVIF plays again from its first frame:
     * Android can't resume one). Each image animates on its own, so pausing
     * one doesn't pause others showing the same file.
     */
    paused?: boolean
    /**
     * Fades the image in when it loads: `true` for the platform's usual fade,
     * a duration in milliseconds, or a `Transition` (default: no fade). An
     * image fades in when it appears over nothing (see `betweenImages`),
     * unless it's from the memory cache (see `skipOnCacheHit`).
     */
    transition?: boolean | number | Transition | null
    /**
     * iOS only. Decodes a large image at about the size it's shown at, so it
     * takes much less memory. `true` (default). `false` decodes images at
     * full size, e.g. for an image that's zoomed in on with a transform. See
     * the README.
     */
    downsample?: boolean
    /**
     * Blurs the image by this radius, in points, like React Native's Image
     * (the same radius looks about the same on both platforms). `0` (default)
     * is no blur. For still images or occasional changes, not for animating.
     * Only the loaded image is blurred, not `defaultSource`. An animated image
     * shows its first frame, blurred. See the README.
     */
    blurRadius?: number

    onLoadStart?(): void

    onProgress?(event: OnProgressEvent): void

    onLoad?(event: OnLoadEvent): void

    onError?(event: OnErrorEvent): void

    /**
     * Called once the image has loaded or failed to, with the result: `ok` and
     * the image's size, or not `ok` and the error.
     */
    onLoadEnd?(result: LoadResult): void

    /**
     * onLayout function
     *
     * Invoked on mount and layout changes with
     *
     * {nativeEvent: { layout: {x, y, width, height}}}.
     */
    onLayout?: (event: LayoutChangeEvent) => void

    /**
     *
     * Style
     */
    style?: StyleProp<ImageStyle>

    /**
     * TintColor
     *
     * If supplied, changes the color of all the non-transparent pixels to the given color.
     */

    tintColor?: ColorValue

    /**
     * A unique identifier for this element to be used in UI Automation testing scripts.
     */
    testID?: string

    /**
     * Render children within the image.
     */
    children?: React.ReactNode
}

const resolveDefaultSource = (
    defaultSource?: ImageRequireSource,
): string | number | null => {
    if (!defaultSource) {
        return null
    }
    if (Platform.OS === 'android') {
        // Android receives a URI string, and resolves into a Drawable using RN's methods.
        const resolved = Image.resolveAssetSource(
            defaultSource as ImageRequireSource,
        )

        if (resolved) {
            return resolved.uri
        }

        return null
    }
    // iOS or other number mapped assets
    // In iOS the number is passed, and bridged automatically into a UIImage
    return defaultSource
}

// Finds tintColor in a style prop, where the last style that sets it wins, as
// with StyleSheet.flatten, but without flattening (which allocates a merged
// object for an array style on every render).
function tintColorFromStyle(style: unknown): ImageStyle['tintColor'] {
    if (Array.isArray(style)) {
        for (let i = style.length - 1; i >= 0; i--) {
            const found = tintColorFromStyle(style[i])
            if (found !== undefined) return found
        }
        return undefined
    }
    if (typeof style === 'number') {
        // A registered style from StyleSheet.create on older React Native.
        const flattened = StyleSheet.flatten(style as any) as
            | ImageStyle
            | undefined
        return flattened ? flattened.tintColor : undefined
    }
    return style && typeof style === 'object'
        ? (style as ImageStyle).tintColor
        : undefined
}

// The native loopCount: -1 for the file's own, 0 for forever, or a number of
// plays. Always sent, since native would reset a removed prop to 0 (forever).
function loopCount(loop: boolean | number | undefined) {
    if (loop === undefined) return -1
    if (loop === true) return 0
    if (loop === false) return 1
    return Number.isFinite(loop) ? Math.max(1, Math.floor(loop)) : 0
}

// onLoadEnd's result from the native event (ok with the image's size, or not
// ok with the error).
function loadResult(event: {
    ok?: boolean
    width?: number
    height?: number
    error?: string
}): LoadResult {
    return event.ok
        ? { ok: true, width: event.width ?? 0, height: event.height ?? 0 }
        : { ok: false, error: event.error ?? 'Failed to load the image' }
}

// Adds `progress` (loaded / total, 0 to 1) to onProgress's event. Worked out
// here so it's the same on both platforms and architectures, and with
// fallback (React Native's Image). The native views don't send events with an
// unknown total; React Native's Image can, and those get 0.
function withProgress(onProgress: FastImageProps['onProgress']) {
    return (
        onProgress &&
        ((event: OnProgressEvent) => {
            const { loaded, total } = event.nativeEvent
            event.nativeEvent.progress =
                total > 0 ? Math.min(1, Math.max(0, loaded / total)) : 0
            onProgress(event)
        })
    )
}

// The platform's usual fade length: Glide's and React Native's Image's on
// Android, Core Animation's default on iOS.
const DEFAULT_FADE_MS = Platform.OS === 'ios' ? 250 : 300

// The native transition props. Always sent, so removing `transition` turns it
// off.
function transitionProps(transition: FastImageProps['transition']) {
    const { duration, betweenImages, skipOnCacheHit }: Transition =
        typeof transition === 'number'
            ? { duration: transition }
            : typeof transition === 'object' && transition
              ? {
                    ...transition,
                    // A missing (or, from Flow, null) duration is the usual one.
                    duration: transition.duration ?? DEFAULT_FADE_MS,
                }
              : { duration: transition ? DEFAULT_FADE_MS : 0 }
    return {
        transitionDuration:
            typeof duration === 'number' && duration > 0 ? duration : 0,
        transitionBetweenImages: !!betweenImages,
        transitionSkipOnCacheHit: skipOnCacheHit || 'memory',
    }
}

// A copy of the source without `cache`.
function withoutCache(source: Source | undefined) {
    const { cache: _cache, ...rest } = source || {}
    return rest
}

function FastImageBase({
    source,
    defaultSource,
    tintColor,
    onLoadStart,
    onProgress,
    onLoad,
    onError,
    onLoadEnd,
    style,
    fallback,
    children,
    resizeMode = 'cover',
    loop,
    transition,
    forwardedRef,
    // On the wrapper, so the layout is relative to the parent (the image view
    // inside always has x and y of 0).
    onLayout,
    // On the wrapper, which would otherwise still take touches. With
    // 'box-none' the image is part of the box, so it ignores touches too.
    pointerEvents,
    ...viewProps
}: FastImageProps & { forwardedRef: React.Ref<any> }) {
    // Touchables pass onClick to their child (React Native 0.73+, for
    // accessibility clicks). It goes on the wrapper: the image view doesn't
    // support it on iOS, which crashed (#1020). Older React Native types don't
    // include it.
    const { onClick, ...props } = viewProps as typeof viewProps & {
        onClick?: (event: any) => void
    }
    // React Native's Image (fallback) calls onLoadEnd without the result: take
    // it from the onLoad or onError just before.
    const fallbackResult = useRef<LoadResult | undefined>(undefined)
    const wrapperProps = { onLayout, onClick, pointerEvents }
    const imageProps = {
        ...props,
        pointerEvents:
            pointerEvents === 'box-none' ? ('none' as const) : undefined,
    }
    // tintColor can also be set in style, as with React Native's Image. The
    // prop wins.
    const resolvedTintColor =
        tintColor != null ? tintColor : tintColorFromStyle(style)
    if (fallback) {
        // Remove `cache`, which React Native's Image doesn't support. A
        // require()d source is a number: pass it through (spreading it gave {}).
        const cleanedSource =
            typeof source === 'number'
                ? source
                : Array.isArray(source)
                  ? source.map(withoutCache)
                  : withoutCache(source)
        const resolvedSource = Image.resolveAssetSource(cleanedSource)

        return (
            <View
                style={[styles.imageContainer, style]}
                {...wrapperProps}
                ref={forwardedRef}
            >
                <Image
                    {...imageProps}
                    style={[
                        styles.fallbackImage,
                        { tintColor: resolvedTintColor },
                    ]}
                    source={resolvedSource}
                    defaultSource={defaultSource}
                    onLoadStart={onLoadStart}
                    onProgress={withProgress(onProgress) as any}
                    onLoad={
                        onLoadEnd
                            ? (event: any) => {
                                  const { width, height } =
                                      event.nativeEvent.source
                                  fallbackResult.current = {
                                      ok: true,
                                      width,
                                      height,
                                  }
                                  onLoad?.(event)
                              }
                            : (onLoad as any)
                    }
                    onError={
                        onLoadEnd
                            ? (event: any) => {
                                  fallbackResult.current = {
                                      ok: false,
                                      error: String(event.nativeEvent.error),
                                  }
                                  onError?.(event)
                              }
                            : (onError as any)
                    }
                    onLoadEnd={
                        onLoadEnd &&
                        (() =>
                            onLoadEnd(
                                fallbackResult.current ?? {
                                    ok: false,
                                    error: 'Failed to load the image',
                                },
                            ))
                    }
                    resizeMode={resizeMode}
                />
                {children}
            </View>
        )
    }

    // Several sources are picked from natively, for the view's size; one in
    // an array is a plain source.
    const sources = Array.isArray(source)
        ? source.length === 1
            ? undefined
            : source
        : undefined
    const single = Array.isArray(source) ? source[0] : source
    const resolvedSource = sources
        ? undefined
        : Image.resolveAssetSource(single as any)
    const resolvedDefaultSource = resolveDefaultSource(defaultSource)

    return (
        <View
            style={[styles.imageContainer, style]}
            {...wrapperProps}
            ref={forwardedRef}
        >
            <FastImageView
                {...imageProps}
                tintColor={resolvedTintColor}
                loopCount={loopCount(loop)}
                {...transitionProps(transition)}
                style={StyleSheet.absoluteFill}
                source={resolvedSource}
                sources={sources}
                defaultSource={resolvedDefaultSource}
                onFastImageLoadStart={onLoadStart}
                onFastImageProgress={withProgress(onProgress)}
                // The native views only send progress events with this, so
                // images without onProgress don't send one for every chunk.
                trackProgress={!!onProgress}
                onFastImageLoad={onLoad}
                onFastImageError={onError}
                onFastImageLoadEnd={
                    onLoadEnd &&
                    ((event: { nativeEvent: any }) =>
                        onLoadEnd(loadResult(event.nativeEvent)))
                }
                resizeMode={resizeMode}
            />
            {children}
        </View>
    )
}

const FastImageMemo = memo(FastImageBase)

const FastImageComponent: React.ComponentType<FastImageProps> = forwardRef(
    (props: FastImageProps, ref: React.Ref<any>) => (
        <FastImageMemo forwardedRef={ref} {...props} />
    ),
)

FastImageComponent.displayName = 'FastImage'

// A source that loaded (and is now cached).
export interface PreloadSuccess {
    // The source's uri.
    uri: string
    ok: true
    // The image's size (as in onLoad).
    width: number
    height: number
}

// A source that failed to load.
export interface PreloadFailure {
    // The source's uri (none for a source without one, e.g. null).
    uri?: string
    ok: false
    // What went wrong.
    error: string
}

// Check `ok` to tell which it is: e.g. `if (result.ok)` narrows it to a
// PreloadSuccess, with its size. Reading `width` or `error` without checking
// is a type error.
export type PreloadResult = PreloadSuccess | PreloadFailure

// A result as native sends it (without the uri).
type NativePreloadResult =
    | Omit<PreloadSuccess, 'uri'>
    | Omit<PreloadFailure, 'uri'>

const noResult: NativePreloadResult = { ok: false, error: 'No result' }

export interface FastImageStaticProperties {
    resizeMode: typeof resizeMode
    priority: typeof priority
    cacheControl: typeof cacheControl
    preload: (sources: Source[]) => Promise<PreloadResult[]>
    clearMemoryCache: () => Promise<void>
    clearDiskCache: () => Promise<void>
    /**
     * The path of the source's downloaded file in the disk cache, downloading
     * it first if it isn't there (without decoding it). With
     * `cache: 'cacheOnly'`, or a `cacheKey` without a `uri`, it doesn't
     * download. Never rejects.
     */
    getCachePath: (source: Source) => Promise<CachePathResult>
    /**
     * Stores a local image file (a `file://` uri or a path, or on Android a
     * `content://` uri) as the source's image in the disk cache, so views and
     * preloads of the source show it without downloading it. A source with a
     * `cacheKey` doesn't need a `uri`. Resolves with its cached file. Doesn't
     * replace an image that's already cached, and isn't for `cache: 'web'`
     * sources. Never rejects.
     */
    writeToCache: (source: Source, file: string) => Promise<CachePathResult>
    /**
     * Changes the cache's limits at runtime (only those given; 0 for no
     * limit, null to go back to the app's native config) and saves them, then
     * resolves with the limits in effect and the disk cache's size. Without
     * limits, only resolves. iOS applies changes at once. Android only has
     * `maxDiskSize`, applied when Glide starts: at once if no image has
     * loaded yet, otherwise from the next launch.
     */
    configureCache: (limits?: CacheLimits) => Promise<CacheState>
}

const FastImage: React.ComponentType<FastImageProps> &
    FastImageStaticProperties = FastImageComponent as any

FastImage.resizeMode = resizeMode

FastImage.cacheControl = cacheControl

FastImage.priority = priority

// preload, getCachePath and writeToCache take one source per image, not
// several sizes of one: pick the size (e.g. the one a view will show).
const ONE_SOURCE =
    'Takes one source, not an array of sizes: pass the size to use'

FastImage.preload = (sources: Source[]) =>
    // Null sources are sent as {} so native results line up with the sources
    // (iOS drops null entries), and arrays too (their results are replaced).
    Promise.resolve(
        NativeModules.FastImageView.preload(
            sources.map((s) => (s && !Array.isArray(s) ? s : {})),
        ),
    ).then((results?: NativePreloadResult[]) =>
        sources.map((source, i): PreloadResult => {
            if (Array.isArray(source)) {
                return { ok: false, error: ONE_SOURCE, uri: undefined }
            }
            const uri = source ? source.uri : undefined
            const result = results?.[i] ?? noResult
            if (!result.ok) return { ...result, uri }
            // Native already fails a source without a uri.
            return typeof uri === 'string'
                ? { ...result, uri }
                : { ok: false, error: 'Invalid source: no uri', uri }
        }),
    )

FastImage.clearMemoryCache = () =>
    NativeModules.FastImageView.clearMemoryCache()

FastImage.clearDiskCache = () => NativeModules.FastImageView.clearDiskCache()

FastImage.configureCache = (limits: CacheLimits = {}): Promise<CacheState> =>
    Promise.resolve(NativeModules.FastImageView.configureCache(limits))

FastImage.writeToCache = (
    source: Source,
    file: string,
): Promise<CachePathResult> =>
    Array.isArray(source)
        ? Promise.resolve({ ok: false, error: ONE_SOURCE })
        : // A null source is sent as {} (it fails as a source without a uri).
          Promise.resolve(
              NativeModules.FastImageView.writeToCache(source || {}, file),
          )

FastImage.getCachePath = (source: Source): Promise<CachePathResult> =>
    Array.isArray(source)
        ? Promise.resolve({ ok: false, error: ONE_SOURCE })
        : // A null source is sent as {} (it fails as a source without a uri).
          Promise.resolve(
              NativeModules.FastImageView.getCachePath(source || {}),
          )

const styles = StyleSheet.create({
    // React Native's Image sizes itself from a require()d source's width and
    // height unless the style sets them, which would override absoluteFill.
    fallbackImage: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
    },
    imageContainer: {
        overflow: 'hidden',
    },
})

export interface FastImageBackgroundProps extends Omit<
    FastImageProps,
    'style' | 'children'
> {
    /** The container's style; the image fills it. */
    style?: StyleProp<ViewStyle>
    /** The image's style. */
    imageStyle?: StyleProp<ImageStyle>
    /** A ref to the image (the FastImage inside). */
    imageRef?: React.Ref<any>
    /** Content shown on top of the image. */
    children?: React.ReactNode
}

// FastImage forwards its ref, which its type doesn't say.
const FastImageWithRef = FastImageComponent as React.ComponentType<
    FastImageProps & { ref?: React.Ref<any> }
>

/**
 * An image with content on top of it, like React Native's `ImageBackground`: a
 * view that the image fills, with the children on top. Use it rather than
 * giving `FastImage` children, which it won't render in the next major version
 * (the image will be a single native view). The other props go to the image;
 * the ref is the view's.
 */
export const FastImageBackground: React.ComponentType<FastImageBackgroundProps> =
    forwardRef(
        (
            {
                style,
                imageStyle,
                imageRef,
                children,
                importantForAccessibility,
                ...props
            }: FastImageBackgroundProps,
            ref: React.Ref<any>,
        ) => (
            <View
                accessibilityIgnoresInvertColors
                importantForAccessibility={importantForAccessibility}
                style={style}
                ref={ref}
            >
                <FastImageWithRef
                    {...props}
                    importantForAccessibility={importantForAccessibility}
                    style={[StyleSheet.absoluteFill, imageStyle]}
                    ref={imageRef}
                />
                {children}
            </View>
        ),
    )

FastImageBackground.displayName = 'FastImageBackground'

// Types of requireNativeComponent are not correct.
const FastImageView = (requireNativeComponent as any)(
    'FastImageView',
    FastImage,
    {
        nativeOnly: {
            onFastImageLoadStart: true,
            onFastImageProgress: true,
            onFastImageLoad: true,
            onFastImageError: true,
            onFastImageLoadEnd: true,
            trackProgress: true,
        },
    },
)

export default FastImage
