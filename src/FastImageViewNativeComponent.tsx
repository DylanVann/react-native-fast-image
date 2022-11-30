import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';
import type { ViewProps, ColorValue } from 'react-native';
import type {
  Float,
  WithDefault,
  BubblingEventHandler,
} from 'react-native/Libraries/Types/CodegenTypes';

type Headers = Readonly<{}>
type Priority = WithDefault< 'low' | 'normal' | 'high', 'normal'>
type CacheControl = WithDefault< 'immutable' | 'web' | 'cacheOnly', 'web'>

type FastImageSource = Readonly<{
    uri?: string,
    headers?: Headers,
    priority?: Priority,
    cache?: CacheControl,
}>

type OnLoadEvent = Readonly<{
        width: Float,
        height: Float,
      }>

type OnProgressEvent = Readonly<{
        loaded: Float,
        total: Float,
      }>

interface NativeProps extends ViewProps {
  onFastImageError?: BubblingEventHandler<Readonly<{}>>,
  onFastImageLoad?: BubblingEventHandler<OnLoadEvent>,
  onFastImageLoadEnd?: BubblingEventHandler<Readonly<{}>>,
  onFastImageLoadStart?: BubblingEventHandler<Readonly<{}>>,
  onFastImageProgress?: BubblingEventHandler<OnProgressEvent>,
  source?: FastImageSource,
  defaultSource?: string,
  resizeMode?:  WithDefault<'contain' | 'cover' | 'stretch' | 'center', 'cover'>,
  tintColor?: ColorValue,
}

export default codegenNativeComponent<NativeProps>('FastImageView');