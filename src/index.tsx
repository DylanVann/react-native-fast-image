import React, { forwardRef, memo, useRef } from 'react'
import {
    ColorValue,
    View,
    Image,
    NativeModules,
    requireNativeComponent,
    StyleSheet,
    StyleProp,
    ViewStyle,
    ImageRequireSource,
    Platform,
    AccessibilityProps,
    ViewProps,
} from 'react-native'
import { cacheControl, priority, resizeMode } from './constants'
import { fromStyle, resolveObjectFit } from './objectFit'

/** How the image fits the view: see [`objectFit`](#objectfit). */
export type ObjectFit = 'fill' | 'contain' | 'cover' | 'none' | 'scale-down'

/** How the image fits the view: see [`resizeMode`](#resizemode). */
export type ResizeMode = 'contain' | 'cover' | 'stretch' | 'center' | 'repeat'

/** An image's load priority: see [`source.priority`](#sourcepriority). */
export type Priority = 'low' | 'normal' | 'high'

/** How fresh an image must be: see [`source.cache`](#sourcecache). */
export type Cache = 'immutable' | 'web' | 'cacheOnly'

/** A remote image to load, and how to load and cache it. */
export type Source = {
    /**
     * Remote url to load the image from. e.g. `'https://example.com/image.jpg'`.
     *
     * Also loads local files (`file://`, and on Android `content://`), images
     * in the app by name (e.g. `'my_image'`: in its asset catalog on iOS, a
     * drawable on Android), photo library images on iOS and tvOS (`ph://`,
     * see [Photo library images](#photo-library-images-ios-and-tvos)) and SVG
     * images (see [SVG images](docs/formats.md#svg-images)).
     */
    uri?: string
    /** Headers to load the image with. e.g. `{ Authorization: 'someAuthToken' }`. */
    headers?: { [key: string]: string }
    /**
     * A hint for which images to start loading first when several are
     * waiting: `'high'` ones before `'normal'` ones, and `'low'` ones after.
     * It's best effort, not an order: several images load at once, and when
     * each finishes depends on its size and the network.
     *
     * - `'low'`: e.g. images further down a list.
     * - `'normal'`: the default.
     * - `'high'`: e.g. the image the screen is about.
     *
     * @default 'normal'
     */
    priority?: Priority
    /**
     * How fresh the image must be. See
     * [how caching is handled](docs/how-is-caching-handled.md) for how the
     * options fit together.
     *
     * - `'immutable'`: loads the image once, then shows the cached copy until
     *   its url (or `cacheKey`) changes.
     * - `'web'`: follows the server's HTTP cache headers, as a browser does,
     *   checking with the server when it loads. These responses are kept in
     *   their own HTTP cache (50 MB on each platform), which `clearDiskCache`
     *   also clears.
     * - `'cacheOnly'`: only shows a cached image, without making a request.
     *
     * @default 'immutable'
     */
    cache?: Cache
    /**
     * The key the image is cached under, instead of its uri. Use it for urls
     * that change while the image stays the same, e.g. signed urls with a
     * token or an expiry. Use something that identifies the image, and change
     * it when the image changes (e.g. include a version or the time it was
     * updated), or the old image keeps showing.
     *
     * Not used with `cache: 'web'`, which follows the HTTP cache (keyed by
     * url).
     *
     * @example
     * ```jsx
     * <FastImage
     *     source={{
     *         uri: signedUrl,
     *         cacheKey: `avatar-${user.id}-${user.avatarUpdatedAt}`,
     *     }}
     * />
     * ```
     */
    cacheKey?: string
    /**
     * Whether the decoded image is kept in the memory cache. With `false`
     * it's only kept on disk: a view doesn't leave it in memory once it stops
     * showing it, and `FastImage.preload` downloads it without decoding it.
     * Use it for large images that are shown once or rarely, like a
     * full-screen photo: a decoded photo can take tens of MB of memory. Images
     * shown again, like a list scrolled back, are decoded from disk again.
     *
     * @default true
     */
    memoryCache?: boolean
    /**
     * With several sources (`source` as an array), the image's width at this
     * uri, in pixels (times `scale`, if given).
     */
    width?: number
    /**
     * With several sources (`source` as an array), the image's height at this
     * uri, in pixels (times `scale`, if given).
     */
    height?: number
    /** With several sources, the scale `width` and `height` are multiplied by. */
    scale?: number
}

/** How the image fades in: see [`transition`](#transition). */
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
     * Downloads, local files and bundled images (`require()`) fade in. On
     * Android, a `cache: 'web'` image from its HTTP cache, without a request,
     * counts as one from the memory cache (these images aren't kept there).
     * @default 'memory'
     */
    skipOnCacheHit?: 'none' | 'memory' | 'all' | null
}

/**
 * `onLoad`'s event: `nativeEvent` has the image's `width` and `height`, in
 * pixels, and `target`, the view's React tag (missing on Android with the
 * legacy architecture).
 */
export interface OnLoadEvent {
    nativeEvent: {
        width: number
        height: number
        // TODO: make it required once the New Architecture is the minimum.
        target?: number
    }
}

/**
 * `onError`'s event: `nativeEvent.error` says what went wrong, e.g. an HTTP
 * status code or an image that can't be decoded.
 */
export interface OnErrorEvent {
    nativeEvent: {
        error: string
    }
}

/**
 * A load's result, as `onLoadEnd` gets it: `ok` with the image's size, or not
 * `ok` with the error (as `onLoad` and `onError` get them).
 */
export type LoadResult =
    | { ok: true; width: number; height: number }
    | { ok: false; error: string }

/**
 * `configureCache`'s changes: a number (0 for no limit), or `null` to go back
 * to the app's native config (Info.plist, AndroidManifest.xml) or the
 * platform's default. Leave one out to keep it. Changes are saved, and used on
 * the next launches too. Android only has `maxDiskSize`.
 */
export interface CacheLimits {
    /**
     * The most bytes of images kept on disk. When it's over, the least
     * recently used are removed (on iOS, until it's half this size). Default:
     * no limit on iOS, 250 MB on Android.
     */
    maxDiskSize?: number | null
    /**
     * iOS: the seconds an image is kept on disk after it was last used, or 0
     * to keep them until `maxDiskSize` removes them. Default: 1 week.
     */
    maxDiskAge?: number | null
    /**
     * iOS: the most bytes of decoded images kept in memory. Default: no limit
     * (they're removed when the system is low on memory).
     */
    maxMemorySize?: number | null
}

/**
 * `configureCache`'s result: the limits in effect (0 for no limit), and the
 * bytes the disk cache uses now. Android only has `maxDiskSize` and
 * `diskSize`, and neither if the app has its own `AppGlideModule` (or
 * expo-image, which has one).
 */
export interface CacheState {
    maxDiskSize?: number
    maxDiskAge?: number
    maxMemorySize?: number
    /** The bytes the disk cache uses now. */
    diskSize?: number
}

/**
 * `getCachePath`'s and `writeToCache`'s result: `ok` with the file's path, or
 * not `ok` with the error.
 */
export type CachePathResult =
    | { ok: true; path: string }
    | { ok: false; error: string }

/**
 * `clearMemoryCache`'s and `clearDiskCache`'s result: `ok` once the cache is
 * cleared, or not `ok` with the error.
 */
export type ClearCacheResult = { ok: true } | { ok: false; error: string }

/**
 * `onProgress`'s event: `nativeEvent` has the bytes `loaded` and the `total`,
 * and `progress`, `loaded / total` from 0 to 1.
 */
export interface OnProgressEvent {
    nativeEvent: {
        loaded: number
        total: number
        progress: number
    }
}

// Extends ViewStyle rather than FlexStyle/TransformsStyle/ShadowStyleIOS, which
// React Native 0.80+'s default types no longer export. Only the image's own keys
// are added; the rest (radii, opacity, colors) come from ViewStyle, so they're
// the app's React Native types (e.g. string radii, Animated values).
export interface ImageStyle extends ViewStyle {
    overlayColor?: ColorValue
    tintColor?: ColorValue
    objectFit?: ObjectFit
}

export interface FastImageProps extends AccessibilityProps, ViewProps {
    /**
     * Source for the remote image to load: a `Source`, a `require()`d image,
     * or an array of the same image at different sizes.
     *
     * When `source` changes, the image that's showing stays until the new one
     * has loaded. In views that get reused for other content, such as rows in
     * FlashList or recyclerlistview, set `recyclingKey` so a reused row
     * doesn't show the previous row's image.
     *
     * **Several sizes of an image.** `source` can also be an array of the
     * same image at different sizes, each with its `width` and `height` in
     * pixels (times `scale`, if it has one). The view loads the one whose size
     * is closest to its own, in pixels, so a small view downloads a small
     * image:
     *
     * ```jsx
     * <FastImage
     *     style={{ width: 120, height: 120 }}
     *     source={[
     *         { uri: 'https://example.com/photo-200.jpg', width: 200, height: 200 },
     *         { uri: 'https://example.com/photo-800.jpg', width: 800, height: 800 },
     *     ]}
     * />
     * ```
     *
     * - The view picks once it has been laid out. One that has no size (e.g.
     *   sized from `onLoad`) loads the largest.
     * - When the view's size changes so that another size fits better, it
     *   loads that one (with its load events), and keeps showing the current
     *   image until then, without a `transition`.
     * - Each size is cached separately. A `cacheKey` applies to its own entry:
     *   give each size its own key (or none), or the sizes would replace each
     *   other in the cache.
     * - `FastImage.preload`, `getCachePath` and `writeToCache` take one size:
     *   pass the one a view will show. An array fails with
     *   `{ ok: false, error }`.
     * - An array of one is the same as that source.
     */
    source?: Source | Source[] | ImageRequireSource
    /**
     * An asset loaded with `require(...)`, shown while the first image loads,
     * and if an image fails to load. When `source` changes, the previous image
     * shows while the new one loads instead (see `source` and
     * `recyclingKey`).
     *
     * On Android, `defaultSource` doesn't show in debug builds: there the dev
     * server serves `require()`d images, and `defaultSource` is only loaded
     * from the app's resources.
     */
    defaultSource?: ImageRequireSource
    /**
     * How the image fits the view, as CSS's `object-fit` does.
     *
     * - `'cover'`: scales it uniformly (keeping its aspect ratio) so it covers
     *   the view (minus padding), cropping what doesn't fit.
     * - `'contain'`: scales it uniformly (keeping its aspect ratio) so all of
     *   it fits in the view (minus padding).
     * - `'fill'`: scales its width and height separately to fill the view,
     *   which can change its aspect ratio.
     * - `'none'`: shows it at its own size, centered, cropped if it's larger
     *   than the view.
     * - `'scale-down'`: shows it at its own size, centered, or scaled down
     *   uniformly to fit if it's larger than the view (the smaller of `'none'`
     *   and `'contain'`).
     *
     * An image's own size is its size in pixels, as points (dp on Android),
     * as CSS counts an image's pixels: a 300 × 200 image is 300 × 200 points.
     * A bundled image (`require()`) is its size in points.
     *
     * It can also be set in `style`; the prop wins. Either one overrides
     * `resizeMode`.
     *
     * @default 'cover'
     */
    objectFit?: ObjectFit
    /**
     * How the image fills the view.
     *
     * - `'contain'`: as `objectFit="contain"`.
     * - `'cover'`: as `objectFit="cover"`.
     * - `'stretch'`: as `objectFit="fill"`.
     * - `'center'`: as `objectFit="scale-down"`, except that on Android an
     *   image smaller than the view is shown at its size in pixels on the
     *   screen, so smaller than on iOS and the web.
     * - `'repeat'`: repeats it to cover the view, from its top-left corner, at
     *   the image's own size in pixels (a bundled image at its size in
     *   points), scaled down to fit if it's larger than the view. An animated
     *   image repeats its first frame, and `defaultSource` repeats too.
     *
     * @default 'cover'
     * @deprecated Use `objectFit` instead. `'repeat'` has no `objectFit` value
     * yet, so it can still be used.
     */
    resizeMode?: ResizeMode
    /**
     * If true, the image is shown with React Native's `Image` instead, styled
     * and laid out the same way. FastImage's own features, such as its
     * caching options, `priority` and `transition`, don't apply.
     */
    fallback?: boolean
    /**
     * For views that get reused for other content, such as rows in FlashList
     * or recyclerlistview. Set it to something that identifies the content,
     * e.g. the item's id. When it changes, the image is cleared right away (to
     * `defaultSource`, or blank) instead of staying until the new one has
     * loaded. Unlike changing `key`, this keeps the view, which is what list
     * recycling is for.
     *
     * @example
     * ```jsx
     * <FastImage recyclingKey={item.id} source={{ uri: item.imageUrl }} />
     * ```
     */
    recyclingKey?: string | null
    /**
     * How many times an animated image (GIF, animated WebP, APNG, or animated
     * AVIF) plays:
     *
     * - Not set: as many times as the file says (like a browser).
     * - `true`: forever.
     * - `false`: once.
     * - A number: that many times.
     *
     * Changing it restarts the animation.
     */
    loop?: boolean | number
    /**
     * How the image is filtered when it's drawn smaller or larger than its
     * size (like CSS's `image-rendering`):
     *
     * - `'auto'`: the platform's usual filtering.
     * - `'smooth'`: iOS only. Keeps a large image drawn much smaller than its
     *   size (e.g. a big photo as a thumbnail, or fine lines and text) from
     *   looking jagged or noisy. Such an image is already decoded at about the
     *   view's size by default (see `downsample`), so this is for images shown
     *   at less than half their size with `downsample={false}`, or a little
     *   smaller than their size. **It uses more memory:** the image is also
     *   kept at smaller sizes for drawing, about a third more than the decoded
     *   image. On Android it's the same as `'auto'` (images are always decoded
     *   at about the view's size there).
     * - `'pixelated'`: sharp pixels, without smoothing, e.g. for pixel art
     *   drawn larger than its size. On Android, animated images are still
     *   smoothed.
     *
     * @default 'auto'
     */
    imageRendering?: 'auto' | 'smooth' | 'pixelated'
    /**
     * Pauses an animated image (GIF, animated WebP, APNG, or animated AVIF) on
     * the frame it's showing; `false` plays it again from there
     * (on Android, an animated WebP or AVIF plays again from its first frame:
     * Android can't resume one). Each image animates on its own, so pausing
     * one doesn't pause others showing the same file.
     */
    paused?: boolean
    /**
     * Fades the image in when it loads. `true` uses the platform's usual
     * fade, a number is the duration in milliseconds, or pass a `Transition`.
     *
     * Downloads, local files (`file://`, `content://`) and bundled images
     * (`require()`) fade in. In lists that reuse views (e.g. FlashList), set
     * `recyclingKey`, so a reused view starts empty and its image fades in,
     * instead of showing the previous item's image until it loads.
     *
     * @default false
     * @example
     * ```jsx
     * <FastImage source={{ uri }} transition />
     * <FastImage source={{ uri }} transition={500} />
     * <FastImage source={{ uri }} transition={{ betweenImages: true, skipOnCacheHit: 'none' }} />
     * ```
     */
    transition?: boolean | number | Transition | null
    /**
     * Decodes a large image at about the size it's shown at, instead of at
     * full size, so it takes much less memory.
     *
     * - `true`: an image at least twice the size its view needs is decoded
     *   at about the view's size. If the view grows, the image is decoded
     *   again for its new size (from the disk cache).
     * - `false`: images are decoded at full size, e.g. for an image that's
     *   zoomed in on with a transform (a pinch-to-zoom viewer), which would
     *   otherwise show the smaller copy enlarged.
     *
     * It doesn't change `onLoad`'s width and height (the image's own size) or
     * the cached file. Needs SDWebImage 5.19.7 or later: before 5.19 images
     * are decoded at full size, and 5.19.0 to 5.19.6 show photos stored
     * sideways with an EXIF orientation (most phone photos) sideways. Photo
     * library images are always decoded this way, and on Android images are
     * always decoded at about the view's size (but Android 16 and later
     * decode animated WebP at full size, and scale it as they draw it).
     *
     * If you control the images, serve them at the size they're shown
     * (resized on your server or by an image CDN), which also saves
     * bandwidth.
     *
     * @platform ios
     * @default true
     */
    downsample?: boolean
    // The radius is converted from points to the bitmap's pixels on both
    // platforms, so it matches React Native's Image.
    /**
     * Blurs the image by this radius, in points (the same radius looks about
     * the same on iOS and Android). `0` is no blur.
     *
     * It's for still images, or a radius that changes now and then (e.g.
     * blurring a photo behind a sheet). Each change blurs the image again on
     * the CPU, so don't animate it.
     *
     * - Only the loaded image is blurred, not `defaultSource`.
     * - An animated image (GIF, animated WebP, APNG or AVIF) shows its first frame,
     *   blurred, and doesn't animate.
     * - With `tintColor`, the blurred image is tinted.
     * - The image is blurred at about the size it's shown at, off the main
     *   thread. The cached file stays the original image, so `getCachePath`
     *   and other views of it aren't affected.
     * - Changing it blurs the image that's showing again, without sending the
     *   load events again.
     *
     * To animate a blur, or to blur an animated image, use React Native's
     * `filter` style instead, which the GPU draws:
     * `style={{ filter: [{ blur: 6 }] }}`. It needs the New Architecture.
     * React Native's docs list `blur` for Android 12+ only; on iOS it's behind
     * an experimental React Native feature flag (`enableSwiftUIBasedFilters`,
     * SwiftUI-based filters).
     *
     * @default 0
     */
    blurRadius?: number

    /** Called when the image starts to load. */
    onLoadStart?(): void

    /**
     * Called while the image downloads, with the bytes `loaded` so far, the
     * `total`, and `progress` (`loaded / total`, from 0 to 1; the last event
     * has 1). Not called while the total is unknown (a response without a
     * `Content-Length`).
     *
     * @example
     * ```jsx
     * onProgress={e => console.log(e.nativeEvent.progress)}
     * ```
     */
    onProgress?(event: OnProgressEvent): void

    /**
     * Called on a successful image fetch. Called with the width and height of
     * the image itself, not of the view (on iOS, in points: an `@2x` asset
     * reports half its pixel size).
     *
     * @example
     * ```jsx
     * onLoad={e => console.log(e.nativeEvent.width, e.nativeEvent.height)}
     * ```
     */
    onLoad?(event: OnLoadEvent): void

    /**
     * Called on an image fetching error, with a message describing it (e.g.
     * the HTTP status code). On iOS and Android, a download that gets nothing
     * from the server for 15 seconds fails too (on Android, unless the app's
     * OkHttp client has timeouts of its own).
     *
     * @example
     * ```jsx
     * onError={e => console.log(e.nativeEvent.error)}
     * ```
     */
    onError?(event: OnErrorEvent): void

    /**
     * Called when the image finishes loading, whether it was successful or an
     * error, with the result: `{ ok: true, width, height }` (the image's size,
     * as `onLoad` gets it) or `{ ok: false, error }` (as `onError` gets it).
     * TypeScript makes you check `ok` before reading the size or the error.
     *
     * @example
     * ```jsx
     * <FastImage
     *     source={{ uri }}
     *     onLoadEnd={(result) => {
     *         if (result.ok) setAspectRatio(result.width / result.height)
     *         else setFailed(result.error)
     *     }}
     * />
     * ```
     */
    onLoadEnd?(result: LoadResult): void

    /**
     * The image's style: View's style props (`borderRadius` clips the image),
     * and `tintColor`, as with React Native's `Image` (the `tintColor` prop
     * wins).
     */
    style?: StyleProp<ImageStyle>

    /**
     * If supplied, changes the color of all the non-transparent pixels to the
     * given color.
     */
    tintColor?: ColorValue

    /**
     * Render children within the image.
     *
     * @deprecated In the next major version, `FastImage` won't render
     * children: use `FastImageBackground`.
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

// objectFit as the native resizeMode (`none` and `scale-down` are FastImage's
// own; iOS shows `scale-down` as `center`).
const NATIVE_RESIZE_MODE = {
    fill: 'stretch',
    contain: 'contain',
    cover: 'cover',
    none: 'none',
    'scale-down': 'scale-down',
    center: 'center',
    repeat: 'repeat',
} as const

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
    objectFit,
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
    // On the wrapper too: a touch in the slop, outside the wrapper, only
    // reaches the wrapper (hit testing doesn't look for its children there).
    // Touchables pass their hitSlop to their child.
    hitSlop,
    // The responder and touch handlers (a Touchable's, or the app's): on the
    // wrapper, so they get the touches its hitSlop takes. A touch on the image
    // reaches them too, as an event from a child.
    onStartShouldSetResponder,
    onStartShouldSetResponderCapture,
    onMoveShouldSetResponder,
    onMoveShouldSetResponderCapture,
    onResponderGrant,
    onResponderReject,
    onResponderStart,
    onResponderMove,
    onResponderEnd,
    onResponderRelease,
    onResponderTerminationRequest,
    onResponderTerminate,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    onTouchEndCapture,
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
    const wrapperProps = {
        onLayout,
        onClick,
        pointerEvents,
        hitSlop,
        onStartShouldSetResponder,
        onStartShouldSetResponderCapture,
        onMoveShouldSetResponder,
        onMoveShouldSetResponderCapture,
        onResponderGrant,
        onResponderReject,
        onResponderStart,
        onResponderMove,
        onResponderEnd,
        onResponderRelease,
        onResponderTerminationRequest,
        onResponderTerminate,
        onTouchStart,
        onTouchMove,
        onTouchEnd,
        onTouchCancel,
        onTouchEndCapture,
    }
    const imageProps = {
        ...props,
        pointerEvents:
            pointerEvents === 'box-none' ? ('none' as const) : undefined,
    }
    // tintColor can also be set in style, as with React Native's Image. The
    // prop wins.
    const resolvedTintColor =
        tintColor != null ? tintColor : fromStyle(style, 'tintColor')
    const mode =
        NATIVE_RESIZE_MODE[resolveObjectFit(objectFit, style, resizeMode)]
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
                    // React Native's Image has no `none` before 0.77, and
                    // there it's top-left: the nearest is center, as for
                    // scale-down.
                    resizeMode={
                        mode === 'none' || mode === 'scale-down'
                            ? 'center'
                            : mode
                    }
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
                resizeMode={mode}
            />
            {children}
        </View>
    )
}

const FastImageMemo = memo(FastImageBase)

// What a ref to FastImage or FastImageBackground gets: the view the image
// fills (FastImage's wrapper, FastImageBackground's view). ElementRef, as
// React Native's types declare View as a class, and its Strict TypeScript API
// (opt-in from 0.80, the default from 0.87) as a function component that takes
// a ref.
type ViewRef = React.ElementRef<typeof View>

const FastImageComponent: React.ForwardRefExoticComponent<
    FastImageProps & React.RefAttributes<ViewRef>
> = forwardRef((props: FastImageProps, ref: React.Ref<ViewRef>) => (
    <FastImageMemo forwardedRef={ref} {...props} />
))

FastImageComponent.displayName = 'FastImage'

/** A preloaded source that loaded (and is now cached). */
export interface PreloadSuccess {
    /** The source's uri. */
    uri: string
    ok: true
    /** The image's width (as in `onLoad`). */
    width: number
    /** The image's height (as in `onLoad`). */
    height: number
}

/** A preloaded source that failed to load. */
export interface PreloadFailure {
    /** The source's uri (none for a source without one, e.g. `null`). */
    uri?: string
    ok: false
    /** What went wrong. */
    error: string
}

/**
 * `preload`'s result for a source. Check `ok` to tell which it is: e.g.
 * `if (result.ok)` narrows it to a `PreloadSuccess`, with its size. Reading
 * `width` or `error` without checking is a type error.
 */
export type PreloadResult = PreloadSuccess | PreloadFailure

// A result as native sends it (without the uri).
type NativePreloadResult =
    | Omit<PreloadSuccess, 'uri'>
    | Omit<PreloadFailure, 'uri'>

const noResult: NativePreloadResult = { ok: false, error: 'No result' }

export interface FastImageStaticProperties {
    /**
     * @deprecated Use the `objectFit` prop instead of `resizeMode` (`'repeat'`
     * has no `objectFit` value yet, so it can still be used).
     */
    resizeMode: typeof resizeMode
    priority: typeof priority
    cacheControl: typeof cacheControl
    preload: (sources: Source[]) => Promise<PreloadResult[]>
    /**
     * Removes every image from the memory cache. Resolves once it's done, or
     * not `ok` with the error if it couldn't (Android: Glide failed to
     * start). Never rejects.
     */
    clearMemoryCache: () => Promise<ClearCacheResult>
    /**
     * Removes every image from the disk cache, and the HTTP cache of
     * `cache: 'web'` images. Resolves once it's done, or not `ok` with the
     * error if it couldn't (Android: Glide failed to start). Never rejects.
     */
    clearDiskCache: () => Promise<ClearCacheResult>
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
     * resolves with the limits in effect and the disk cache's size; without
     * limits, it only resolves with them. iOS applies changes at once.
     * Android only has `maxDiskSize`, applied when Glide starts: at once if
     * it hasn't started yet in this launch, otherwise from the next launch.
     * FastImage starts it when its first view is created (before the view has
     * a source), and for `preload`, `getCachePath`, `writeToCache`,
     * `clearDiskCache` and `configureCache` itself, even without limits (e.g.
     * to read the disk cache's size).
     */
    configureCache: (limits?: CacheLimits) => Promise<CacheState>
}

const FastImage: React.ForwardRefExoticComponent<
    FastImageProps & React.RefAttributes<ViewRef>
> &
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

FastImage.clearMemoryCache = (): Promise<ClearCacheResult> =>
    Promise.resolve(NativeModules.FastImageView.clearMemoryCache())

FastImage.clearDiskCache = (): Promise<ClearCacheResult> =>
    Promise.resolve(NativeModules.FastImageView.clearDiskCache())

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

/**
 * An image with content on top of it, like React Native's `ImageBackground`: a
 * view that the image fills, with the children on top. Use it rather than
 * giving `FastImage` children, which it won't render in the next major version
 * (the image will be a single native view). The other props go to the image;
 * the ref is the view's.
 */
export const FastImageBackground: React.ForwardRefExoticComponent<
    FastImageBackgroundProps & React.RefAttributes<ViewRef>
> = forwardRef(
    (
        {
            style,
            imageStyle,
            imageRef,
            children,
            importantForAccessibility,
            ...props
        }: FastImageBackgroundProps,
        ref: React.Ref<ViewRef>,
    ) => (
        <View
            accessibilityIgnoresInvertColors
            importantForAccessibility={importantForAccessibility}
            style={style}
            ref={ref}
        >
            <FastImageComponent
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
