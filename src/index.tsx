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
    AccessibilityProps,
    ViewProps, Platform,
} from 'react-native'

const FastImageViewNativeModule = NativeModules.FastImageView

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
    blurRadius?: number,
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
    tintColor?: string
    opacity?: number
}

export interface FastImageProps extends AccessibilityProps, ViewProps {
    source: Source | number
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

    tintColor?: number | string

    /**
     * A unique identifier for this element to be used in UI Automation testing scripts.
     */
    testID?: string

    /**
     * Render children within the image.
     */
    children?: React.ReactNode

    /**
     * The blur radius of the blur filter added to the image.
     */
    blurRadius?: number
}

function FastImageBase({
    source,
    tintColor,
    blurRadius,
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
                    style={StyleSheet.absoluteFill}
                    source={resolvedSource}
                    onLoadStart={onLoadStart}
                    onProgress={onProgress}
                    onLoad={onLoad as any}
                    onError={onError}
                    onLoadEnd={onLoadEnd}
                    resizeMode={resizeMode}
                    blurRadius={blurRadius}
                />
                {children}
            </View>
        )
    }

    const adjustedRadius = blurRadius ? blurRadius * (Platform.OS === 'ios' ? 3 : 0.75) : 0

    let resolvedSource = Image.resolveAssetSource(source as any)
    if (Platform.OS === 'android') {
        resolvedSource = Object.assign({}, resolvedSource, { blurRadius: adjustedRadius });
    }

    return (
        <View style={[styles.imageContainer, style]} ref={forwardedRef}>
            <FastImageView
                {...props}
                tintColor={tintColor}
                style={StyleSheet.absoluteFill}
                source={resolvedSource}
                onFastImageLoadStart={onLoadStart}
                onFastImageProgress={onProgress}
                onFastImageLoad={onLoad}
                onFastImageError={onError}
                onFastImageLoadEnd={onLoadEnd}
                resizeMode={resizeMode}
                blurRadius={adjustedRadius}
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
    blurRadius: number,
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
    FastImageViewNativeModule.preload(sources)

FastImage.clearMemoryCache = () => FastImageViewNativeModule.clearMemoryCache()

FastImage.clearDiskCache = () => FastImageViewNativeModule.clearDiskCache()

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
