// The native view's props and events, for React Native's Codegen. Only types
// Codegen understands can be used here, and it reads this file as it is (the
// package ships it in `src/`).
//
// React Native's Babel plugin replaces the codegenNativeComponent() call with
// the view's config, so it never runs (and older React Native versions, which
// don't export it from 'react-native', are fine). The types are imported the
// long way, which every version's Codegen understands; type imports don't
// reach the app.
import {
    codegenNativeComponent,
    type ColorValue,
    type HostComponent,
    type ViewProps,
} from 'react-native'
import type {
    DirectEventHandler,
    Double,
    Int32,
    WithDefault,
} from 'react-native/Libraries/Types/CodegenTypes'

type NativeHeader = Readonly<{
    name: string
    value: string
}>

export type NativeSource = Readonly<{
    // Set for any source, so one without a uri fails (onError) instead of
    // being taken for no source (Codegen can't tell them apart on iOS).
    provided?: boolean
    uri?: string
    // A list rather than an object: Codegen needs every key up front.
    headers?: ReadonlyArray<NativeHeader>
    priority?: WithDefault<'low' | 'normal' | 'high', 'normal'>
    cache?: WithDefault<'immutable' | 'web' | 'cacheOnly', 'immutable'>
}>

// A require()d image, as Image.resolveAssetSource returns it.
export type NativeDefaultSource = Readonly<{
    uri?: string
    width?: Double
    height?: Double
    scale?: Double
    // Served by Metro (in development).
    packagerAsset?: boolean
}>

type OnLoadEvent = Readonly<{
    width: Double
    height: Double
}>

type OnErrorEvent = Readonly<{
    error: string
}>

type OnProgressEvent = Readonly<{
    loaded: Double
    total: Double
}>

export interface NativeProps extends ViewProps {
    source?: NativeSource
    defaultSource?: NativeDefaultSource
    resizeMode?: WithDefault<
        'contain' | 'cover' | 'stretch' | 'center',
        'cover'
    >
    tintColor?: ColorValue
    // -1 for the file's own loop count, 0 for forever, or a number of plays.
    loopCount?: WithDefault<Int32, -1>
    // iOS: trilinear filtering for images drawn smaller than their size.
    enableMinificationFilter?: WithDefault<boolean, true>
    // Whether onProgress has a handler, so native only tracks progress then.
    progressEnabled?: WithDefault<boolean, false>
    onFastImageLoadStart?: DirectEventHandler<Readonly<{}>>
    onFastImageProgress?: DirectEventHandler<OnProgressEvent>
    onFastImageLoad?: DirectEventHandler<OnLoadEvent>
    onFastImageError?: DirectEventHandler<OnErrorEvent>
    onFastImageLoadEnd?: DirectEventHandler<Readonly<{}>>
}

export default codegenNativeComponent<NativeProps>(
    'FastImageView',
) as HostComponent<NativeProps>
