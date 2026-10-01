import React from 'react'
import { Image, Platform } from 'react-native'
import type { Adapter } from '../src/adapter'

const adapter: Adapter = {
    id: 'image',
    version: `react-native ${Platform.constants.reactNativeVersion.major}.${Platform.constants.reactNativeVersion.minor}.${Platform.constants.reactNativeVersion.patch}`,
    loadEvents: true,
    Image: ({ uri, style, onLoad, onError }) => (
        <Image
            source={{ uri }}
            style={style}
            resizeMode="cover"
            onLoad={onLoad}
            onError={(e) => onError(String(e.nativeEvent.error))}
        />
    ),
}
export default adapter
