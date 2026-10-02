// The native image view, from React Native's Codegen (the New Architecture's
// component). FastImage (index.tsx) renders it inside a View, and turns its
// props into these.
import type { ColorValue, HostComponent, ViewProps } from 'react-native'
// From 'react-native', not its deep path, which React Native 0.80+ warns about
// in development. React Native's Babel plugin replaces the call below with
// the component's view config, so the import isn't used when the app runs
// (also on 0.76 to 0.79, which only export it from the deep path).
import { codegenNativeComponent } from 'react-native'
import type {
    DirectEventHandler,
    Double,
    Float,
    Int32,
    UnsafeMixed,
    WithDefault,
} from 'react-native/Libraries/Types/CodegenTypes'

type LoadStartEvent = Readonly<{}>

type ProgressEvent = Readonly<{
    loaded: Double
    total: Double
}>

// The image's own size.
type LoadEvent = Readonly<{
    width: Double
    height: Double
}>

type ErrorEvent = Readonly<{
    error: string
}>

// onLoad's or onError's event, with whether it loaded.
type LoadEndEvent = Readonly<{
    ok: boolean
    width?: Double
    height?: Double
    error?: string
}>

export interface NativeProps extends ViewProps {
    // A source ({ uri, headers, priority, cache, ... }), as the native
    // sides read it.
    source?: UnsafeMixed
    // Several sources (sizes of one image), picked from for the view's size.
    sources?: UnsafeMixed
    // A resolved asset source ({ uri, width, height, scale }).
    defaultSource?: UnsafeMixed
    resizeMode?: WithDefault<string, 'cover'>
    tintColor?: ColorValue
    recyclingKey?: string
    loopCount?: WithDefault<Int32, -1>
    imageRendering?: string
    paused?: boolean
    transitionDuration?: Double
    transitionBetweenImages?: boolean
    transitionSkipOnCacheHit?: string
    downsample?: WithDefault<boolean, true>
    blurRadius?: Float
    // Whether to send onFastImageProgress (there's an onProgress handler):
    // most images have none, and progress is tracked only for those that do.
    trackProgress?: boolean
    onFastImageLoadStart?: DirectEventHandler<LoadStartEvent>
    onFastImageProgress?: DirectEventHandler<ProgressEvent>
    onFastImageLoad?: DirectEventHandler<LoadEvent>
    onFastImageError?: DirectEventHandler<ErrorEvent>
    onFastImageLoadEnd?: DirectEventHandler<LoadEndEvent>
}

export default codegenNativeComponent<NativeProps>(
    'FastImageView',
) as HostComponent<NativeProps>
