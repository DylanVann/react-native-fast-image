import React from 'react';
import { FlexStyle, LayoutChangeEvent, ShadowStyleIOS, StyleProp, TransformsStyle } from 'react-native';
declare type ResizeMode = 'contain' | 'cover' | 'stretch' | 'center';
declare const resizeMode: {
    readonly contain: "contain";
    readonly cover: "cover";
    readonly stretch: "stretch";
    readonly center: "center";
};
declare type Priority = 'low' | 'normal' | 'high';
declare const priority: {
    readonly low: "low";
    readonly normal: "normal";
    readonly high: "high";
};
declare type Cache = 'low' | 'normal' | 'high';
declare const cacheControl: {
    readonly immutable: "immutable";
    readonly web: "web";
    readonly cacheOnly: "cacheOnly";
};
export declare type Source = {
    uri?: string;
    headers?: {
        [key: string]: string;
    };
    priority?: Priority;
    cache?: Cache;
};
export interface OnLoadEvent {
    nativeEvent: {
        width: number;
        height: number;
    };
}
export interface OnProgressEvent {
    nativeEvent: {
        loaded: number;
        total: number;
    };
}
export interface ImageStyle extends FlexStyle, TransformsStyle, ShadowStyleIOS {
    backfaceVisibility?: 'visible' | 'hidden';
    borderBottomLeftRadius?: number;
    borderBottomRightRadius?: number;
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number;
    borderTopLeftRadius?: number;
    borderTopRightRadius?: number;
    overlayColor?: string;
    tintColor?: string;
    opacity?: number;
}
export interface FastImageProps {
    source: Source | number;
    resizeMode?: ResizeMode;
    fallback?: boolean;
    onLoadStart?(): void;
    onProgress?(event: OnProgressEvent): void;
    onLoad?(event: OnLoadEvent): void;
    onError?(): void;
    onLoadEnd?(): void;
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
     * TintColor
     *
     * If supplied, changes the color of all the non-transparent pixels to the given color.
     */
    tintColor?: number | string;
    /**
     * A unique identifier for this element to be used in UI Automation testing scripts.
     */
    testID?: string;
    /**
     * Render children within the image.
     */
    children?: React.ReactNode;
}
interface FastImageStaticProperties {
    resizeMode: typeof resizeMode;
    priority: typeof priority;
    cacheControl: typeof cacheControl;
    preload: (sources: Source[]) => void;
}
declare const FastImage: React.ComponentType<FastImageProps> & FastImageStaticProperties;
export default FastImage;
