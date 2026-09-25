import React, { forwardRef, memo } from 'react'
import {
    Image,
    StyleSheet,
    View,
    type ColorValue,
    type ImageRequireSource,
    type StyleProp,
    type ViewProps,
    type ViewStyle,
} from 'react-native'
import FastImageView, {
    type NativeDefaultSource,
    type NativeSource,
} from './FastImageViewNativeComponent'
import NativeFastImageModule from './NativeFastImageModule'

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
        // The view's React tag.
        target: number
    }
}

export interface OnErrorEvent {
    nativeEvent: {
        // What went wrong, e.g. an HTTP status code or an image that can't be
        // decoded.
        error: string
    }
}

export interface OnProgressEvent {
    nativeEvent: {
        loaded: number
        total: number
    }
}

export interface ImageStyle extends ViewStyle {
    tintColor?: ColorValue
}

export interface FastImageProps extends ViewProps {
    source?: Source | ImageRequireSource
    defaultSource?: ImageRequireSource
    resizeMode?: ResizeMode
    /**
     * How many times an animated image (GIF, animated WebP) plays: the file's
     * own loop count by default, `true` to loop forever, `false` to play once,
     * or a number of times. Changing it restarts the animation.
     */
    loop?: boolean | number
    /**
     * iOS only: smooth large images drawn much smaller than their size
     * (trilinear filtering). On by default; turn it off to save the extra GPU
     * memory it takes.
     */
    enableMinificationFilter?: boolean

    onLoadStart?(): void

    onProgress?(event: OnProgressEvent): void

    onLoad?(event: OnLoadEvent): void

    onError?(event: OnErrorEvent): void

    onLoadEnd?(): void

    style?: StyleProp<ImageStyle>

    /**
     * If supplied, changes the color of all the non-transparent pixels to the
     * given color. Can also be set in `style`.
     */
    tintColor?: ColorValue
}

// The native loopCount: -1 for the file's own, 0 for forever, or a number of
// plays.
function loopCount(loop: boolean | number | undefined) {
    if (loop === undefined) return -1
    if (loop === true) return 0
    if (loop === false) return 1
    return Number.isFinite(loop) ? Math.max(1, Math.floor(loop)) : 0
}

// Headers as a list, which Codegen needs (object keys have to be known).
function nativeHeaders(headers: Source['headers']) {
    if (!headers) return undefined
    return Object.keys(headers).map((name) => ({
        name,
        value: String(headers[name]),
    }))
}

function nativeSource(
    source: FastImageProps['source'],
): NativeSource | undefined {
    if (source == null) return undefined
    if (typeof source === 'number') {
        const resolved = Image.resolveAssetSource(source)
        return resolved ? { provided: true, uri: resolved.uri } : undefined
    }
    return {
        provided: true,
        // Codegen can't read null as a string (the whole source would be lost).
        uri: source.uri == null ? '' : source.uri,
        headers: nativeHeaders(source.headers),
        priority: source.priority,
        cache: source.cache,
    }
}

function nativeDefaultSource(
    defaultSource: ImageRequireSource | undefined,
): NativeDefaultSource | undefined {
    if (defaultSource == null) return undefined
    const resolved = Image.resolveAssetSource(defaultSource) as
        | (ReturnType<typeof Image.resolveAssetSource> & {
              __packager_asset?: boolean
          })
        | null
    if (!resolved) return undefined
    return {
        uri: resolved.uri,
        width: resolved.width,
        height: resolved.height,
        scale: resolved.scale,
        packagerAsset: resolved.__packager_asset === true,
    }
}

// What a ref to FastImage (or FastImageBackground) gets: the native view, as
// with React Native's View.
export type FastImageRef = React.ComponentRef<typeof View>

const FastImageBase = forwardRef<FastImageRef, FastImageProps>(
    function FastImage(
        {
            source,
            defaultSource,
            resizeMode = 'cover',
            loop,
            onLoadStart,
            onProgress,
            onLoad,
            onError,
            onLoadEnd,
            style,
            ...props
        },
        ref,
    ) {
        if (props.children != null) {
            // As with React Native's Image (Android can't add views to it).
            throw new Error(
                'FastImage cannot contain children. Use FastImageBackground to render content on top of an image.',
            )
        }
        return (
            <FastImageView
                {...props}
                ref={ref as any}
                style={[styles.image, style]}
                source={nativeSource(source)}
                defaultSource={nativeDefaultSource(defaultSource)}
                resizeMode={resizeMode}
                loopCount={loopCount(loop)}
                progressEnabled={onProgress != null}
                onFastImageLoadStart={onLoadStart}
                onFastImageProgress={onProgress as any}
                onFastImageLoad={onLoad as any}
                onFastImageError={onError as any}
                onFastImageLoadEnd={onLoadEnd}
            />
        )
    },
)

const FastImageComponent: React.NamedExoticComponent<
    FastImageProps & React.RefAttributes<FastImageRef>
> = memo(FastImageBase)

FastImageComponent.displayName = 'FastImage'

export interface PreloadResult {
    // The source's uri.
    uri?: string
    // Whether the image loaded (and is now cached).
    ok: boolean
    // The image's size, when it loaded (as in onLoad).
    width?: number
    height?: number
    // What went wrong, when it didn't.
    error?: string
}

export interface FastImageStaticProperties {
    resizeMode: typeof resizeMode
    priority: typeof priority
    cacheControl: typeof cacheControl
    preload: (sources: Source[]) => Promise<PreloadResult[]>
    clearMemoryCache: () => Promise<void>
    clearDiskCache: () => Promise<void>
}

const FastImage = FastImageComponent as typeof FastImageComponent &
    FastImageStaticProperties

FastImage.resizeMode = resizeMode

FastImage.cacheControl = cacheControl

FastImage.priority = priority

FastImage.preload = (sources: Source[]) =>
    // Null sources are sent as {} so native results line up with the sources.
    NativeFastImageModule.preload(sources.map((s) => s || {})).then((results) =>
        sources.map((source, i) => ({
            uri: source ? source.uri : undefined,
            ...((results[i] as Omit<PreloadResult, 'uri'> | undefined) ?? {
                ok: false,
                error: 'No result',
            }),
        })),
    )

FastImage.clearMemoryCache = () => NativeFastImageModule.clearMemoryCache()

FastImage.clearDiskCache = () => NativeFastImageModule.clearDiskCache()

const styles = StyleSheet.create({
    // Clip the image to the view's rounded corners (iOS only clips with
    // overflow hidden), as React Native's Image does.
    image: {
        overflow: 'hidden',
    },
})

export interface FastImageBackgroundProps extends FastImageProps {
    children?: React.ReactNode
    // Style for the image; `style` is for the container.
    imageStyle?: StyleProp<ImageStyle>
}

/**
 * An image with content on top, like React Native's ImageBackground: a View
 * (with `style` and `children`) and a FastImage filling it (`imageStyle`).
 */
export const FastImageBackground: React.ForwardRefExoticComponent<
    FastImageBackgroundProps & React.RefAttributes<FastImageRef>
> = forwardRef<FastImageRef, FastImageBackgroundProps>(
    function FastImageBackground(
        { children, style, imageStyle, testID, ...props },
        ref,
    ) {
        return (
            <View ref={ref} style={style} testID={testID}>
                <FastImage
                    {...props}
                    style={[StyleSheet.absoluteFill, imageStyle]}
                />
                {children}
            </View>
        )
    },
)

export default FastImage
