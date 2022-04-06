import React, {
    forwardRef,
    memo,
    useImperativeHandle,
    Ref,
    useRef,
} from 'react'
import {
    View,
    Image,
    NativeModules,
    requireNativeComponent,
    StyleSheet,
    LayoutChangeEvent,
    StyleProp,
    AccessibilityProps,
    ViewProps,
    NativeMethods,
    Platform,
    ImageRequireSource,
    findNodeHandle,
    ImageStyle,
    ColorValue,
    MeasureInWindowOnSuccessCallback,
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
}

export interface OnLoadEvent {
    nativeEvent: {
        width: number
        height: number
        isAnimated: boolean
    }
}

export interface OnProgressEvent {
    nativeEvent: {
        loaded: number
        total: number
    }
}

export interface FastImageProps extends AccessibilityProps, ViewProps {
    source: Source | ImageRequireSource
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

interface FastImageRefProps {
    ref?: Ref<typeof FastImage>
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
    const innerRef = useRef<typeof FastImageView>(null)
    const outerRef = useRef<View>(null)

    useImperativeHandle(forwardedRef, () => ({
        measureInWindow: (cb: MeasureInWindowOnSuccessCallback) =>
            outerRef.current?.measureInWindow(cb),
        playAnimation: () => {
            FastImageViewNativeModule.playAnimation(
                findNodeHandle(innerRef?.current),
            )
        },
    }))

    if ((tintColor === null || tintColor === undefined) && style) {
        tintColor = StyleSheet.flatten(style).tintColor
    }

    if (fallback || Platform.OS === 'web') {
        return (
            <View style={[styles.imageContainer, style]} ref={outerRef}>
                <Image
                    {...props}
                    style={[StyleSheet.absoluteFill, { tintColor }]}
                    source={source as any}
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
    const resolvedDefaultSource =
        Platform.OS === 'android'
            ? defaultSource &&
              (Image.resolveAssetSource(defaultSource)?.uri ?? null)
            : defaultSource

    return (
        <View style={[styles.imageContainer, style]} ref={outerRef}>
            <FastImageView
                {...props}
                ref={innerRef}
                tintColor={tintColor}
                style={StyleSheet.absoluteFill}
                defaultSource={resolvedDefaultSource}
                source={resolvedSource}
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
    (props: FastImageProps, ref: React.Ref<any>) => {
        return <FastImageMemo forwardedRef={ref} {...props} />
    },
)

FastImageComponent.displayName = 'FastImage'

export interface FastImageStaticProperties {
    resizeMode: typeof resizeMode
    priority: typeof priority
    cacheControl: typeof cacheControl
    preload: (sources: Source[]) => void
    clearMemoryCache: () => Promise<void>
    clearDiskCache: () => Promise<void>
    playAnimation(): void
}

const FastImage: React.ComponentType<FastImageProps & FastImageRefProps> &
    NativeMethods &
    FastImageStaticProperties = FastImageComponent as any

FastImage.resizeMode = resizeMode

FastImage.cacheControl = cacheControl

FastImage.priority = priority

FastImage.preload = (sources: Source[]) =>
    Platform.OS !== 'web' && FastImageViewNativeModule.preload(sources)

FastImage.clearMemoryCache = () =>
    Platform.OS !== 'web' && FastImageViewNativeModule.clearMemoryCache()

FastImage.clearDiskCache = () =>
    Platform.OS !== 'web' && FastImageViewNativeModule.clearDiskCache()

const styles = StyleSheet.create({
    imageContainer: {
        overflow: 'hidden',
    },
})

// Types of requireNativeComponent are not correct.
const FastImageView =
    Platform.OS === 'web'
        ? Image
        : (requireNativeComponent as any)('FastImageView', FastImage, {
              nativeOnly: {
                  onFastImageLoadStart: true,
                  onFastImageProgress: true,
                  onFastImageLoad: true,
                  onFastImageError: true,
                  onFastImageLoadEnd: true,
              },
          })

export default FastImage
