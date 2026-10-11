import React, { type ComponentType } from 'react'
import type { Adapter } from '../src/adapter'

// The FastImage subjects' adapter, for whichever FastImage package a subject
// imports (each build bundles only its own).
type FastImageLike = ComponentType<{
    source: { uri: string }
    style?: unknown
    resizeMode?: 'cover'
    transition?: boolean
    onLoad?: () => void
    onError?: (e: { nativeEvent: { error?: unknown } }) => void
}>

export const fastImageAdapter = (
    id: string,
    FastImage: FastImageLike,
    version: string,
): Adapter => ({
    id,
    version,
    loadEvents: true,
    Image: ({ uri, style, onLoad, onError }) => (
        <FastImage
            source={{ uri }}
            style={style}
            resizeMode="cover"
            // FastImage 10 fades images in on Android by default (300 ms), as
            // React Native's Image does (run with fadeDuration={0}): off, so
            // the times are its own work. Earlier versions don't fade by
            // default.
            transition={false}
            onLoad={onLoad}
            onError={(e) => onError(String(e.nativeEvent.error))}
        />
    ),
})
