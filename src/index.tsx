import React, { forwardRef, memo } from 'react'
import {
    View,
    Image,
    NativeModules,
    requireNativeComponent,
    StyleSheet,
    FlexStyle,
    LayoutChangeEvent,
    ShadowStyleIOS,
    StyleProp,
    TransformsStyle,
    ImageRequireSource,
    Platform,
    AccessibilityProps,
    ViewProps,
    ColorValue,
} from 'react-native'

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

type Cache = 'immutable' | 'web' | 'cacheOnly'

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
    }
}

export interface OnProgressEvent {
    nativeEvent: {
        loaded: number
        total: number
    }
}

export interface ImageStyle extends FlexStyle, TransformsStyle, ShadowStyleIOS {
    backfaceVisibility?: 'visible' | 'hidden'
    borderBottomLeftRadius?: number
    borderBottomRightRadius?: number
    backgroundColor?: string
    borderColor?: string
    borderWidth?: number
    borderRadius?: number
    borderTopLeftRadius?: number
    borderTopRightRadius?: number
    overlayColor?: string
    opacity?: number
}

export interface FastImageProps extends AccessibilityProps, ViewProps {
    source?: Source | ImageRequireSource
    defaultSource?: ImageRequireSource
    resizeMode?: ResizeMode
    fallback?: boolean

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
    // eslint-disable-next-line no-shadow
    resizeMode = 'cover',
    forwardedRef,
    ...props
}: FastImageProps & { forwardedRef: React.Ref<any> }) {
    if (fallback) {
        const cleanedSource = { ...(source as any) }
        delete cleanedSource.cache
        const resolvedSource = Image.resolveAssetSource(cleanedSource)

        return (
            <View style={[styles.imageContainer, style]} ref={forwardedRef}>
                <Image
                    {...props}
                    style={[StyleSheet.absoluteFill, { tintColor }]}
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
        <View style={[styles.imageContainer, style]} ref={forwardedRef}>
            <FastImageView
                {...props}
                tintColor={tintColor}
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

export interface FastImageStaticProperties {
    resizeMode: typeof resizeMode
    priority: typeof priority
    cacheControl: typeof cacheControl
    preload: (sources: Source[]) => void
    clearMemoryCache: () => Promise<void>
    clearDiskCache: () => Promise<void>
}

const FastImage: React.ComponentType<FastImageProps> &
    FastImageStaticProperties = FastImageComponent as any

FastImage.resizeMode = resizeMode

FastImage.cacheControl = cacheControl

FastImage.priority = priority

FastImage.preload = (sources: Source[]) =>
    NativeModules.FastImageView.preload(sources)

FastImage.clearMemoryCache = () =>
    NativeModules.FastImageView.clearMemoryCache()

FastImage.clearDiskCache = () => NativeModules.FastImageView.clearDiskCache()

const styles = StyleSheet.create({
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
