import * as React from 'react'
import { FlexStyle, LayoutChangeEvent, ShadowStyleIOS, StyleProp, TransformsStyle } from 'react-native'

declare namespace FastImage {

    export namespace priority {
        type low = 'low'
        type normal = 'normal'
        type high = 'high'
    }

    type priority =
        FastImage.priority.low |
        FastImage.priority.normal |
        FastImage.priority.high

    export namespace resizeMode {
        type contain = 'contain'
        type cover = 'cover'
        type stretch = 'stretch'
        type center = 'center'
    }

    export type resizeMode =
        FastImage.resizeMode.contain |
        FastImage.resizeMode.cover |
        FastImage.resizeMode.stretch |
        FastImage.resizeMode.center
}

export type FastImageSource = {
    uri?: string,
    headers?: object
    priority?: FastImage.priority
}

export interface ImageStyle extends FlexStyle, TransformsStyle, ShadowStyleIOS {
    backfaceVisibility?: 'visible' | 'hidden'
    backgroundColor?: string
    borderColor?: string
    overlayColor?: string
    tintColor?: string
    opacity?: number
}

export interface FastImageProperties {
    source: FastImageSource | number
    resizeMode?: FastImage.resizeMode

    onLoadStart?(): void

    onProgress?(event: any): void

    onLoad?(): void

    onError?(): void

    onLoadEnd?(): void

    /**
     * onLayout function
     *
     * Invoked on mount and layout changes with
     *
     * {nativeEvent: { layout: {x, y, width, height}}}.
     */
    onLayout?: (event: LayoutChangeEvent) => void;

    /**
     *
     * Style
     */
    style?: StyleProp<ImageStyle>;

    /**
     * A unique identifier for this element to be used in UI Automation testing scripts.
     */
    testID?: string;
}

interface FastImageStatic extends React.ComponentClass<FastImageProperties> {
    resizeMode: FastImage.resizeMode
    priority: FastImage.priority

    preload(sources: FastImageSource[]): void
}

declare var FastImage: FastImageStatic
type FastImage = FastImageStatic

export default FastImage
