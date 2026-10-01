import React from 'react'
import FastImage, { type FastImageProps } from 'react-native-fast-image'
import type { Adapter } from '../src/adapter'

const adapter: Adapter = {
    id: 'fast-image',
    version: require('react-native-fast-image/package.json').version,
    loadEvents: true,
    Image: ({ uri, style, onLoad, onError }) => (
        <FastImage
            source={{ uri }}
            // FastImage 8's own ImageStyle has numeric-only border radii.
            style={style as FastImageProps['style']}
            resizeMode="cover"
            onLoad={onLoad}
            onError={(e) => onError(e.nativeEvent.error)}
        />
    ),
}
export default adapter
