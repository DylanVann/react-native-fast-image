// The native image view, from React Native's Codegen (the New Architecture's
// component). FastImage (index.tsx) renders it inside a View, and turns its
// props into these.
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

type ProgressEvent = Readonly<{
    loaded: CodegenTypes.Double
    total: CodegenTypes.Double
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
    // A resolved asset source ({ uri, width, height, scale }).
    defaultSource?: CodegenTypes.UnsafeMixed
    resizeMode?: CodegenTypes.WithDefault<string, 'cover'>
    tintColor?: ColorValue
    recyclingKey?: string
    loopCount?: CodegenTypes.WithDefault<CodegenTypes.Int32, -1>
    imageRendering?: string
    paused?: boolean
    transitionDuration?: CodegenTypes.Double
    transitionBetweenImages?: boolean
    transitionSkipOnCacheHit?: string
    downsample?: CodegenTypes.WithDefault<boolean, true>
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
