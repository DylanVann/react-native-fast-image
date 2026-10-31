// FastImageAutoView: the native image view (the spec's props, events and
// commands) for an image whose style leaves a side to the image. Its shadow
// node measures the view from the loaded image's size (common/cpp's
// FastImageAutoViewShadowNode), with state the native views set it in.
// FastImageView's shadow node has neither, so images that don't follow
// theirs cost no more than any view. (index.tsx picks one.)
import {
    type HostComponent,
    NativeComponentRegistry,
    requireNativeComponent,
} from 'react-native'
import * as FastImageViewSpec from './specs/FastImageViewNativeComponent'
import type { NativeProps } from './specs/FastImageViewNativeComponent'

// React Native's Babel plugin gives the spec its view config, which this
// component shares under its own name (React Native's own components write
// theirs the same way). Without it (e.g. in tests), the native one.
type ViewConfig = ReturnType<Parameters<typeof NativeComponentRegistry.get>[1]>
const viewConfig = (
    FastImageViewSpec as { __INTERNAL_VIEW_CONFIG?: ViewConfig }
).__INTERNAL_VIEW_CONFIG

export default (viewConfig
    ? NativeComponentRegistry.get<NativeProps>('FastImageAutoView', () => ({
          ...viewConfig,
          uiViewClassName: 'FastImageAutoView',
      }))
    : requireNativeComponent<NativeProps>(
          'FastImageAutoView',
      )) as HostComponent<NativeProps>
