import FastImage from 'react-native-fast-image-local'
import { fastImageAdapter } from './fastImageAdapter'

// FastImage from this checkout (../../..): see metro.config.js and
// react-native.config.js.
export default fastImageAdapter(
    'fast-image-local',
    FastImage as Parameters<typeof fastImageAdapter>[1],
    // Set by ../../scripts/run-android.ts: the checkout's version and commit.
    process.env.EXPO_PUBLIC_FAST_IMAGE_LOCAL ?? 'this checkout',
)
