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
            style={style}
            resizeMode="cover"
        />
    ),
}
export default adapter
