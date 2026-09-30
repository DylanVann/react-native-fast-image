// FastImage on the web (react-native-web): React Native's Image, with
// FastImage's props and events where they map to it. Bundlers that resolve
// `.web` files, or the package's `browser` field, pick this file instead of
// index.tsx, which uses the native views.
//
// Works: source (uri, require(), or several sizes: see ImageSizes), defaultSource, resizeMode, tintColor,
// blurRadius, style, children, onLoadStart, onLoad, onError, onLoadEnd, and
// View props (testID, accessibility, onLayout, pointerEvents). The native-only
// props (cache, priority, headers, transition, downsample, loop, paused,
// imageRendering, recyclingKey, fallback) and onProgress are ignored.
import React, { forwardRef, memo, useEffect, useRef, useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { cacheControl, priority, resizeMode } from './constants'
import type {
    CachePathResult,
    CacheState,
    FastImageBackgroundProps,
    FastImageProps,
    FastImageStaticProperties,
    LoadResult,
    PreloadResult,
    Source,
} from './index'

export type * from './index'

// The native versions never reject: these resolve with an error.
const notSupported: CachePathResult = {
    ok: false,
    error: 'Not supported on the web',
}

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
    // onLoadEnd gets the result of the onLoad or onError just before it,
    // once onLoad has been sent (it waits for the image's size).
    const result = useRef<LoadResult | undefined>(undefined)
    const sent = useRef<Promise<void>>(Promise.resolve())
    const image = useRef<any>(null)
    // Several sizes (see ImageSizes): the view's width, once it's laid out.
    const sizes =
        Array.isArray(source) && source.length > 1 ? source : undefined
    const [width, setWidth] = useState<number>()
    const single = Array.isArray(source) ? source[0] : source
    // A require()d image is a number, which the web's Image resolves. Headers
    // and the other source options can't be used by the browser.
    const uri = typeof single === 'object' && single ? single.uri : undefined
    const webSource =
        typeof single === 'number' ? single : uri ? { uri } : undefined
    return (
        <View
            style={[styles.container, style]}
            onLayout={(event) => {
                if (sizes) setWidth(event.nativeEvent.layout.width)
                onLayout?.(event)
            }}
            pointerEvents={pointerEvents}
            ref={forwardedRef}
        >
            {sizes ? (
                <View {...props} style={styles.image}>
                    {width != null && (
                        <ImageSizes
                            sources={sizes}
                            width={width}
                            resizeMode={mode}
                            blurRadius={blurRadius}
                            onLoadStart={onLoadStart}
                            onLoad={onLoad}
                            onError={onError}
                            onLoadEnd={onLoadEnd}
                        />
                    )}
                </View>
            ) : (
                <Image
                    {...props}
                    style={styles.image}
                    source={webSource as any}
                    defaultSource={defaultSource}
                    resizeMode={mode}
                    {...({ tintColor, blurRadius, ref: image } as any)}
                    onLoadStart={onLoadStart}
                    onLoad={(event: any) => {
                        sent.current = loadedSize(
                            event?.nativeEvent?.target,
                            image.current,
                            uri,
                        ).then(({ width, height }) => {
                            result.current = { ok: true, width, height }
                            onLoad?.({ nativeEvent: { width, height } })
                        })
                    }}
                    onError={(event: any) => {
                        const error = String(
                            event?.nativeEvent?.error ??
                                'Failed to load the image',
                        )
                        result.current = { ok: false, error }
                        sent.current = Promise.resolve()
                        onError?.({ nativeEvent: { error } })
                    }}
                    onLoadEnd={() => {
                        sent.current.then(() => {
                            onLoadEnd?.(
                                result.current ?? {
                                    ok: false,
                                    error: 'Failed to load the image',
                                },
                            )
                            result.current = undefined
                        })
                    }}
                />
            )}
            {children}
        </View>
    )
}

// Several sizes of an image, which the web's Image doesn't take (it reads
// source.uri): an <img> with a srcset of them (each size's width, times its
// scale), from which the browser loads the one for the view's width in device
// pixels, usually the smallest at least as wide. `sizes` is the view's width,
// so it's rendered once the view has been laid out (as native waits for the
// view's size); a view with no width loads the largest, as on native.
// sizes="auto" would work before layout, but only for lazy images and not in
// every browser (the others take 100vw, the largest size). tintColor,
// defaultSource and resizeMode repeat aren't supported with several sizes.
function ImageSizes({
    sources,
    width,
    resizeMode: mode,
    blurRadius,
    onLoadStart,
    onLoad,
    onError,
    onLoadEnd,
}: Pick<
    FastImageProps,
    | 'resizeMode'
    | 'blurRadius'
    | 'onLoadStart'
    | 'onLoad'
    | 'onError'
    | 'onLoadEnd'
> & { sources: Source[]; width: number }) {
    const sized = sources
        .filter((source) => source?.uri && source.width)
        .map((source) => ({
            uri: source.uri as string,
            width: Math.round((source.width ?? 0) * (source.scale ?? 1)),
        }))
    const largest = sized.reduce<(typeof sized)[number] | undefined>(
        (best, source) => (!best || source.width > best.width ? source : best),
        undefined,
    )
    const src = largest?.uri ?? sources.find((source) => source?.uri)?.uri
    const srcSet =
        width > 0 && sized.length > 0
            ? sized.map((source) => `${source.uri} ${source.width}w`).join(', ')
            : undefined
    useEffect(() => {
        onLoadStart?.()
        // Once per image the browser is asked for.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src, srcSet])
    return (
        <img
            src={src}
            srcSet={srcSet}
            sizes={srcSet ? `${Math.round(width)}px` : undefined}
            alt=""
            draggable={false}
            style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                objectFit: OBJECT_FIT[mode ?? 'cover'],
                filter: blurRadius ? `blur(${blurRadius}px)` : undefined,
            }}
            onLoad={(event) => {
                // The library's types don't include the DOM's.
                const image = event.currentTarget as unknown as {
                    naturalWidth: number
                    naturalHeight: number
                    currentSrc: string
                }
                // With a srcset, the natural size is divided by the density
                // the browser picked (the candidate's width over `sizes`):
                // onLoad has the file's size in pixels, as on native.
                const picked = srcSet
                    ? sized.find(
                          (source) =>
                              new URL(source.uri, image.currentSrc).href ===
                              image.currentSrc,
                      )
                    : undefined
                const loadedWidth = picked?.width ?? image.naturalWidth
                const loadedHeight = picked
                    ? Math.round(
                          (image.naturalHeight * picked.width) /
                              image.naturalWidth,
                      )
                    : image.naturalHeight
                onLoad?.({
                    nativeEvent: { width: loadedWidth, height: loadedHeight },
                })
                onLoadEnd?.({
                    ok: true,
                    width: loadedWidth,
                    height: loadedHeight,
                })
            }}
            onError={() => {
                const error = 'Failed to load the image'
                onError?.({ nativeEvent: { error } })
                onLoadEnd?.({ ok: false, error })
            }}
        />
    )
}

// resizeMode as object-fit: center shows the image at its size, scaled down if
// it's larger than the view. repeat has no object-fit (it's shown as cover).
const OBJECT_FIT = {
    cover: 'cover',
    contain: 'contain',
    stretch: 'fill',
    center: 'scale-down',
    repeat: 'cover',
} as const

const FastImageMemo = memo(FastImageBase)

const FastImageComponent: React.ComponentType<FastImageProps> = forwardRef(
    (props: FastImageProps, ref: React.Ref<any>) => (
        <FastImageMemo forwardedRef={ref} {...props} />
    ),
)

FastImageComponent.displayName = 'FastImage'

// The size of an image that loaded. The load event's <img> has it, but
// browsers can clear the event's target before the web's Image sends onLoad
// (it waits for the image to decode): then it's read from the <img> the Image
// shows once it has loaded (after this update), or from the uri.
async function loadedSize(
    loaded: any,
    view: any,
    uri: string | undefined,
): Promise<{ width: number; height: number }> {
    if (loaded?.naturalWidth) {
        return { width: loaded.naturalWidth, height: loaded.naturalHeight }
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
    const shown = view?.querySelector?.('img')
    if (shown?.naturalWidth) {
        return { width: shown.naturalWidth, height: shown.naturalHeight }
    }
    const src = uri ?? shown?.src
    return src ? getSize(src) : { width: 0, height: 0 }
}

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

// The browser manages its own cache.
FastImage.clearMemoryCache = () => Promise.resolve()

FastImage.clearDiskCache = () => Promise.resolve()

FastImage.configureCache = (): Promise<CacheState> => Promise.resolve({})

FastImage.writeToCache = () => Promise.resolve(notSupported)

FastImage.getCachePath = () => Promise.resolve(notSupported)

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
    },
    image: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
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
