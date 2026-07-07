import { StyleSheet, Platform, NativeModules, Text, Image } from 'react-native'
import React from 'react'
import renderer, { act } from 'react-test-renderer'
import FastImage from './index'
import FastImageViewNativeComponent from './FastImageViewNativeComponent'

// React 19's react-test-renderer requires synchronous work to be flushed via
// `act()` before `.toJSON()` reflects the committed tree.
const createTree = (element: React.ReactElement) => {
    let tree: renderer.ReactTestRenderer
    act(() => {
        tree = renderer.create(element)
    })
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return tree!
}

const style = StyleSheet.create({ image: { width: 44, height: 44 } })

describe('FastImage (iOS)', () => {
    const nativeModuleSpy = {
        preload: jest.fn(),
        clearMemoryCache: jest.fn(),
        clearDiskCache: jest.fn(),
    }

    beforeAll(() => {
        Platform.OS = 'ios'
        NativeModules.FastImageView = nativeModuleSpy
    })

    it('renders', () => {
        const tree = createTree(
            <FastImage
                source={{
                    uri: 'https://facebook.github.io/react/img/logo_og.png',
                    headers: {
                        token: 'someToken',
                    },
                    priority: FastImage.priority.high,
                }}
                style={style.image}
            />,
        ).toJSON()

        expect(tree).toMatchSnapshot()
    })

    it('renders a normal Image when not passed a uri', () => {
        const tree = createTree(
            <FastImage
                source={require('../ReactNativeFastImageExampleServer/pictures/jellyfish.gif')}
                style={style.image}
            />,
        ).toJSON()

        expect(tree).toMatchSnapshot()
    })

    it('renders Image with fallback prop', () => {
        const tree = createTree(
            <FastImage
                source={require('../ReactNativeFastImageExampleServer/pictures/jellyfish.gif')}
                style={style.image}
                fallback
            />,
        ).toJSON()

        expect(tree).toMatchSnapshot()
    })

    it('renders defaultSource', () => {
        const tree = createTree(
            <FastImage
                defaultSource={require('../ReactNativeFastImageExampleServer/pictures/jellyfish.gif')}
                style={style.image}
            />,
        ).toJSON()

        expect(tree).toMatchSnapshot()
    })

    it('stringifies a numeric defaultSource under Fabric', () => {
        const tree = createTree(
            <FastImage defaultSource={12345} style={style.image} />,
        )
        const nativeView = tree.root.findByType(FastImageViewNativeComponent)
        expect(nativeView.props.defaultSource).toBe('12345')
    })

    it('runs static functions', () => {
        const sources = [
            {
                uri: 'https://facebook.github.io/react/img/logo_og.png',
                headers: {
                    token: 'someToken',
                },
                priority: FastImage.priority.high,
            },
        ]
        FastImage.preload(sources)
        FastImage.clearMemoryCache()
        FastImage.clearDiskCache()

        expect(nativeModuleSpy.preload).toHaveBeenCalledTimes(1)
        expect(nativeModuleSpy.preload).toHaveBeenCalledWith(sources)
        expect(nativeModuleSpy.clearMemoryCache).toHaveBeenCalledTimes(1)
        expect(nativeModuleSpy.clearDiskCache).toHaveBeenCalledTimes(1)
    })

    it('renders with a custom tintColor', () => {
        const tree = createTree(
            <FastImage
                source={{
                    uri: 'https://facebook.github.io/react/img/logo_og.png',
                }}
                tintColor="red"
                style={style.image}
            />,
        )
        const nativeView = tree.root.findByType(FastImageViewNativeComponent)
        expect(nativeView.props.tintColor).toBe('red')
    })

    it('renders with a custom resizeMode', () => {
        const tree = createTree(
            <FastImage
                source={{
                    uri: 'https://facebook.github.io/react/img/logo_og.png',
                }}
                resizeMode={FastImage.resizeMode.contain}
                style={style.image}
            />,
        )
        const nativeView = tree.root.findByType(FastImageViewNativeComponent)
        expect(nativeView.props.resizeMode).toBe('contain')
    })

    it('renders children inside the wrapping View', () => {
        const tree = createTree(
            <FastImage
                source={{
                    uri: 'https://facebook.github.io/react/img/logo_og.png',
                }}
                style={style.image}
            >
                <Text>overlay</Text>
            </FastImage>,
        )
        expect(tree.root.findByType(Text).props.children).toBe('overlay')
    })

    it('forwards ref to the wrapping View', () => {
        const ref = React.createRef<any>()
        createTree(
            <FastImage
                ref={ref}
                source={{
                    uri: 'https://facebook.github.io/react/img/logo_og.png',
                }}
                style={style.image}
            />,
        )
        expect(ref.current).not.toBeNull()
    })

    it('strips the cache field from source when using the fallback Image', () => {
        const tree = createTree(
            <FastImage
                source={{
                    uri: 'https://facebook.github.io/react/img/logo_og.png',
                    cache: FastImage.cacheControl.immutable,
                }}
                style={style.image}
                fallback
            />,
        )
        const image = tree.root.findByType(Image)
        expect(image.props.source).not.toHaveProperty('cache')
        expect(image.props.source.uri).toBe(
            'https://facebook.github.io/react/img/logo_og.png',
        )
    })

    it.each([
        ['onLoadStart', 'onFastImageLoadStart', undefined],
        ['onProgress', 'onFastImageProgress', { loaded: 1, total: 2 }],
        ['onLoad', 'onFastImageLoad', { width: 10, height: 20 }],
        ['onError', 'onFastImageError', undefined],
        ['onLoadEnd', 'onFastImageLoadEnd', undefined],
    ])(
        '%s prop fires when native %s event is dispatched',
        (propName, nativeEventName, eventPayload) => {
            const handler = jest.fn()
            const tree = createTree(
                <FastImage
                    source={{
                        uri: 'https://facebook.github.io/react/img/logo_og.png',
                    }}
                    style={style.image}
                    {...{ [propName]: handler }}
                />,
            )
            const nativeView = tree.root.findByType(
                FastImageViewNativeComponent,
            )
            const nativeHandler = nativeView.props[nativeEventName]
            const fakeEvent = { nativeEvent: eventPayload }
            act(() => {
                nativeHandler(fakeEvent)
            })
            expect(handler).toHaveBeenCalledTimes(1)
            expect(handler).toHaveBeenCalledWith(fakeEvent)
        },
    )
})

describe('FastImage (TurboModule)', () => {
    const nativeSpy = {
        preload: jest.fn(),
        clearMemoryCache: jest.fn().mockResolvedValue(undefined),
        clearDiskCache: jest.fn().mockResolvedValue(undefined),
    }
    let TurboFastImage: typeof FastImage

    beforeAll(() => {
        Platform.OS = 'ios'
        // A function (not just a truthy value) is required: `TurboModuleRegistry`
        // calls it and falls back to `NativeModules` when it returns null, which
        // keeps unrelated real turbo modules (e.g. PlatformConstants) working.
        ;(global as any).__turboModuleProxy = jest.fn(() => null)
        jest.isolateModules(() => {
            jest.doMock('./NativeFastImageView', () => ({
                __esModule: true,
                default: nativeSpy,
            }))
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            TurboFastImage = require('./index').default
        })
    })

    afterAll(() => {
        delete (global as any).__turboModuleProxy
        jest.dontMock('./NativeFastImageView')
    })

    it('calls preload/clearMemoryCache/clearDiskCache through the TurboModule spec', () => {
        const sources = [
            { uri: 'https://facebook.github.io/react/img/logo_og.png' },
        ]
        TurboFastImage.preload(sources)
        TurboFastImage.clearMemoryCache()
        TurboFastImage.clearDiskCache()

        expect(nativeSpy.preload).toHaveBeenCalledTimes(1)
        expect(nativeSpy.preload).toHaveBeenCalledWith(sources)
        expect(nativeSpy.clearMemoryCache).toHaveBeenCalledTimes(1)
        expect(nativeSpy.clearDiskCache).toHaveBeenCalledTimes(1)
    })
})

describe('FastImage (old architecture / bridge)', () => {
    let OldFastImage: typeof FastImage

    beforeAll(() => {
        Platform.OS = 'ios'
        const realFabricUIManager = (global as any).nativeFabricUIManager
        delete (global as any).nativeFabricUIManager
        jest.isolateModules(() => {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            OldFastImage = require('./index').default
        })
        ;(global as any).nativeFabricUIManager = realFabricUIManager
    })

    it('keeps source.headers as an object instead of a Fabric {name,value}[] array', () => {
        const tree = createTree(
            <OldFastImage
                source={{
                    uri: 'https://facebook.github.io/react/img/logo_og.png',
                    headers: { token: 'someToken' },
                }}
                style={style.image}
            />,
        ).toJSON()

        expect(tree).toMatchSnapshot()
    })
})

describe('FastImage (Android)', () => {
    beforeAll(() => {
        Platform.OS = 'android'
    })

    it('renders a normal defaultSource', () => {
        const tree = createTree(
            <FastImage
                defaultSource={require('../ReactNativeFastImageExampleServer/pictures/jellyfish.gif')}
                style={style.image}
            />,
        ).toJSON()

        expect(tree).toMatchSnapshot()
    })

    it('renders a normal defaultSource when fails to load source', () => {
        const tree = createTree(
            <FastImage
                defaultSource={require('../ReactNativeFastImageExampleServer/pictures/jellyfish.gif')}
                source={{
                    uri: 'https://www.google.com/image_does_not_exist.png',
                }}
                style={style.image}
            />,
        ).toJSON()

        expect(tree).toMatchSnapshot()
    })

    it('renders a non-existing defaultSource', () => {
        const tree = createTree(
            <FastImage defaultSource={12345} style={style.image} />,
        ).toJSON()

        expect(tree).toMatchSnapshot()
    })
})
