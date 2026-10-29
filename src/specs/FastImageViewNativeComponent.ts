// The native image view, from React Native's Codegen (the New Architecture's
// component). FastImage (index.tsx) renders it as its only view, and turns
// its props into these.
import type * as React from 'react'
import type {
    CodegenTypes,
    ColorValue,
    HostComponent,
    ViewProps,
} from 'react-native'
// React Native's Babel plugin replaces the calls below with the component's
// view config and commands, so the imports aren't used when the app runs.
import { codegenNativeCommands, codegenNativeComponent } from 'react-native'

type LoadStartEvent = Readonly<{}>

// progress is loaded / total, from 0 to 1 (the views don't send an unknown
// total).
type ProgressEvent = Readonly<{
    loaded: CodegenTypes.Double
    total: CodegenTypes.Double
    progress: CodegenTypes.Double
}>

// The image's own size.
type LoadEvent = Readonly<{
    width: CodegenTypes.Double
    height: CodegenTypes.Double
}>

type ErrorEvent = Readonly<{
    error: string
}>

// onLoad's or onError's event, with whether it loaded.
type LoadEndEvent = Readonly<{
    ok: boolean
    width?: CodegenTypes.Double
    height?: CodegenTypes.Double
    error?: string
}>

export interface NativeProps extends ViewProps {
    // The `source` prop: a source ({ uri, headers, priority, cache, ... },
    // with its thumbhash or blurDataUri), or several (sizes of one image) in
    // an array, picked from for the view's size. A change to the thumbhashes
    // and blurDataUris only doesn't load the image again.
    source?: CodegenTypes.UnsafeMixed
    // The `placeholder` prop: a thumbhash or blurDataUri ({ thumbhash } or
    // { blurDataUri }, for the sources without their own), a url to load
    // apart from the image, as a source ({ uri, headers, cacheKey, cache }),
    // or an image shown at once: a resolved asset source ({ uri, width,
    // height, scale }) or a data uri ({ uri } on iOS; the uri on Android, as
    // a string).
    placeholder?: CodegenTypes.UnsafeMixed
    // objectFit, resolved (fill, contain, cover, none or scale-down).
    objectFit?: CodegenTypes.WithDefault<string, 'cover'>
    // objectPosition, as CSS computes it: on each axis the image's left or top
    // edge is at (view - image) * fraction + offset, in points.
    objectPositionX?: CodegenTypes.WithDefault<CodegenTypes.Float, 0.5>
    objectPositionXOffset?: CodegenTypes.Float
    objectPositionY?: CodegenTypes.WithDefault<CodegenTypes.Float, 0.5>
    objectPositionYOffset?: CodegenTypes.Float
    tintColor?: ColorValue
    recyclingKey?: string
    loopCount?: CodegenTypes.WithDefault<CodegenTypes.Int32, -1>
    imageRendering?: string
    paused?: boolean
    transitionDuration?: CodegenTypes.Double
    transitionBetweenImages?: boolean
    transitionSkipOnCacheHit?: string
    downsample?: CodegenTypes.WithDefault<boolean, true>
    // standard, constrained or no-limit ('' when not set). iOS and tvOS 17+
    // (Android ignores it).
    dynamicRangeLimit?: string
    blurRadius?: CodegenTypes.Float
    // The sides the style leaves open, which then follow the loaded image
    // (see common/cpp's FastImageViewShadowNode), as bits: 1 the width, 2 the
    // height. Only then do the native views give the shadow node the image's
    // size, which lays the screen out again.
    autoSize?: CodegenTypes.Int32
    // A single source's own size in points (its width and height, or a
    // bundled image's), which the shadow node lays the open sides out from
    // instead of the loaded image's, from the start (0 without one).
    ownWidth?: CodegenTypes.Float
    ownHeight?: CodegenTypes.Float
    // The events JS has a handler for, as bits: 1 onFastImageLoadStart,
    // 2 onFastImageProgress, 4 onFastImageLoad, 8 onFastImageError, 16
    // onFastImageLoadEnd. The native views only send those (most images have
    // no handlers), and only track progress with 2. (Not `events`: iOS's
    // ViewProps already has a member by that name.)
    handledEvents?: CodegenTypes.Int32
    onFastImageLoadStart?: CodegenTypes.DirectEventHandler<LoadStartEvent>
    onFastImageProgress?: CodegenTypes.DirectEventHandler<ProgressEvent>
    onFastImageLoad?: CodegenTypes.DirectEventHandler<LoadEvent>
    onFastImageError?: CodegenTypes.DirectEventHandler<ErrorEvent>
    onFastImageLoadEnd?: CodegenTypes.DirectEventHandler<LoadEndEvent>
}

interface NativeCommands {
    // Loads the image again, as a new source would (with its events), keeping
    // the image showing until then. ElementRef, which React Native 0.83's
    // Codegen needs (later ones also take ComponentRef).
    reload: (viewRef: React.ElementRef<HostComponent<NativeProps>>) => void
}

export const Commands: NativeCommands = codegenNativeCommands<NativeCommands>({
    supportedCommands: ['reload'],
})

// interfaceOnly: the shadow node is the library's own (common/cpp), which
// measures the view from the loaded image's size.
export default codegenNativeComponent<NativeProps>('FastImageView', {
    interfaceOnly: true,
}) as HostComponent<NativeProps>
