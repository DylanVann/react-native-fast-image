import React from 'react'
import { Image, Platform } from 'react-native'
import type { Adapter } from '../src/adapter'

// fadeDuration: on Android, React Native's Image fades remote images in over
// 300 ms by default; the subjects are compared without fades unless the
// scenario asks for them (see Turbo Image's).
const adapter: Adapter = {
    id: 'image',
    version: `react-native ${Platform.constants.reactNativeVersion.major}.${Platform.constants.reactNativeVersion.minor}.${Platform.constants.reactNativeVersion.patch}`,
    loadEvents: true,
    Image: ({ uri, style, fade, placeholder, onLoad, onError }) => (
        <Image
            source={{ uri }}
            style={style}
            resizeMode="cover"
            defaultSource={placeholder}
            fadeDuration={fade ? 300 : 0}
            onLoad={onLoad}
            onError={(e) => onError(String(e.nativeEvent.error))}
        />
    ),
}
export default adapter
