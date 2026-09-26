import React, { forwardRef, memo } from 'react'
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

// React Native's ColorValue, which its types only export since 0.63. Taken
// from ViewStyle so the types also work with older React Native types, where
// it's string.
type ColorValue = NonNullable<ViewStyle['backgroundColor']>

export type ResizeMode = 'contain' | 'cover' | 'stretch' | 'center'

const resizeMode = {
    contain: 'contain',
    cover: 'cover',
    stretch: 'stretch',
    center: 'center',
} as const

export type Priority = 'low' | 'normal' | 'high'

const priority = {
    low: 'low',
    normal: 'normal',
    high: 'high',
} as const

export type Cache = 'immutable' | 'web' | 'cacheOnly'

const cacheControl = {
    // Ignore headers, use uri as cache key, fetch only if not in cache.
    immutable: 'immutable',
    // Respect http headers, no aggressive caching.
    web: 'web',
    // Only load from cache.
    cacheOnly: 'cacheOnly',
} as const

export type Source = {
    uri?: string
    headers?: { [key: string]: string }
    priority?: Priority
    cache?: Cache
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

export interface OnProgressEvent {
    nativeEvent: {
        loaded: number
        total: number
    }
}

// Extends ViewStyle rather than FlexStyle/TransformsStyle/ShadowStyleIOS, which
// React Native 0.80+'s default types no longer export.
export interface ImageStyle extends ViewStyle {
    backfaceVisibility?: 'visible' | 'hidden'
    borderBottomLeftRadius?: number
    borderBottomRightRadius?: number
    backgroundColor?: ColorValue
    borderColor?: ColorValue
    borderWidth?: number
    borderRadius?: number
    borderTopLeftRadius?: number
    borderTopRightRadius?: number
    overlayColor?: ColorValue
    tintColor?: ColorValue
    opacity?: number
}

export interface FastImageProps extends AccessibilityProps, ViewProps {
    source?: Source | ImageRequireSource
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

    onLoadStart?(): void

    onProgress?(event: OnProgressEvent): void

    onLoad?(event: OnLoadEvent): void

    onError?(): void

    onLoadEnd?(): void

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
function tintColorFromStyle(style: unknown): ColorValue | undefined {
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
            typeof source === 'number' ? source : withoutCache(source)
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
                    onProgress={onProgress}
                    onLoad={onLoad as any}
                    onError={onError}
                    onLoadEnd={onLoadEnd}
                    resizeMode={resizeMode}
                />
                {children}
            </View>
        )
    }

    const resolvedSource = Image.resolveAssetSource(source as any)
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
                style={StyleSheet.absoluteFill}
                source={resolvedSource}
                defaultSource={resolvedDefaultSource}
                onFastImageLoadStart={onLoadStart}
                onFastImageProgress={onProgress}
                onFastImageLoad={onLoad}
                onFastImageError={onError}
                onFastImageLoadEnd={onLoadEnd}
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
}

const FastImage: React.ComponentType<FastImageProps> &
    FastImageStaticProperties = FastImageComponent as any

FastImage.resizeMode = resizeMode

FastImage.cacheControl = cacheControl

FastImage.priority = priority

FastImage.preload = (sources: Source[]) =>
    // Null sources are sent as {} so native results line up with the sources
    // (iOS drops null entries).
    Promise.resolve(
        NativeModules.FastImageView.preload(sources.map((s) => s || {})),
    ).then((results?: NativePreloadResult[]) =>
        sources.map((source, i): PreloadResult => {
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
        },
    },
)

export default FastImage
