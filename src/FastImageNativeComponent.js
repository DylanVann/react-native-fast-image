// @flow strict-local
import type {ViewProps} from 'react-native/Libraries/Components/View/ViewPropTypes';
import type {HostComponent} from 'react-native';
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';
import type {
  Float,
  Int32,
  WithDefault,
} from "react-native/Libraries/Types/CodegenTypes";

type Headers = $ReadOnly<{||}>
type Priority = WithDefault< 'low' | 'normal' | 'high', 'normal'>
type CacheControl = WithDefault< 'immutable' | 'web' | 'cacheOnly', 'web'>

type FastImageSource = $ReadOnly<{|
    uri?: string,
    headers?: Headers,
    priority?: Priority,
    cache?: CacheControl,
|}>

type OnLoadEvent = $ReadOnly<{|
        width: Float,
        height: Float,
      |}>

type OnProgressEvent = $ReadOnly<{|
        loaded: Float,
        total: Float,
      |}>

type FastImageProps = $ReadOnly<{|
    ...ViewProps,
    onError?: ?BubblingEventHandler<$ReadOnly<{||}>>,
    onLoad?: ?BubblingEventHandler<OnLoadEvent>,
    onLoadEnd?: ?BubblingEventHandler<$ReadOnly<{||}>>,
    onLoadStart?: ?BubblingEventHandler<$ReadOnly<{||}>>,
    onProgress?: ?BubblingEventHandler<OnProgressEvent>,
    source?: ?FastImageSource,
    defaultSource?: ?Int32,
    resizeMode?:  WithDefault<'contain' | 'cover' | 'stretch' | 'center', 'cover'>,
    fallback?: ?boolean,
    testID?: ?string,
|}>

export default (codegenNativeComponent<FastImageProps>(
   'FastImageView',
): HostComponent<FastImageProps>);
