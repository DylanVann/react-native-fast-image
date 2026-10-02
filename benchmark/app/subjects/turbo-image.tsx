import React from 'react'
import TurboImage from 'react-native-turbo-image'
import type { Adapter } from '../src/adapter'

// fadeDuration 0: Turbo Image fades images in over 300 ms by default; the
// subjects are compared without fades (React Native's Image fades too on
// Android, and is run without it; the others show images at once).
const adapter: Adapter = {
    id: 'turbo-image',
    version: require('react-native-turbo-image/package.json').version,
    loadEvents: true,
    Image: ({ uri, style, onLoad, onError }) => (
        <TurboImage
            source={{ uri }}
            style={style}
            resizeMode="cover"
            fadeDuration={0}
            onSuccess={onLoad}
            onFailure={(e) => onError(String(e.nativeEvent.error))}
        />
    ),
}
export default adapter
