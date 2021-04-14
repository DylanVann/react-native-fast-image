import React from 'react'
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
    UIManager,
    findNodeHandle,
    ViewProps,
    PixelRatio,
    ImageResolvedAssetSource,
    Platform,
} from 'react-native'

const FastImageViewNativeModule = NativeModules.FastImageView

export type ResizeMode = 'contain' | 'cover' | 'stretch' | 'center'

function findBorderRadius(style: unknown): number | undefined {
    let result: unknown
    if (Array.isArray(style)) {
        const obj = style.find((s) => {
            const borderRadius = findBorderRadius(s)
            return typeof borderRadius === "number" && borderRadius > 0
        })
        result = obj?.borderRadius
    } else {
        // @ts-expect-error typings for StyleProp<> are really hard
        result = style?.borderRadius
    }
    return typeof result === "number" ? result : undefined;
}

function areShallowEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
    if (left == null && right != null) return false;
    if (left != null && right == null) return false;
    if (left == null && right == null) return true;

    const keys1 = Object.keys(left);
    const keys2 = Object.keys(right);

    if (keys1.length !== keys2.length) {
      return false;
    }

    for (const key of keys1) {
      if (left[key] !== right[key]) {
        return false;
      }
    }

    return true;
  }

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
    tintColor?: string
    opacity?: number
}

export interface FastImageProps extends ViewProps {
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
}

const urlSchemeRegex = /^.+:\/\//.compile();

interface FastImageState {
    resolvedSource?: ImageResolvedAssetSource & { borderRadius?: number }
}

export default class FastImage extends React.PureComponent<FastImageProps, FastImageState> {
    static defaultProps = {
        resizeMode: 'cover'
    }

    static priority = priority
    static resizeMode = resizeMode
    static cacheControl = cacheControl
    static preload = (sources: Source[]) => FastImageViewNativeModule.preload(sources)
    static displayName = 'FastImage'

    private fastImageRef: React.RefObject<FastImage | undefined>

    constructor(props: FastImageProps) {
        super(props)
        this.fastImageRef = React.createRef()
        this.state = { }
    }

    refresh() {
        if (this.fastImageRef.current == null) {
            if (this.props.fallback) throw new Error('Refreshing only works with `fallback={false}`!')
            else throw new Error('FastImageView ref was not set!')
        }
        UIManager.dispatchViewManagerCommand(
            findNodeHandle(this.fastImageRef.current),
            UIManager.getViewManagerConfig('FastImageView').Commands
                .forceRefreshImage,
            []
        )
    }

    static getDerivedStateFromProps({ style, source, fallback }: FastImageProps, previousState: FastImageState): FastImageState | null {
        let resolvedSource: ImageResolvedAssetSource;
        if (fallback) {
            const cleanedSource = { ...(source as any) }
            delete cleanedSource.cache
            resolvedSource = Image.resolveAssetSource(cleanedSource)
        } else {
            const borderRadius = Math.round(PixelRatio.getPixelSizeForLayoutSize(findBorderRadius(style) ?? 0))
            resolvedSource = Image.resolveAssetSource(source instanceof Object && borderRadius > 0
                     ? { ...(source as any), borderRadius: borderRadius }
                     : source)
        }
        if (areShallowEqual(resolvedSource as any, previousState.resolvedSource as any)) {
            return null;
        } else {
            // Android does not support uris without a scheme prefix.
            if (Platform.OS === "android") {
                // check if the uri starts with a URL scheme (http://, file://, https://, ...)
                if (!urlSchemeRegex.test(resolvedSource.uri)) {
                    // uri does not start with any URL scheme/protocol. Assume file:// as a default protocol:
                    resolvedSource.uri = `file://${resolvedSource.uri}`
                }
            }
            return { resolvedSource }
        }
    }

    render() {
        const { fallback, source, style, onLoad, onProgress, onLoadEnd, onLoadStart, onError, children, tintColor, resizeMode, nativeID, ...props } = this.props

        if (fallback) {
            return (
                <View style={[styles.imageContainer, style]} {...props}>
                    <Image
                        // @ts-expect-error Types are incorrect.
                        nativeID={nativeID}
                        style={StyleSheet.absoluteFill}
                        source={this.state.resolvedSource as any}
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

        return (
            <View style={[styles.imageContainer, style]} {...props}>
                <FastImageView
                    nativeID={nativeID}
                    tintColor={tintColor}
                    style={StyleSheet.absoluteFill}
                    source={this.state.resolvedSource}
                    onFastImageLoadStart={onLoadStart}
                    onFastImageProgress={onProgress}
                    onFastImageLoad={onLoad}
                    onFastImageError={onError}
                    onFastImageLoadEnd={onLoadEnd}
                    resizeMode={resizeMode}
                    ref={this.fastImageRef}
                />
                {children}
            </View>
        )
    }
}

// export default React.forwardRef<Ref<FastImage>, FastImageProps>((props, ref) => <FastImage {...props} managedRef={ref} />)

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
