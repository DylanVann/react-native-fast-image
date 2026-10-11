import React, { type ComponentType } from 'react'
import type { Adapter } from '../src/adapter'

// The FastImage subjects' adapter, for whichever FastImage package a subject
// imports (each build bundles only its own).
type FastImageLike = ComponentType<{
    source: { uri: string; priority?: 'high' }
    style?: unknown
    resizeMode?: 'cover'
    defaultSource?: number
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
    Image: ({ uri, style, fade, placeholder, priority, onLoad, onError }) => (
        <FastImage
            source={{ uri, priority }}
            style={style}
            resizeMode="cover"
            defaultSource={placeholder}
            // Always set: FastImage 10 fades images in on Android by default,
            // and the scenarios don't fade unless they ask to. FastImage 8
            // has no transition, and never fades.
            transition={fade}
            onLoad={onLoad}
            onError={(e) => onError(String(e.nativeEvent.error))}
        />
    ),
})
