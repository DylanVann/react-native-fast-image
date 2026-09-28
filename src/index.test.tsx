import { Image, StyleSheet, Platform, NativeModules, View } from 'react-native'
import React from 'react'
import { beforeAll, describe, expect, it, spyOn } from 'bun:test'
import renderer from 'react-test-renderer'
import FastImage, { FastImageBackground } from './index'

const style = StyleSheet.create({ image: { width: 44, height: 44 } })

// Bun has no custom snapshot serializers, so rendered trees are compared as
// the JSX text Jest prints.
const prettyFormat = require('pretty-format') as typeof import('pretty-format')
function jsx(tree: unknown) {
    return prettyFormat.format(tree, {
        plugins: [prettyFormat.plugins.ReactTestComponent],
        printBasicPrototype: false,
    })
}

describe('FastImage (iOS)', () => {
    beforeAll(() => {
        Platform.OS = 'ios'
        NativeModules.FastImageView = {
            preload: Function.prototype,
            clearMemoryCache: Function.prototype,
            clearDiskCache: Function.prototype,
        }
    })

    it('renders', () => {
        const tree = renderer
            .create(
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
            )
            .toJSON()

        expect(jsx(tree)).toMatchSnapshot()
    })

    it('maps loop to the native loopCount', () => {
        const cases: [boolean | number | undefined, number][] = [
            [undefined, -1],
            [true, 0],
            [false, 1],
            [3, 3],
            [2.7, 2],
            [0, 1],
            [Infinity, 0],
        ]
        for (const [loop, loopCount] of cases) {
            const [view] = renderer
                .create(
                    <FastImage
                        source={{ uri: 'https://example.com/a.gif' }}
                        loop={loop}
                        style={style.image}
                    />,
                )
                .root.findAll((node) => 'loopCount' in node.props)
            expect(view.props.loopCount).toBe(loopCount)
        }
    })

    it('passes a required (numeric) source to Image when using fallback', () => {
        const resolveAssetSource = spyOn(
            Image,
            'resolveAssetSource',
        ).mockImplementation((asset: any) => ({ uri: `asset-${asset}` }) as any)
        try {
            const image = renderer
                .create(<FastImage source={1} fallback style={style.image} />)
                .root.findByType(Image)

            expect(resolveAssetSource).toHaveBeenCalledWith(1)
            expect(image.props.source).toEqual({ uri: 'asset-1' })
            // Fills FastImage's box instead of taking the asset's size.
            expect(StyleSheet.flatten(image.props.style)).toMatchObject({
                width: '100%',
                height: '100%',
            })
        } finally {
            resolveAssetSource.mockRestore()
        }
    })

    it('uses tintColor from style, with the prop taking precedence', () => {
        const source = { uri: 'https://example.com/image.png' }
        const fromStyle: any = renderer
            .create(
                <FastImage source={source} style={{ tintColor: 'green' }} />,
            )
            .toJSON()
        const fromProp: any = renderer
            .create(
                <FastImage
                    source={source}
                    tintColor="red"
                    style={{ tintColor: 'green' }}
                />,
            )
            .toJSON()

        expect(fromStyle.children[0].props.tintColor).toBe('green')
        expect(fromProp.children[0].props.tintColor).toBe('red')
    })

    it('uses the last tintColor in a style array', () => {
        const tree: any = renderer
            .create(
                <FastImage
                    source={{ uri: 'https://example.com/image.png' }}
                    style={[
                        { tintColor: 'green' },
                        [false, { width: 10, tintColor: 'blue' }],
                        { height: 10 },
                    ]}
                />,
            )
            .toJSON()

        expect(tree.children[0].props.tintColor).toBe('blue')
    })

    it('reads tintColor from a registered (numeric) style', () => {
        const flatten = spyOn(StyleSheet, 'flatten').mockImplementation(
            (s: any) => (s === 7 ? ({ tintColor: 'purple' } as any) : s),
        )
        try {
            const tree: any = renderer
                .create(
                    <FastImage
                        source={{ uri: 'https://example.com/image.png' }}
                        style={7 as any}
                    />,
                )
                .toJSON()

            expect(tree.children[0].props.tintColor).toBe('purple')
        } finally {
            flatten.mockRestore()
        }
    })

    it('puts pointerEvents on the wrapper, and none on the image for box-none', () => {
        const tree: any = renderer
            .create(
                <FastImage
                    source={{ uri: 'https://example.com/image.png' }}
                    pointerEvents="box-none"
                    style={style.image}
                />,
            )
            .toJSON()

        expect(tree.props.pointerEvents).toBe('box-none')
        expect(tree.children[0].props.pointerEvents).toBe('none')
    })

    it('renders a normal Image when not passed a uri', () => {
        const tree = renderer
            .create(
                <FastImage
                    source={require('../ReactNativeFastImageExample/src/images/jellyfish.gif')}
                    style={style.image}
                />,
            )
            .toJSON()

        expect(jsx(tree)).toMatchSnapshot()
    })

    it('renders Image with fallback prop', () => {
        const tree = renderer
            .create(
                <FastImage
                    source={require('../ReactNativeFastImageExample/src/images/jellyfish.gif')}
                    style={style.image}
                    fallback
                />,
            )
            .toJSON()

        expect(jsx(tree)).toMatchSnapshot()
    })

    it('renders defaultSource', () => {
        const tree = renderer
            .create(
                <FastImage
                    defaultSource={require('../ReactNativeFastImageExample/src/images/jellyfish.gif')}
                    style={style.image}
                />,
            )
            .toJSON()

        expect(jsx(tree)).toMatchSnapshot()
    })

    it('resolves preload with a result per source', async () => {
        const preload = spyOn(
            NativeModules.FastImageView,
            'preload',
        ).mockImplementation(async () => [
            { ok: true, width: 10, height: 20 },
            { ok: false, error: 'Invalid source: no uri' },
        ])
        try {
            const results = await FastImage.preload([
                { uri: 'https://example.com/a.png' },
                null as any,
            ])
            // Null sources are sent as {} so the results line up.
            expect(preload).toHaveBeenCalledWith([
                { uri: 'https://example.com/a.png' },
                {},
            ])
            expect(results).toEqual([
                {
                    uri: 'https://example.com/a.png',
                    ok: true,
                    width: 10,
                    height: 20,
                },
                { uri: undefined, ok: false, error: 'Invalid source: no uri' },
            ])
            // ok narrows the result: a success has its size, a failure its
            // error.
            const [loaded, failed] = results
            if (loaded.ok) {
                const uri: string = loaded.uri
                expect(uri).toBe('https://example.com/a.png')
                const width: number = loaded.width
                expect(width).toBe(10)
            }
            if (!failed.ok) {
                const error: string = failed.error
                expect(error).toBe('Invalid source: no uri')
            }
            // Reading the size or the error without checking ok is an error.
            // @ts-expect-error
            expect(loaded.width).toBe(10)
            // @ts-expect-error
            expect(failed.error).toBe('Invalid source: no uri')
        } finally {
            preload.mockRestore()
        }
    })

    it('fails a preloaded source without a uri even if native loaded it', async () => {
        const preload = spyOn(
            NativeModules.FastImageView,
            'preload',
        ).mockImplementation(async () => [{ ok: true, width: 10, height: 20 }])
        try {
            expect(await FastImage.preload([{}])).toEqual([
                { uri: undefined, ok: false, error: 'Invalid source: no uri' },
            ])
        } finally {
            preload.mockRestore()
        }
    })

    it('runs static functions', () => {
        FastImage.preload([
            {
                uri: 'https://facebook.github.io/react/img/logo_og.png',
                headers: {
                    token: 'someToken',
                },
                priority: FastImage.priority.high,
            },
        ])
        FastImage.clearMemoryCache()
        FastImage.clearDiskCache()
    })
})

describe('FastImageBackground', () => {
    it('shows the image filling a view, with the children on top', () => {
        const imageRef = React.createRef<any>()
        const tree = renderer.create(
            <FastImageBackground
                source={{ uri: 'https://example.com/a.png' }}
                style={{ width: 100, height: 50 }}
                imageStyle={{ borderRadius: 8 }}
                imageRef={imageRef}
                resizeMode="contain"
            >
                <View testID="content" />
            </FastImageBackground>,
            // Host refs are null without a node.
            { createNodeMock: () => ({}) },
        )
        // A view with the image's wrapper, then the children.
        const json: any = tree.toJSON()
        expect(json.props.style).toEqual({ width: 100, height: 50 })
        expect(json.props.accessibilityIgnoresInvertColors).toBe(true)
        expect(json.children).toHaveLength(2)
        expect(json.children[1].props.testID).toBe('content')
        // The FastImage, with the other props, filling the view.
        const image = tree.root.findByType(FastImage as any)
        expect(image.props.resizeMode).toBe('contain')
        expect(StyleSheet.flatten(image.props.style)).toMatchObject({
            position: 'absolute',
            borderRadius: 8,
        })
        expect(imageRef.current).not.toBeNull()
    })
})

describe('onLoadEnd', () => {
    const source = { uri: 'https://example.com/a.png' }

    it("gets the load's result from the native event", () => {
        const results: any[] = []
        const [view] = renderer
            .create(
                <FastImage
                    source={source}
                    onLoadEnd={(result) => results.push(result)}
                />,
            )
            .root.findAll((node) => node.type === ('FastImageView' as any))
        view.props.onFastImageLoadEnd({
            nativeEvent: { ok: true, width: 10, height: 20, target: 1 },
        })
        view.props.onFastImageLoadEnd({
            nativeEvent: { ok: false, error: 'status code: 404' },
        })
        expect(results).toEqual([
            { ok: true, width: 10, height: 20 },
            { ok: false, error: 'status code: 404' },
        ])
    })

    it("gets the load's result with fallback, from onLoad or onError", () => {
        const results: any[] = []
        const loads: any[] = []
        const image = renderer
            .create(
                <FastImage
                    source={source}
                    fallback
                    onLoad={(event) => loads.push(event)}
                    onLoadEnd={(result) => results.push(result)}
                />,
            )
            .root.findByType(Image)
        const load = { nativeEvent: { source: { width: 10, height: 20 } } }
        image.props.onLoad(load)
        image.props.onLoadEnd()
        image.props.onError({ nativeEvent: { error: 'status code: 404' } })
        image.props.onLoadEnd()
        expect(loads).toEqual([load])
        expect(results).toEqual([
            { ok: true, width: 10, height: 20 },
            { ok: false, error: 'status code: 404' },
        ])
    })
})

describe('recyclingKey', () => {
    it('is passed to the native view', () => {
        const [view] = renderer
            .create(
                <FastImage
                    source={{ uri: 'https://example.com/a.png' }}
                    recyclingKey="row-1"
                />,
            )
            .root.findAll((node) => node.type === ('FastImageView' as any))
        expect(view.props.recyclingKey).toBe('row-1')
    })
})

describe('imageRendering', () => {
    it('is passed to the native view', () => {
        const [view] = renderer
            .create(
                <FastImage
                    source={{ uri: 'https://example.com/a.png' }}
                    imageRendering="pixelated"
                />,
            )
            .root.findAll((node) => node.type === ('FastImageView' as any))
        expect(view.props.imageRendering).toBe('pixelated')
    })
})

describe('paused', () => {
    it('is passed to the native view', () => {
        const [view] = renderer
            .create(
                <FastImage
                    source={{ uri: 'https://example.com/a.gif' }}
                    paused
                />,
            )
            .root.findAll((node) => node.type === ('FastImageView' as any))
        expect(view.props.paused).toBe(true)
    })
})

describe('source.cacheKey', () => {
    it('is passed to the native view with the source', () => {
        const source = {
            uri: 'https://example.com/a.jpg?token=1',
            cacheKey: 'a',
        }
        const [view] = renderer
            .create(<FastImage source={source} />)
            .root.findAll((node) => node.type === ('FastImageView' as any))
        expect(view.props.source).toEqual(source)
    })
})

describe('downsample', () => {
    it('is passed to the native view', () => {
        const [view] = renderer
            .create(
                <FastImage
                    source={{ uri: 'https://example.com/a.jpg' }}
                    downsample
                />,
            )
            .root.findAll((node) => node.type === ('FastImageView' as any))
        expect(view.props.downsample).toBe(true)
    })
})

describe('FastImage (Android)', () => {
    beforeAll(() => {
        Platform.OS = 'android'
    })

    it('renders a normal defaultSource', () => {
        const tree = renderer
            .create(
                <FastImage
                    defaultSource={require('../ReactNativeFastImageExample/src/images/jellyfish.gif')}
                    style={style.image}
                />,
            )
            .toJSON()

        expect(jsx(tree)).toMatchSnapshot()
    })

    it('renders a normal defaultSource when fails to load source', () => {
        const tree = renderer
            .create(
                <FastImage
                    defaultSource={require('../ReactNativeFastImageExample/src/images/jellyfish.gif')}
                    source={{
                        uri: 'https://www.google.com/image_does_not_exist.png',
                    }}
                    style={style.image}
                />,
            )
            .toJSON()

        expect(jsx(tree)).toMatchSnapshot()
    })

    it('renders a non-existing defaultSource', () => {
        const tree = renderer
            .create(<FastImage defaultSource={12345} style={style.image} />)
            .toJSON()

        expect(jsx(tree)).toMatchSnapshot()
    })
})
