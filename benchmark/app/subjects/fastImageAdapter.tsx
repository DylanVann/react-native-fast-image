import React, { type ComponentType } from 'react'
import type { Adapter } from '../src/adapter'

// The FastImage subjects' adapter, for whichever FastImage package a subject
// imports (each build bundles only its own).
type FastImageLike = ComponentType<{
    source: { uri: string; priority?: 'high' }
    style?: unknown
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
            // No fit prop: cover is every version's default (8.x has no
            // objectFit, 10.x no resizeMode).
            defaultSource={placeholder}
            // Always set: FastImage fades images in on Android by default,
            // and the scenarios don't fade unless they ask to. FastImage 8
            // has no transition, and never fades.
            transition={fade}
            onLoad={onLoad}
            onError={(e) => onError(String(e.nativeEvent.error))}
        />
    ),
})
