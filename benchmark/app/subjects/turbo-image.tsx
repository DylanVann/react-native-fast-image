import React from 'react'
import TurboImage from 'react-native-turbo-image'
import type { Adapter } from '../src/adapter'

// fadeDuration: Turbo Image fades images in over 300 ms by default; the
// subjects are compared without fades unless the scenario asks for them
// (React Native's Image fades too on Android). Its placeholder isn't a local
// image (a blurhash, thumbhash or cached image), so it has none.
const adapter: Adapter = {
    id: 'turbo-image',
    version: require('react-native-turbo-image/package.json').version,
    loadEvents: true,
    Image: ({ uri, style, fade, onLoad, onError }) => (
        <TurboImage
            source={{ uri }}
            style={style}
            resizeMode="cover"
            fadeDuration={fade ? 300 : 0}
            onSuccess={onLoad}
            onFailure={(e) => onError(String(e.nativeEvent.error))}
        />
    ),
}
export default adapter
