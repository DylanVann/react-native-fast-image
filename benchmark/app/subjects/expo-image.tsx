import { Image } from 'expo-image'
import React from 'react'
import type { Adapter } from '../src/adapter'

const adapter: Adapter = {
    id: 'expo-image',
    version: require('expo-image/package.json').version,
    loadEvents: true,
    Image: ({ uri, style, fade, placeholder, priority, onLoad, onError }) => (
        <Image
            source={{ uri }}
            style={style}
            contentFit="cover"
            placeholder={placeholder}
            placeholderContentFit="cover"
            transition={fade ? 300 : undefined}
            priority={priority}
            onLoad={onLoad}
            onError={(e) => onError(e.error)}
        />
    ),
}
export default adapter
