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
        const measure = (view: React.ElementRef<typeof FastImage>) =>
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

describe('onProgress', () => {
    const source = { uri: 'https://example.com/a.png' }

    it('adds progress (loaded / total) to the event', () => {
        const progress: number[] = []
        const [view] = renderer
            .create(
                <FastImage
                    source={source}
                    onProgress={(e) => progress.push(e.nativeEvent.progress)}
                />,
            )
            .root.findAll((node) => node.type === ('FastImageView' as any))
        view.props.onFastImageProgress({
            nativeEvent: { loaded: 50, total: 200 },
        })
        view.props.onFastImageProgress({
            nativeEvent: { loaded: 200, total: 200 },
        })
        expect(progress).toEqual([0.25, 1])
    })

    it('adds progress with fallback, 0 for an unknown total', () => {
        const progress: number[] = []
        const image = renderer
            .create(
                <FastImage
                    source={source}
                    fallback
                    onProgress={(e) => progress.push(e.nativeEvent.progress)}
                />,
            )
            .root.findByType(Image)
        image.props.onProgress({ nativeEvent: { loaded: 10, total: -1 } })
        image.props.onProgress({ nativeEvent: { loaded: 30, total: 40 } })
        expect(progress).toEqual([0, 0.75])
    })

    it('asks the native view for progress events only with onProgress', () => {
        const trackProgress = (element: React.ReactElement) =>
            renderer
                .create(element)
                .root.findAll(
                    (node) => node.type === ('FastImageView' as any),
                )[0].props.trackProgress
        expect(trackProgress(<FastImage source={source} />)).toBe(false)
        expect(
            trackProgress(<FastImage source={source} onProgress={() => {}} />),
        ).toBe(true)
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
            NativeModules.FastImageView,
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
        const saved = NativeModules.FastImageView
        NativeModules.FastImageView = { ...saved, getCachePath }
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
            NativeModules.FastImageView = saved
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
        const saved = NativeModules.FastImageView
        NativeModules.FastImageView = { ...saved, configureCache }
        try {
            const limits = { maxDiskSize: 100 * 1024 * 1024 }
            expect(await FastImage.configureCache(limits)).toEqual({
                ...limits,
                diskSize: 1024,
            })
            expect(calls).toEqual([limits])
            // Without limits, {} (Android can't read a null map).
            await FastImage.configureCache()
            expect(calls).toEqual([limits, {}])
        } finally {
            NativeModules.FastImageView = saved
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
        const saved = NativeModules.FastImageView
        NativeModules.FastImageView = { ...saved, writeToCache }
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
            NativeModules.FastImageView = saved
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

    it("is passed to React Native's Image with fallback", () => {
        const [image] = renderer
            .create(
                <FastImage
                    source={{ uri: 'https://example.com/a.jpg' }}
                    blurRadius={10}
                    fallback
                />,
            )
            .root.findAll((node) => node.type === Image)
        expect(image.props.blurRadius).toBe(10)
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
