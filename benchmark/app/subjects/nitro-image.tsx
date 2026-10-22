import React from 'react'
import { NitroImage } from 'react-native-nitro-image'
import 'react-native-nitro-web-image'
import type { Adapter } from '../src/adapter'

// <NitroImage> loads through an ImageLoader and sends no load or error events,
// and has no fade or placeholder. Its url source takes a priority in
// `options`.
const adapter: Adapter = {
    id: 'nitro-image',
    version: require('react-native-nitro-web-image/package.json').version,
    loadEvents: false,
    Image: ({ uri, style, priority }) => (
        <NitroImage
            image={{ url: uri, options: priority ? { priority } : undefined }}
            // @ts-expect-error Nitro 0.37's view types (Nitro Image 0.15's)
            // don't find React Native 0.88's ViewProps, so style is missing.
            style={style}
            resizeMode="cover"
        />
    ),
}
export default adapter
