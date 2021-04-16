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
    ViewStyle,
    TextStyle,
    RegisteredStyle,
} from 'react-native'

const FastImageViewNativeModule = NativeModules.FastImageView

export type ResizeMode = 'contain' | 'cover' | 'stretch' | 'center'

function isRegisteredStyle<T>(
    style: T | unknown
): style is RegisteredStyle<T> {
    if (typeof style === "object" && style != null)
        return "__registeredStyleBrand" in style;
    else return false;
};


function findStyle<
    TStyle extends ViewStyle | TextStyle | ImageStyle,
    TResult extends TStyle extends (infer U)[] ? U : TStyle,
    TName extends keyof TResult
>(
    style: StyleProp<TStyle>,
    stylePropertyKey: TName
): TResult[TName] | undefined {
    if (Array.isArray(style)) {
        // we're doing a reverse loop because values in elements at the end override values at the beginning
        for (let i = style.length - 1; i >= 0; i--) {
            const result = findStyle<TStyle, TResult, TName>(
                // @ts-expect-error it's complaining because it is `readonly`, but we're not modifying it anyways. StyleProp<T>::RecursiveArray<T> needs to be readonly.
                style[i],
                stylePropertyKey
            );
            if (result != null) return result;
        }
        // style not found in array
        return undefined;
    } else {
        if (style == null) {
            // null, undefined
            return undefined;
        } else if (typeof style === "boolean") {
            // false
            return undefined;
        } else if (isRegisteredStyle(style)) {
            // RegisteredStyle<T> (number) - does not actually exist.
            // @ts-expect-error typings for StyleProp<> are really hard
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return style.__registeredStyleBrand[stylePropertyKey];
        } else if (typeof style === "object") {
            // { ... }
            // @ts-expect-error typings for StyleProp<> are really hard
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return style[stylePropertyKey];
        } else {
            // style is unknown type
            return undefined;
        }
    }
};

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
        this.state = {}
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
            const foundBorderRadius = findStyle(style, 'borderRadius');
            const borderRadius = foundBorderRadius != null ? PixelRatio.roundToNearestPixel(foundBorderRadius) : 0;
            resolvedSource = Image.resolveAssetSource(source instanceof Object && borderRadius > 0
                ? { ...(source as any), borderRadius: borderRadius }
                : source)
        }
        if (areShallowEqual(resolvedSource as any, previousState.resolvedSource as any)) {
            return null;
        } else {
            return { resolvedSource }
        }
    }

    render() {
        const { fallback, source, style, onLoad, onProgress, onLoadEnd, onLoadStart, onError, children, tintColor, resizeMode, nativeID, ...props } = this.props

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
