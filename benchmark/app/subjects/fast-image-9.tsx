import FastImage from 'react-native-fast-image-9'
import { fastImageAdapter } from './fastImageAdapter'

export default fastImageAdapter(
    'fast-image-9',
    FastImage as Parameters<typeof fastImageAdapter>[1],
    require('react-native-fast-image-9/package.json').version,
)
