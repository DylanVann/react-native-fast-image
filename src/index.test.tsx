import {
    Image,
    StyleSheet,
    Platform,
    NativeModules,
    TurboModuleRegistry,
    View,
} from 'react-native'
import React from 'react'
import { beforeAll, describe, expect, it, mock, spyOn } from 'bun:test'
import renderer from '../test/render'
import FastImage, { FastImageBackground, FastImageProps } from './index'

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
        NativeModules.FastImageModule = {
            preload: Function.prototype,
            clearMemoryCache: () => Promise.resolve({ ok: true }),
            clearDiskCache: () =>
                Promise.resolve({ ok: false, error: 'Glide failed' }),
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

    it('puts hitSlop and the touch handlers on the wrapper', () => {
        const onStartShouldSetResponder = () => true
        const onResponderRelease = () => {}
        const onTouchStart = () => {}
        const tree: any = renderer
            .create(
                <FastImage
                    source={{ uri: 'https://example.com/image.png' }}
                    hitSlop={{ right: 40 }}
                    onStartShouldSetResponder={onStartShouldSetResponder}
                    onResponderRelease={onResponderRelease}
                    onTouchStart={onTouchStart}
                    accessibilityLabel="a cat"
                    style={style.image}
                />,
            )
            .toJSON()

        expect(tree.props.hitSlop).toEqual({ right: 40 })
        expect(tree.props.onStartShouldSetResponder).toBe(
            onStartShouldSetResponder,
        )
        expect(tree.props.onResponderRelease).toBe(onResponderRelease)
        expect(tree.props.onTouchStart).toBe(onTouchStart)
        const image = tree.children[0].props
        expect(image.hitSlop).toBeUndefined()
        expect(image.onStartShouldSetResponder).toBeUndefined()
        expect(image.onResponderRelease).toBeUndefined()
        expect(image.onTouchStart).toBeUndefined()
        // Other View props stay on the image.
        expect(image.accessibilityLabel).toBe('a cat')
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
            NativeModules.FastImageModule,
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
            NativeModules.FastImageModule,
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

    it("resolves the clear functions with native's result", async () => {
        await expect(FastImage.clearMemoryCache()).resolves.toEqual({
            ok: true,
        })
        await expect(FastImage.clearDiskCache()).resolves.toEqual({
            ok: false,
            error: 'Glide failed',
        })
    })
})

describe('ref', () => {
    it("is FastImage's view", () => {
        const ref = React.createRef<View>()
        const tree = renderer.create(
            <FastImage
                ref={ref}
                source={{ uri: 'https://example.com/a.png' }}
                style={style.image}
            />,
            // Host refs are null without a node.
            { createNodeMock: (element) => ({ type: element.type }) },
        )
        expect(tree.toJSON()).not.toBeNull()
        expect(ref.current).toEqual({ type: 'View' } as any)
        // Typed as the view, with its methods (a type check: the view here
        // is a stand-in).
        const measure = (view: React.ComponentRef<typeof FastImage>) =>
            view.measure(() => {})
        expect(typeof measure).toBe('function')
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
})

describe('onProgress', () => {
    const source = { uri: 'https://example.com/a.png' }

    it('passes the native event on, with the progress the views worked out', () => {
        const events: any[] = []
        const [view] = renderer
            .create(
                <FastImage
                    source={source}
                    onProgress={(e) => events.push(e)}
                />,
            )
            .root.findAll((node) => node.type === ('FastImageView' as any))
        const event = {
            nativeEvent: { loaded: 50, total: 200, progress: 0.25 },
        }
        view.props.onFastImageProgress(event)
        expect(events).toEqual([event])
    })
})

describe('handledEvents', () => {
    const source = { uri: 'https://example.com/a.png' }
    const handledEvents = (props: Partial<FastImageProps>) =>
        renderer
            .create(<FastImage source={source} {...props} />)
            .root.findAll((node) => node.type === ('FastImageView' as any))[0]
            .props.handledEvents
    const handler = () => {}

    it('asks the native view only for the events with a handler', () => {
        expect(handledEvents({})).toBe(0)
        expect(handledEvents({ onLoadStart: handler })).toBe(1)
        expect(handledEvents({ onProgress: handler })).toBe(2)
        expect(handledEvents({ onLoad: handler })).toBe(4)
        expect(handledEvents({ onError: handler })).toBe(8)
        expect(handledEvents({ onLoadEnd: handler })).toBe(16)
        expect(
            handledEvents({
                onLoadStart: handler,
                onProgress: handler,
                onLoad: handler,
                onError: handler,
                onLoadEnd: handler,
            }),
        ).toBe(31)
    })

    it("doesn't count a handler that's undefined", () => {
        expect(handledEvents({ onLoad: undefined })).toBe(0)
    })
})

describe('source.memoryCache', () => {
    it('is passed to the native view with the source', () => {
        const [view] = renderer
            .create(
                <FastImage
                    source={{
                        uri: 'https://example.com/a.jpg',
                        memoryCache: false,
                    }}
                />,
            )
            .root.findAll((node) => node.type === ('FastImageView' as any))
        expect(view.props.source.memoryCache).toBe(false)
    })
})

describe('several sources', () => {
    const nativeView = (element: React.ReactElement) =>
        renderer
            .create(element)
            .root.findAll((node) => node.type === ('FastImageView' as any))[0]
    const small = {
        uri: 'https://example.com/a-100.jpg',
        width: 100,
        height: 100,
    }
    const large = {
        uri: 'https://example.com/a-800.jpg',
        width: 800,
        height: 800,
    }

    it('passes several sources to the native view, which picks one', () => {
        const view = nativeView(<FastImage source={[small, large]} />)
        expect(view.props.sources).toEqual([small, large])
        expect(view.props.source).toBeUndefined()
    })

    it('treats an array of one as a plain source', () => {
        const view = nativeView(<FastImage source={[small]} />)
        expect(view.props.source).toEqual(small)
        expect(view.props.sources).toBeUndefined()
    })

    it('fails the methods that take one source for an array', async () => {
        const error =
            'Takes one source, not an array of sizes: pass the size to use'
        expect(await FastImage.getCachePath([small, large] as any)).toEqual({
            ok: false,
            error,
        })
        expect(
            await FastImage.writeToCache([small, large] as any, '/a.jpg'),
        ).toEqual({ ok: false, error })
        const preload = spyOn(
            NativeModules.FastImageModule,
            'preload',
        ).mockImplementation(async (sources: any[]) =>
            sources.map(() => ({ ok: true, width: 100, height: 100 })),
        )
        try {
            const results = await FastImage.preload([
                small,
                [small, large] as any,
            ])
            // The array is sent as {} so the results line up.
            expect(preload).toHaveBeenCalledWith([small, {}])
            expect(results).toEqual([
                { uri: small.uri, ok: true, width: 100, height: 100 },
                { uri: undefined, ok: false, error },
            ])
        } finally {
            preload.mockRestore()
        }
    })
})

describe('getCachePath', () => {
    it("asks native for the source's file", async () => {
        const sources: any[] = []
        const getCachePath = async (source: any) => {
            sources.push(source)
            return { ok: true, path: '/cache/a' }
        }
        const saved = NativeModules.FastImageModule
        NativeModules.FastImageModule = { ...saved, getCachePath }
        try {
            const source = { uri: 'https://example.com/a.jpg' }
            expect(await FastImage.getCachePath(source)).toEqual({
                ok: true,
                path: '/cache/a',
            })
            // A null source is sent as {}.
            await FastImage.getCachePath(null as any)
            expect(sources).toEqual([source, {}])
        } finally {
            NativeModules.FastImageModule = saved
        }
    })
})

describe('configureCache', () => {
    it('sends the limits to native and resolves with the ones in effect', async () => {
        const calls: any[] = []
        const configureCache = async (limits: any) => {
            calls.push(limits)
            return { maxDiskSize: limits.maxDiskSize, diskSize: 1024 }
        }
        const saved = NativeModules.FastImageModule
        NativeModules.FastImageModule = { ...saved, configureCache }
        try {
            const limits = { maxDiskSize: 100 * 1024 * 1024 }
            expect(await FastImage.configureCache(limits)).toEqual({
                ...limits,
                diskSize: 1024,
            })
            expect(calls).toStrictEqual([{ ...limits, reset: [] }])
            // Without limits, {} (Android can't read a null map).
            await FastImage.configureCache()
            expect(calls[1]).toStrictEqual({ reset: [] })
            // A limit set to null is sent as its name in reset, not as null
            // (iOS's TurboModule leaves out null values); undefined is left
            // out (unchanged).
            await FastImage.configureCache({
                maxDiskSize: null,
                maxDiskAge: 60,
                maxMemorySize: undefined,
            })
            expect(calls[2]).toStrictEqual({
                maxDiskAge: 60,
                reset: ['maxDiskSize'],
            })
        } finally {
            NativeModules.FastImageModule = saved
        }
    })
})

describe('Expo config plugin', () => {
    const plugin = require('../app.plugin.js')

    it('sets the limits in the Info.plist', () => {
        const infoPlist = plugin.setInfoPlist(
            { CFBundleName: 'App' },
            { maxDiskSize: 100, maxDiskAge: 60, maxMemorySize: 0 },
        )
        expect(infoPlist).toEqual({
            CFBundleName: 'App',
            FastImageMaxDiskSize: 100,
            FastImageMaxDiskAge: 60,
            FastImageMaxMemorySize: 0,
        })
        // Limits that aren't given aren't set.
        expect(plugin.setInfoPlist({}, {})).toEqual({})
    })

    it("sets maxDiskSize in the Android manifest's meta-data, once", () => {
        const manifest: any = {
            manifest: {
                application: [
                    {
                        $: {},
                        'meta-data': [{ $: { 'android:name': 'other' } }],
                    },
                ],
            },
        }
        plugin.setAndroidManifest(manifest, { maxDiskSize: 100 })
        plugin.setAndroidManifest(manifest, {
            maxDiskSize: 200,
            maxDiskAge: 60,
        })
        expect(manifest.manifest.application[0]['meta-data']).toEqual([
            { $: { 'android:name': 'other' } },
            {
                $: {
                    'android:name': 'fastimage.MAX_DISK_SIZE',
                    'android:value': '200',
                },
            },
        ])
    })
})

describe('writeToCache', () => {
    it('sends the source and file to native', async () => {
        const calls: any[] = []
        const writeToCache = async (source: any, file: string) => {
            calls.push([source, file])
            return { ok: true, path: '/cache/a' }
        }
        const saved = NativeModules.FastImageModule
        NativeModules.FastImageModule = { ...saved, writeToCache }
        try {
            const source = { uri: 'https://example.com/a.jpg' }
            expect(
                await FastImage.writeToCache(source, 'file:///tmp/a.jpg'),
            ).toEqual({ ok: true, path: '/cache/a' })
            // A null source is sent as {}.
            await FastImage.writeToCache(null as any, 'file:///tmp/a.jpg')
            expect(calls).toEqual([
                [source, 'file:///tmp/a.jpg'],
                [{}, 'file:///tmp/a.jpg'],
            ])
        } finally {
            NativeModules.FastImageModule = saved
        }
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

describe('transition', () => {
    const nativeView = (element: React.ReactElement) =>
        renderer
            .create(element)
            .root.findAll((node) => node.type === ('FastImageView' as any))[0]
    const source = { uri: 'https://example.com/a.jpg' }

    it('is off by default, not between images and skipping memory cache hits once set', () => {
        const view = nativeView(<FastImage source={source} />)
        expect(view.props.transitionDuration).toBe(0)
        expect(view.props.transitionBetweenImages).toBe(false)
        expect(view.props.transitionSkipOnCacheHit).toBe('memory')
    })

    it('takes a duration', () => {
        const view = nativeView(<FastImage source={source} transition={300} />)
        expect(view.props.transitionDuration).toBe(300)
        expect(view.props.transitionSkipOnCacheHit).toBe('memory')
    })

    it('takes an object', () => {
        const view = nativeView(
            <FastImage
                source={source}
                transition={{
                    duration: 300,
                    betweenImages: true,
                    skipOnCacheHit: 'none',
                }}
            />,
        )
        expect(view.props.transitionDuration).toBe(300)
        expect(view.props.transitionBetweenImages).toBe(true)
        expect(view.props.transitionSkipOnCacheHit).toBe('none')
    })

    it('uses the usual fade (250 ms on iOS) without a duration', () => {
        for (const transition of [true, { skipOnCacheHit: 'all' as const }]) {
            expect(
                nativeView(
                    <FastImage source={source} transition={transition} />,
                ).props.transitionDuration,
            ).toBe(250)
        }
    })

    it('is off for false, 0 or a negative duration', () => {
        for (const transition of [false, 0, -1, { duration: 0 }]) {
            expect(
                nativeView(
                    <FastImage source={source} transition={transition} />,
                ).props.transitionDuration,
            ).toBe(0)
        }
    })

    it('fades a bundled image like any other', () => {
        const resolveAssetSource = spyOn(
            Image,
            'resolveAssetSource',
        ).mockImplementation((asset: any) => ({ uri: `asset-${asset}` }) as any)
        try {
            const view = nativeView(<FastImage source={1} transition={300} />)
            expect(view.props.transitionDuration).toBe(300)
            expect(view.props.transitionSkipOnCacheHit).toBe('memory')
        } finally {
            resolveAssetSource.mockRestore()
        }
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

describe('blurRadius', () => {
    it('is passed to the native view', () => {
        const [view] = renderer
            .create(
                <FastImage
                    source={{ uri: 'https://example.com/a.jpg' }}
                    blurRadius={10}
                />,
            )
            .root.findAll((node) => node.type === ('FastImageView' as any))
        expect(view.props.blurRadius).toBe(10)
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

describe('objectFit', () => {
    const nativeResizeMode = (element: React.ReactElement) =>
        renderer
            .create(element)
            .root.findAll((node) => node.type === ('FastImageView' as any))[0]
            .props.resizeMode
    const source = { uri: 'https://example.com/a.png' }

    it('is sent as the native resizeMode', () => {
        expect(nativeResizeMode(<FastImage source={source} />)).toBe('cover')
        const modes = {
            fill: 'stretch',
            contain: 'contain',
            cover: 'cover',
            none: 'none',
            'scale-down': 'scale-down',
        } as const
        for (const [fit, mode] of Object.entries(modes)) {
            expect(
                nativeResizeMode(
                    <FastImage source={source} objectFit={fit as any} />,
                ),
            ).toBe(mode)
        }
    })

    it('can be set in style, where the last style that sets it wins', () => {
        expect(
            nativeResizeMode(
                <FastImage
                    source={source}
                    style={[{ objectFit: 'contain' }, [{ objectFit: 'none' }]]}
                />,
            ),
        ).toBe('none')
        // React Native's types have objectFit from 0.72 (these are 0.69's).
        const registered = StyleSheet.create({
            fit: { objectFit: 'fill' } as any,
        })
        expect(
            nativeResizeMode(
                <FastImage source={source} style={registered.fit} />,
            ),
        ).toBe('stretch')
    })

    it('wins over resizeMode, and the prop over style', () => {
        expect(
            nativeResizeMode(
                <FastImage
                    source={source}
                    resizeMode="repeat"
                    style={{ objectFit: 'contain' }}
                />,
            ),
        ).toBe('contain')
        expect(
            nativeResizeMode(
                <FastImage
                    source={source}
                    objectFit="scale-down"
                    style={{ objectFit: 'contain' }}
                />,
            ),
        ).toBe('scale-down')
        // Also over center, which Android shows differently.
        expect(
            nativeResizeMode(
                <FastImage
                    source={source}
                    resizeMode="center"
                    objectFit="scale-down"
                />,
            ),
        ).toBe('scale-down')
        expect(
            nativeResizeMode(
                <FastImage
                    source={source}
                    resizeMode="center"
                    style={{ objectFit: 'scale-down' }}
                />,
            ),
        ).toBe('scale-down')
        // An unknown value leaves resizeMode.
        expect(
            nativeResizeMode(
                <FastImage
                    source={source}
                    resizeMode="repeat"
                    objectFit={'tile' as any}
                />,
            ),
        ).toBe('repeat')
        // So does null (Flow's types allow it), and style's then applies.
        expect(
            nativeResizeMode(
                <FastImage
                    source={source}
                    objectFit={null as any}
                    style={{ objectFit: 'contain' }}
                />,
            ),
        ).toBe('contain')
    })
})

describe('resizeMode center', () => {
    it('is sent as center, not as scale-down', () => {
        const [view] = renderer
            .create(
                <FastImage
                    source={{ uri: 'https://example.com/a.png' }}
                    resizeMode="center"
                />,
            )
            .root.findAll((node) => node.type === ('FastImageView' as any))
        expect(view.props.resizeMode).toBe('center')
    })
})

describe('resizeMode', () => {
    it('passes repeat to the native view', () => {
        expect(FastImage.resizeMode.repeat).toBe('repeat')
        const [view] = renderer
            .create(
                <FastImage
                    source={{ uri: 'https://example.com/a.png' }}
                    resizeMode={FastImage.resizeMode.repeat}
                />,
            )
            .root.findAll((node) => node.type === ('FastImageView' as any))
        expect(view.props.resizeMode).toBe('repeat')
    })
})

describe('without the native module', () => {
    it("renders, and its functions throw an error saying it's missing", () => {
        // As TurboModuleRegistry.get returns in an app without it (Jest, Expo
        // Go, an app not rebuilt): Bun updates the import in place.
        mock.module('./specs/NativeFastImageModule', () => ({ default: null }))
        try {
            const [view] = renderer
                .create(
                    <FastImage source={{ uri: 'https://example.com/a.png' }} />,
                )
                .root.findAll((node) => node.type === ('FastImageView' as any))
            expect(view).toBeDefined()
            for (const call of [
                () => FastImage.preload([{ uri: 'https://example.com/a.png' }]),
                () => FastImage.clearMemoryCache(),
                () => FastImage.clearDiskCache(),
                () => FastImage.configureCache({ maxDiskSize: 1 }),
                () =>
                    FastImage.getCachePath({
                        uri: 'https://example.com/a.png',
                    }),
                () =>
                    FastImage.writeToCache(
                        { uri: 'https://example.com/a.png' },
                        '/a.png',
                    ),
            ]) {
                expect(call).toThrow(
                    "the native module FastImageModule isn't in this app",
                )
            }
        } finally {
            mock.module('./specs/NativeFastImageModule', () => ({
                default: TurboModuleRegistry.get('FastImageModule'),
            }))
        }
    })
})

describe('fallback (removed in 10.0)', () => {
    it('is ignored, with a warning once in development', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {})
        try {
            const tree = renderer.create(
                <>
                    {[0, 1].map((i) => (
                        <FastImage
                            key={i}
                            source={{ uri: 'https://example.com/a.png' }}
                            {...({ fallback: true } as any)}
                        />
                    ))}
                </>,
            )
            const views = tree.root.findAll(
                (node) => node.type === ('FastImageView' as any),
            )
            expect(views).toHaveLength(2)
            expect(views[0].props.fallback).toBeUndefined()
            expect(tree.root.findAllByType(Image)).toHaveLength(0)
            expect(warn).toHaveBeenCalledTimes(1)
            expect(String(warn.mock.calls[0][0])).toContain(
                '`fallback` was removed in 10.0',
            )
        } finally {
            warn.mockRestore()
        }
    })
})
