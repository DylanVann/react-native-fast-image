import FastImage from 'react-native-fast-image'
import { fastImageAdapter } from './fastImageAdapter'

export default fastImageAdapter(
    'fast-image',
    // FastImage 8's own ImageStyle has numeric-only border radii.
    FastImage as Parameters<typeof fastImageAdapter>[1],
    require('react-native-fast-image/package.json').version,
)
