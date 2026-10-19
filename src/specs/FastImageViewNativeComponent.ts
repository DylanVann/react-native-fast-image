// The native image view, from React Native's Codegen (the New Architecture's
// component). FastImage (index.tsx) renders it as its only view, and turns
// its props into these.
import type {
    CodegenTypes,
    ColorValue,
    HostComponent,
    ViewProps,
} from 'react-native'
// React Native's Babel plugin replaces the call below with the component's
// view config, so the import isn't used when the app runs.
import { codegenNativeComponent } from 'react-native'

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
    // A source ({ uri, headers, priority, cache, ... }), as the native
    // sides read it.
    source?: CodegenTypes.UnsafeMixed
    // Several sources (sizes of one image), picked from for the view's size.
    sources?: CodegenTypes.UnsafeMixed
    // The `placeholder` prop: a resolved asset source ({ uri, width, height,
    // scale }) or a data uri ({ uri } on iOS; the uri on Android).
    placeholder?: CodegenTypes.UnsafeMixed
    // What shows in place of placeholder while a source loads: its ThumbHash,
    // or its blurDataUri (blurred natively), by the source's index ('' for
    // none; one for a single source). Apart from the sources, so a new one
    // for the same image doesn't load it again.
    sourcePlaceholders?: ReadonlyArray<string>
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
    // iOS and tvOS 17+ (Android ignores it).
    preferHighDynamicRange?: boolean
    blurRadius?: CodegenTypes.Float
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

export default codegenNativeComponent<NativeProps>(
    'FastImageView',
) as HostComponent<NativeProps>
