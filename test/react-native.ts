// A small stand-in for react-native for the unit tests, registered by
// test/setup.ts. It renders the same host elements as React Native's Jest
// preset (View, Image, and the native view's name), so the snapshots describe
// what FastImage passes to the native side. React Native itself is Flow-typed
// source, which Bun can't parse, and only the pieces FastImage uses matter.
import React from 'react'

export const Platform: { OS: string; select: (spec: any) => any } = {
    OS: 'ios',
    select: (spec) =>
        spec[Platform.OS] !== undefined ? spec[Platform.OS] : spec.default,
}

export const NativeModules: Record<string, any> = {}

function hostComponent(name: string) {
    const Component = (props: any) =>
        React.createElement(name, props, props.children)
    Component.displayName = name
    return Component
}

export const View = hostComponent('View')

export const Image: any = hostComponent('Image')
// As in React Native: objects pass through, and a number is looked up in the
// asset registry, which is empty here.
Image.resolveAssetSource = (source: any) =>
    typeof source === 'object' ? source : null

export function requireNativeComponent(name: string) {
    return hostComponent(name)
}

function flatten(style: any): any {
    if (style === null || typeof style !== 'object') return undefined
    if (!Array.isArray(style)) return style
    const result: any = {}
    for (const entry of style) {
        const flat = flatten(entry)
        if (flat) Object.assign(result, flat)
    }
    return result
}

export const StyleSheet = {
    create: <T>(styles: T): T => styles,
    flatten,
    absoluteFill: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
    },
}
