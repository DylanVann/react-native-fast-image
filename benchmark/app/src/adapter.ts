import type { ComponentType } from 'react'
import type { ImageStyle } from 'react-native'

// What a scenario needs from an image library: a component that shows `uri`
// filling `style` (cover), and calls onLoad / onError when the library says
// it has loaded or failed (if it says so at all: see `loadEvents`).
export type ImageProps = {
    uri: string
    style: ImageStyle
    onLoad: () => void
    onError: (error: string) => void
}

export type Adapter = {
    // The subject's id (subjects.json) and the library's version.
    id: string
    version: string
    Image: ComponentType<ImageProps>
    // Whether Image calls onLoad/onError. Without them (e.g. Nitro Image's
    // view), a scenario waits a fixed time, and time to image comes from the
    // screen recording only.
    loadEvents: boolean
}
