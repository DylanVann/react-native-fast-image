import React, { type ComponentType } from 'react'
import type { Adapter } from '../src/adapter'

// The FastImage subjects' adapter, for whichever FastImage package a subject
// imports (each build bundles only its own).
type FastImageLike = ComponentType<{
    source: { uri: string }
    style?: unknown
    resizeMode?: 'cover'
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
            onLoad={onLoad}
            onError={(e) => onError(String(e.nativeEvent.error))}
        />
    ),
})
