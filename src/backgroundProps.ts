// FastImageBackground's props split between its container and its image:
// FastImage's own props (source, objectFit, onLoad, ...) go to the image, and
// View's (accessibility, focus, testID, layout, touch) to the container, which
// its ref is. Which of them should be the accessibility element depends on
// what the background is for, so `imageProps` puts any prop on the image.
import type { ViewProps } from 'react-native'
import type { FastImageBackgroundProps, FastImageProps } from './index'

type ImageKey = Exclude<
    keyof FastImageProps,
    keyof ViewProps | 'style' | 'children'
>

// Every prop FastImage has that View doesn't: a type error if one is missing
// or isn't FastImage's.
const IMAGE_KEYS: Record<ImageKey, true> = {
    source: true,
    placeholder: true,
    defaultSource: true,
    objectFit: true,
    objectPosition: true,
    recyclingKey: true,
    loop: true,
    imageRendering: true,
    loading: true,
    sizes: true,
    paused: true,
    transition: true,
    downsample: true,
    dynamicRangeLimit: true,
    blurRadius: true,
    tintColor: true,
    alt: true,
    maxBufferSize: true,
    onLoadStart: true,
    onProgress: true,
    onLoad: true,
    onError: true,
    onLoadEnd: true,
}

// And the props removed in 10.0 that FastImage still reads, to warn about
// (fallback) or ignore (resizeMode).
const IMAGE_KEY_SET: ReadonlySet<string> = new Set([
    ...Object.keys(IMAGE_KEYS),
    'fallback',
    'resizeMode',
])

type SplitProps = Omit<
    FastImageBackgroundProps,
    'style' | 'imageStyle' | 'imageRef' | 'imageProps' | 'children'
>

// The container's props, which the caller can still change (they're a copy).
type ContainerProps = { -readonly [K in keyof ViewProps]: ViewProps[K] }

// The image's props (with `imageProps` over them) and the container's.
export function splitBackgroundProps(
    props: SplitProps,
    imageProps: FastImageBackgroundProps['imageProps'],
): [FastImageProps, ContainerProps] {
    const image: Record<string, unknown> = {}
    const container: Record<string, unknown> = {}
    for (const key in props) {
        const value = props[key as keyof SplitProps]
        if (IMAGE_KEY_SET.has(key)) image[key] = value
        else container[key] = value
    }
    // imageProps over them, but not its undefined values (props not set), so
    // a conditional `onLoad: debug ? log : undefined` keeps the given onLoad.
    if (imageProps) {
        for (const key in imageProps) {
            const value = imageProps[key as keyof typeof imageProps]
            if (value !== undefined) image[key] = value
        }
    }
    return [image, container]
}
