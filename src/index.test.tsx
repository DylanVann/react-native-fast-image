import {
    Image,
    StyleSheet,
    Platform,
    NativeModules,
    TurboModuleRegistry,
    View,
    type ImageURISource,
} from 'react-native'
import React from 'react'
import { act } from 'react-test-renderer'
import {
    afterEach,
    beforeAll,
    describe,
    expect,
    it,
    mock,
    spyOn,
} from 'bun:test'
import renderer from '../test/render'
import FastImage, {
    FastImageBackground,
    FastImageProps,
    type FastImageRef,
} from './index'
import { commands } from '../test/react-native'

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
                        // Deprecated, still works: 'high'.
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

        expect(fromStyle.props.tintColor).toBe('green')
        expect(fromProp.props.tintColor).toBe('red')
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

        expect(tree.props.tintColor).toBe('blue')
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

            expect(tree.props.tintColor).toBe('purple')
        } finally {
            flatten.mockRestore()
        }
    })

    it('is one native view, with the View props and style on it', () => {
        const onLayout = () => {}
        const tree: any = renderer
            .create(
                <FastImage
                    source={{ uri: 'https://example.com/image.png' }}
                    pointerEvents="box-none"
                    onLayout={onLayout}
                    accessibilityLabel="a cat"
                    style={[style.image, { borderRadius: 4 }]}
                />,
            )
            .toJSON()

        expect(tree.type).toBe('FastImageView')
        expect(tree.children).toBeNull()
        expect(tree.props.pointerEvents).toBe('box-none')
        expect(tree.props.onLayout).toBe(onLayout)
        expect(tree.props.accessibilityLabel).toBe('a cat')
        // Clips the image by default, as React Native's Image does.
        expect(StyleSheet.flatten(tree.props.style)).toEqual({
            overflow: 'hidden',
            width: 44,
            height: 44,
            borderRadius: 4,
        })
    })

    it("doesn't render children, with an error once in development", () => {
        const error = spyOn(console, 'error').mockImplementation(() => {})
        try {
            const element = (
                <FastImage source={{ uri: 'https://example.com/image.png' }}>
                    {/* @ts-expect-error FastImage doesn't take children: use FastImageBackground */}
                    <View testID="child" />
                </FastImage>
            )
            const tree: any = renderer.create(
                <>
                    {element}
                    {element}
                </>,
            )
            expect(
                tree.root.findAll(
                    (node: any) => node.props?.testID === 'child',
                ),
            ).toHaveLength(0)
            const [view] = tree.root.findAll(
                (node: any) => node.type === 'FastImageView',
            )
            expect(view.props.children).toBeUndefined()
            expect(error).toHaveBeenCalledTimes(1)
            expect(String(error.mock.calls[0][0])).toContain(
                "FastImage doesn't render children",
            )
        } finally {
            error.mockRestore()
        }
    })

    it('puts hitSlop and the touch handlers on its native view', () => {
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
        expect(tree.props.accessibilityLabel).toBe('a cat')
        expect(tree.children).toBeNull()
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

    it("fails preload entries that aren't source objects, without sending them", async () => {
        const preload = spyOn(
            NativeModules.FastImageModule,
            'preload',
        ).mockImplementation(async (sources: any[]) =>
            sources.map((s) =>
                s.uri
                    ? { ok: true, width: 10, height: 20 }
                    : { ok: false, error: 'Invalid source: no uri' },
            ),
        )
        try {
            const results = await FastImage.preload([
                'https://example.com/a.png' as any,
                { uri: 'https://example.com/b.png' },
                42 as any,
                true as any,
            ])
            // Native would crash reading them as sources: they're sent as {},
            // so the results line up.
            expect(preload).toHaveBeenCalledWith([
                {},
                { uri: 'https://example.com/b.png' },
                {},
                {},
            ])
            const failed = {
                uri: undefined,
                ok: false,
                error: 'Invalid source: no uri',
            } as const
            expect(results).toEqual([
                failed,
                {
                    uri: 'https://example.com/b.png',
                    ok: true,
                    width: 10,
                    height: 20,
                },
                failed,
                failed,
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
                // Deprecated, still works: 'high'.
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

describe('thumbhash', () => {
    const H1 = 'mKYCnZqXl/iIeIiHeIeIiH94+IiI'
    const H2 = 'YdgFjaSPiIiIiHh4h4iIh4B4CId3'
    const uri = 'https://example.com/a.jpg'
    const props = (element: React.ReactElement) =>
        (renderer.create(element).toJSON() as any).props

    it('goes to the native view with the source', () => {
        const view = props(<FastImage source={{ uri, thumbhash: H1 }} />)
        expect(view.source).toEqual({ uri, thumbhash: H1 })
        const sources = [
            { uri, width: 100, height: 75 },
            { uri: `${uri}?2`, width: 400, height: 300, thumbhash: H2 },
        ]
        expect(props(<FastImage source={sources} />).source).toEqual(sources)
    })

    it('keeps an unchanged source as the same objects', () => {
        const source = { uri, thumbhash: H1 }
        const sources = [
            { uri, width: 100, height: 75, thumbhash: H1 },
            { uri: `${uri}?2`, width: 400, height: 300, thumbhash: H2 },
        ]
        for (const value of [source, sources]) {
            const view = renderer.create(<FastImage source={value} />)
            const before = (view.toJSON() as any).props
            // Another prop changes: React's prop diff stops at the same
            // objects instead of comparing them field by field.
            act(() => view.update(<FastImage source={value} tintColor="red" />))
            const after = (view.toJSON() as any).props
            expect(after.source).toBe(before.source)
        }
    })
})

describe('placeholder', () => {
    const H1 = 'mKYCnZqXl/iIeIiHeIeIiH94+IiI'
    const DATA = 'data:image/png;base64,iVBORw0KGgo='
    const uri = 'https://example.com/a.jpg'
    const props = (element: React.ReactElement) =>
        (renderer.create(element).toJSON() as any).props
    const jellyfish = require('../ReactNativeFastImageExample/src/images/jellyfish.gif')

    afterEach(() => {
        Platform.OS = 'ios'
    })

    it('is a data uri: a url is ignored natively, with a warning', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {})
        props(
            <FastImage
                source={{ uri, blurDataUri: 'https://example.com/small.jpg' }}
            />,
        )
        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn.mock.calls[0][0]).toContain('data uri')
        warn.mockRestore()
    })

    it('as a thumbhash or blurDataUri, goes as it is, in place of defaultSource', () => {
        const view = props(
            <FastImage
                source={{ uri }}
                placeholder={{ thumbhash: H1 }}
                defaultSource={jellyfish}
            />,
        )
        expect(view.placeholder).toEqual({ thumbhash: H1 })
        const data = props(
            <FastImage source={{ uri }} placeholder={{ blurDataUri: DATA }} />,
        )
        expect(data.placeholder).toEqual({ blurDataUri: DATA })
    })

    it('as an empty thumbhash, leaves defaultSource as the image', () => {
        const view = props(
            <FastImage
                source={{ uri }}
                placeholder={{ thumbhash: undefined }}
                defaultSource={jellyfish}
            />,
        )
        expect(view.placeholder).toEqual(
            props(<FastImage source={{ uri }} placeholder={jellyfish} />)
                .placeholder,
        )
        expect(view.placeholder).toBeTruthy()
    })

    it('takes a url, loaded natively apart from the image', () => {
        const url = 'https://example.com/placeholder.png'
        const view = props(<FastImage source={{ uri }} placeholder={url} />)
        expect(view.placeholder).toEqual({ uri: url })
        const object = {
            uri: url,
            headers: { Authorization: 'token' },
            cache: 'cacheOnly' as const,
        }
        expect(
            props(<FastImage source={{ uri }} placeholder={object} />)
                .placeholder,
        ).toEqual(object)
        // In place of defaultSource.
        expect(
            props(
                <FastImage
                    source={{ uri }}
                    placeholder={url}
                    defaultSource={jellyfish}
                />,
            ).placeholder,
        ).toEqual({ uri: url })
        // A local file is decoded at once, as the image placeholder.
        Platform.OS = 'android'
        expect(
            props(
                <FastImage
                    source={{ uri }}
                    placeholder={{ uri: 'file:///tmp/thumb.png' }}
                />,
            ).placeholder,
        ).toBe('file:///tmp/thumb.png')
        // A name (no scheme) is a bundled image, not a url.
        expect(
            props(<FastImage source={{ uri }} placeholder="gray" />)
                .placeholder,
        ).toBe('gray')
    })

    it('takes the name of an image bundled with the app', () => {
        Platform.OS = 'ios'
        expect(
            props(<FastImage source={{ uri }} placeholder="gray" />)
                .placeholder,
        ).toEqual({ uri: 'gray' })
        Platform.OS = 'android'
        expect(
            props(<FastImage source={{ uri }} placeholder="gray" />)
                .placeholder,
        ).toBe('gray')
    })

    it('takes a data uri: an image source on iOS, the uri on Android', () => {
        Platform.OS = 'ios'
        expect(
            props(<FastImage source={{ uri }} placeholder={DATA} />)
                .placeholder,
        ).toEqual({ uri: DATA })
        Platform.OS = 'android'
        expect(
            props(<FastImage source={{ uri }} placeholder={DATA} />)
                .placeholder,
        ).toBe(DATA)
    })

    it('takes a require()d image, as defaultSource, and wins over it', () => {
        const asPlaceholder = props(
            <FastImage source={{ uri }} placeholder={jellyfish} />,
        )
        const asDefault = props(
            <FastImage source={{ uri }} defaultSource={jellyfish} />,
        )
        expect(asPlaceholder.placeholder).toEqual(asDefault.placeholder)
        expect(asPlaceholder.placeholder).toBeTruthy()
        const both = props(
            <FastImage
                source={{ uri }}
                placeholder={DATA}
                defaultSource={jellyfish}
            />,
        )
        expect(both.placeholder).toEqual({ uri: DATA })
    })
})

describe('ref', () => {
    it("is FastImage's view", () => {
        const ref = React.createRef<FastImageRef>()
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
        // The native view itself: FastImage has no wrapper.
        expect(ref.current).toMatchObject({ type: 'FastImageView' })
        // Typed as the view, with its methods and reload() (a type check:
        // the view here is a stand-in).
        const use = (view: React.ComponentRef<typeof FastImage>) => {
            view.measure(() => {})
            view.reload()
        }
        expect(typeof use).toBe('function')
    })
})

describe('reload', () => {
    afterEach(() => {
        commands.length = 0
    })

    it("is on the ref's view, and sends the native view the command", () => {
        const ref = React.createRef<FastImageRef>()
        renderer.create(
            <FastImage
                ref={ref}
                source={{ uri: 'https://example.com/a.png' }}
            />,
            // Host refs are null without a node.
            { createNodeMock: (element) => ({ type: element.type }) },
        )
        ref.current!.reload()
        expect(commands).toEqual([{ name: 'reload', view: ref.current }])
    })

    it('is on the view a ref callback gets, which gets null after', () => {
        const views: (FastImageRef | null)[] = []
        const tree = renderer.create(
            <FastImage
                ref={(view: FastImageRef | null) => {
                    views.push(view)
                }}
                source={{ uri: 'https://example.com/a.png' }}
            />,
            { createNodeMock: (element) => ({ type: element.type }) },
        )
        views[0]!.reload()
        expect(commands).toEqual([{ name: 'reload', view: views[0] }])
        act(() => tree.unmount())
        expect(views).toHaveLength(2)
        expect(views[1]).toBeNull()
    })

    it("is on FastImageBackground's image (imageRef)", () => {
        const imageRef = React.createRef<FastImageRef>()
        renderer.create(
            <FastImageBackground
                imageRef={imageRef}
                source={{ uri: 'https://example.com/a.png' }}
            />,
            { createNodeMock: (element) => ({ type: element.type }) },
        )
        imageRef.current!.reload()
        expect(commands).toEqual([{ name: 'reload', view: imageRef.current }])
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
                objectFit="contain"
            >
                <View testID="content" />
            </FastImageBackground>,
            // Host refs are null without a node.
            { createNodeMock: () => ({}) },
        )
        // A view with the image (FastImage's native view), then the children.
        const json: any = tree.toJSON()
        expect(json.props.style).toEqual({ width: 100, height: 50 })
        expect(json.props.accessibilityIgnoresInvertColors).toBe(true)
        expect(json.children).toHaveLength(2)
        expect(json.children[1].props.testID).toBe('content')
        // The FastImage, with the other props, filling the view.
        const image = tree.root.findByType(FastImage as any)
        expect(image.props.objectFit).toBe('contain')
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

describe("React Native's source.cache values", () => {
    const nativeSource = (source: FastImageProps['source']) =>
        renderer
            .create(<FastImage source={source} />)
            .root.findAll((node) => node.type === ('FastImageView' as any))[0]
            .props.source
    const uri = 'https://example.com/a.jpg'

    it("takes React Native's ImageURISource on the views only", () => {
        const source: ImageURISource = { uri, cache: 'force-cache' }
        expect(nativeSource(source)).toBe(source)
        // preload, getCachePath and writeToCache take Fast Image's values.
        const preload = () =>
            // @ts-expect-error React Native's cache values are only for views
            FastImage.preload([source])
        expect(preload).toBeFunction()
    })

    it('sends them to the native view as they are, which reads them', () => {
        const several = [
            { uri, width: 100, cache: 'only-if-cached' as const },
            { uri, width: 800, cache: 'default' as const },
        ]
        expect(nativeSource(several)).toEqual(several)
        const source = { uri, cache: 'only-if-cached' as const }
        expect(nativeSource(source)).toBe(source)
    })

    it("warns once for 'reload'", () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {})
        try {
            nativeSource({ uri, cache: 'reload' })
            nativeSource([{ uri, cache: 'reload' }, { uri }])
            expect(warn).toHaveBeenCalledTimes(1)
            expect(warn.mock.calls[0][0]).toContain("cache: 'reload'")
        } finally {
            warn.mockRestore()
        }
    })
})

describe('headers', () => {
    const uri = 'https://example.com/a.jpg'
    const view = (element: React.ReactElement) =>
        renderer
            .create(element)
            .root.findAll((node) => node.type === ('FastImageView' as any))[0]
            .props
    const headers = {
        'x-token': 'a',
        'x-number': 3,
        'x-decimal': 1.5,
        'x-boolean': true,
        'x-null': null,
        'x-undefined': undefined,
    }
    // As fetch sends them; null and undefined are headers that aren't set.
    const sent = {
        'x-token': 'a',
        'x-number': '3',
        'x-decimal': '1.5',
        'x-boolean': 'true',
    }

    it('go to native as strings: numbers and booleans converted, null and undefined left out', () => {
        const source = { uri, headers } as unknown as { uri: string }
        expect(view(<FastImage source={source} />).source.headers).toEqual(sent)
        expect(
            view(<FastImage source={[source, { uri, width: 10 }]} />).source[0]
                .headers,
        ).toEqual(sent)
        expect(
            view(
                <FastImage
                    source={{ uri }}
                    placeholder={{ uri, headers } as any}
                />,
            ).placeholder.headers,
        ).toEqual(sent)
        const preload = spyOn(NativeModules.FastImageModule, 'preload')
        try {
            FastImage.preload([source as any])
            const [sources] = preload.mock.calls[0] as unknown as [
                { headers: unknown }[],
            ]
            expect(sources[0].headers).toEqual(sent)
        } finally {
            preload.mockRestore()
        }
    })

    it('leave a source with only strings as it is', () => {
        const source = { uri, headers: { 'x-token': 'a' } }
        expect(view(<FastImage source={source} />).source).toBe(source)
    })

    it("warn once in development about values that can't be sent, or headers that aren't an object", () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {})
        try {
            view(<FastImage source={{ uri, headers } as any} />)
            view(<FastImage source={{ uri, headers: null } as any} />)
            expect(warn).not.toHaveBeenCalled()
            const props = view(
                <FastImage
                    source={
                        {
                            uri,
                            headers: {
                                'x-token': 'a',
                                'x-object': {},
                                'x-array': [],
                            },
                        } as any
                    }
                />,
            )
            expect(props.source.headers).toEqual({ 'x-token': 'a' })
            expect(
                view(
                    <FastImage source={{ uri, headers: ['x-token'] } as any} />,
                ).source.headers,
            ).toBeUndefined()
            // Each warning once.
            view(<FastImage source={{ uri, headers: ['x-token'] } as any} />)
            expect(warn).toHaveBeenCalledTimes(2)
            expect(warn.mock.calls[0][0]).toContain(
                'the headers "x-object", "x-array" are objects or functions, so they aren\'t sent',
            )
            expect(warn.mock.calls[1][0]).toContain(
                "`headers` isn't an object, so none are sent",
            )
        } finally {
            warn.mockRestore()
        }
    })
})

describe('source.diskCache', () => {
    it('is passed to the native view with the source', () => {
        const [view] = renderer
            .create(
                <FastImage
                    source={{
                        uri: 'https://example.com/a.jpg',
                        diskCache: false,
                    }}
                />,
            )
            .root.findAll((node) => node.type === ('FastImageView' as any))
        expect(view.props.source.diskCache).toBe(false)
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
        expect(view.props.source).toEqual([small, large])
    })

    it("resolves a require()d image among them, with its file's size", () => {
        const jellyfish = require('../ReactNativeFastImageExample/src/images/jellyfish.gif')
        const view = nativeView(<FastImage source={[small, jellyfish]} />)
        expect(view.props.source).toEqual([
            small,
            Image.resolveAssetSource(jellyfish),
        ])
        expect(typeof view.props.source[1]).toBe('object')
    })

    it('treats an array of one as a plain source', () => {
        const view = nativeView(<FastImage source={[small]} />)
        expect(view.props.source).toEqual(small)
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
            // A null source, or one that isn't an object (native would crash
            // reading it), is sent as {}.
            await FastImage.getCachePath(null as any)
            await FastImage.getCachePath('https://example.com/a.jpg' as any)
            await FastImage.getCachePath(42 as any)
            expect(sources).toEqual([source, {}, {}, {}])
        } finally {
            NativeModules.FastImageModule = saved
        }
    })
})

describe('writeToCache', () => {
    it("asks native to store the file as the source's image", async () => {
        const calls: any[] = []
        const writeToCache = async (source: any, file: string) => {
            calls.push([source, file])
            return { ok: true, path: '/cache/a' }
        }
        const saved = NativeModules.FastImageModule
        NativeModules.FastImageModule = { ...saved, writeToCache }
        try {
            const source = { uri: 'https://example.com/a.jpg' }
            expect(await FastImage.writeToCache(source, '/a.jpg')).toEqual({
                ok: true,
                path: '/cache/a',
            })
            // A null source, or one that isn't an object (native would crash
            // reading it), is sent as {}.
            await FastImage.writeToCache(null as any, '/a.jpg')
            await FastImage.writeToCache(
                'https://example.com/a.jpg' as any,
                '/a.jpg',
            )
            expect(calls).toEqual([
                [source, '/a.jpg'],
                [{}, '/a.jpg'],
                [{}, '/a.jpg'],
            ])
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

    // As on another platform (the tests run as iOS).
    const onPlatform = (os: typeof Platform.OS, run: () => void) => {
        const saved = Platform.OS
        Platform.OS = os
        try {
            run()
        } finally {
            Platform.OS = saved
        }
    }

    afterEach(() => {
        FastImage.setDefaults({ transition: null })
    })

    it('is off by default on iOS, not between images and skipping memory cache hits once set', () => {
        const view = nativeView(<FastImage source={source} />)
        expect(view.props.transitionDuration).toBe(0)
        expect(view.props.transitionBetweenImages).toBe(false)
        expect(view.props.transitionSkipOnCacheHit).toBe('memory')
    })

    it('fades over 300 ms by default on Android, and null is the default', () => {
        onPlatform('android', () => {
            for (const transition of [undefined, null]) {
                const view = nativeView(
                    <FastImage source={source} transition={transition} />,
                )
                expect(view.props.transitionDuration).toBe(300)
                expect(view.props.transitionBetweenImages).toBe(false)
                expect(view.props.transitionSkipOnCacheHit).toBe('memory')
            }
            expect(
                nativeView(<FastImage source={source} transition={false} />)
                    .props.transitionDuration,
            ).toBe(0)
        })
        expect(
            nativeView(<FastImage source={source} transition={null} />).props
                .transitionDuration,
        ).toBe(0)
    })

    it('takes a default from setDefaults, which an image overrides setting by setting', () => {
        FastImage.setDefaults({
            transition: { duration: 200, betweenImages: true },
        })
        const props = (transition?: any) => {
            const view = nativeView(
                <FastImage source={source} transition={transition} />,
            )
            return [
                view.props.transitionDuration,
                view.props.transitionBetweenImages,
                view.props.transitionSkipOnCacheHit,
            ]
        }
        expect(props()).toEqual([200, true, 'memory'])
        // true is the default's duration; the rest come from the default.
        expect(props(true)).toEqual([200, true, 'memory'])
        expect(props(500)).toEqual([500, true, 'memory'])
        expect(props({ skipOnCacheHit: 'none' })).toEqual([200, true, 'none'])
        expect(props({ betweenImages: false })).toEqual([200, false, 'memory'])
        expect(props(false)).toEqual([0, true, 'memory'])
        // Settings left out of setDefaults are kept.
        FastImage.setDefaults({})
        expect(props()).toEqual([200, true, 'memory'])
    })

    it('can turn the fade off, or on for iOS, for every image', () => {
        onPlatform('android', () => {
            FastImage.setDefaults({ transition: false })
            expect(
                nativeView(<FastImage source={source} />).props
                    .transitionDuration,
            ).toBe(0)
            // An image's true is still the usual fade.
            expect(
                nativeView(<FastImage source={source} transition />).props
                    .transitionDuration,
            ).toBe(300)
        })
        FastImage.setDefaults({ transition: true })
        expect(
            nativeView(<FastImage source={source} />).props.transitionDuration,
        ).toBe(250)
        // null goes back to the built-in default.
        FastImage.setDefaults({ transition: null })
        expect(
            nativeView(<FastImage source={source} />).props.transitionDuration,
        ).toBe(0)
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
    const nativeFit = (element: React.ReactElement) =>
        renderer
            .create(element)
            .root.findAll((node) => node.type === ('FastImageView' as any))[0]
            .props.objectFit
    const source = { uri: 'https://example.com/a.png' }

    it('is sent to the native view, cover by default', () => {
        expect(nativeFit(<FastImage source={source} />)).toBe('cover')
        for (const fit of ['fill', 'contain', 'cover', 'none', 'scale-down']) {
            expect(
                nativeFit(<FastImage source={source} objectFit={fit as any} />),
            ).toBe(fit)
        }
    })

    it('can be set in style, where the last style that sets it wins', () => {
        expect(
            nativeFit(
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
            nativeFit(<FastImage source={source} style={registered.fit} />),
        ).toBe('fill')
    })

    it('the prop wins over style, and an unknown value is not set', () => {
        expect(
            nativeFit(
                <FastImage
                    source={source}
                    objectFit="scale-down"
                    style={{ objectFit: 'contain' }}
                />,
            ),
        ).toBe('scale-down')
        expect(
            nativeFit(<FastImage source={source} objectFit={'tile' as any} />),
        ).toBe('cover')
        expect(
            nativeFit(
                <FastImage
                    source={source}
                    style={{ objectFit: 'tile' as any }}
                />,
            ),
        ).toBe('cover')
        // So is null (Flow's types allow it), and style's then applies.
        expect(
            nativeFit(
                <FastImage
                    source={source}
                    objectFit={null as any}
                    style={{ objectFit: 'contain' }}
                />,
            ),
        ).toBe('contain')
    })

    it('ignores resizeMode (removed in 10.0), as a prop and in style', () => {
        const [view] = renderer
            .create(
                <FastImage
                    source={source}
                    {...({ resizeMode: 'contain' } as {})}
                    style={{ resizeMode: 'stretch' } as any}
                />,
            )
            .root.findAll((node) => node.type === ('FastImageView' as any))
        expect(view.props.objectFit).toBe('cover')
        expect(view.props.resizeMode).toBeUndefined()
    })

    it('sends dynamicRangeLimit to the native view', () => {
        const [view] = renderer
            .create(
                <FastImage source={source} dynamicRangeLimit="constrained" />,
            )
            .root.findAll((node) => node.type === ('FastImageView' as any))
        expect(view.props.dynamicRangeLimit).toBe('constrained')
    })

    it("doesn't send the web-only loading and sizes to the native view", () => {
        const [view] = renderer
            .create(<FastImage source={source} loading="eager" sizes="50vw" />)
            .root.findAll((node) => node.type === ('FastImageView' as any))
        expect(view.props.loading).toBeUndefined()
        expect(view.props.sizes).toBeUndefined()
    })

    it('keeps the deprecated FastImage.resizeMode, whose values are ignored', () => {
        // Code written for 9.x reads it: it mustn't throw.
        const [view] = renderer
            .create(
                <FastImage
                    source={source}
                    {...({ resizeMode: FastImage.resizeMode.contain } as {})}
                />,
            )
            .root.findAll((node) => node.type === ('FastImageView' as any))
        expect(view.props.objectFit).toBe('cover')
        expect(view.props.resizeMode).toBeUndefined()
    })
})

describe('objectPosition', () => {
    const nativeProps = (element: React.ReactElement) =>
        renderer
            .create(element)
            .root.findAll((node) => node.type === ('FastImageView' as any))[0]
            .props
    const source = { uri: 'https://example.com/a.png' }

    it('is sent as a fraction and an offset per axis, centered by default', () => {
        expect(nativeProps(<FastImage source={source} />)).toMatchObject({
            objectPositionX: 0.5,
            objectPositionXOffset: 0,
            objectPositionY: 0.5,
            objectPositionYOffset: 0,
        })
        expect(
            nativeProps(
                <FastImage
                    source={source}
                    objectPosition="right 10px bottom 20%"
                />,
            ),
        ).toMatchObject({
            objectPositionX: 1,
            objectPositionXOffset: -10,
            objectPositionY: 0.8,
            objectPositionYOffset: 0,
        })
        expect(
            nativeProps(
                <FastImage source={source} objectPosition={{ top: 12 }} />,
            ),
        ).toMatchObject({
            objectPositionX: 0.5,
            objectPositionY: 0,
            objectPositionYOffset: 12,
        })
    })

    it('centers an invalid position, with a warning', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {})
        try {
            expect(
                nativeProps(
                    <FastImage source={source} objectPosition="top 10%" />,
                ),
            ).toMatchObject({ objectPositionX: 0.5, objectPositionY: 0.5 })
            expect(warn).toHaveBeenCalledTimes(1)
            expect(String(warn.mock.calls[0][0])).toContain(
                'objectPosition "top 10%"',
            )
        } finally {
            warn.mockRestore()
        }
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

describe('ARIA props', () => {
    const viewProps = (element: React.ReactElement) =>
        renderer
            .create(element)
            .root.findAll((node) => node.type === ('FastImageView' as any))[0]
            .props
    const source = { uri: 'https://example.com/a.png' }
    afterEach(() => {
        Platform.OS = 'ios'
    })

    it('go to the native view as its accessibility props, as with View', () => {
        const props = viewProps(
            <FastImage
                source={source}
                aria-label="A cat"
                aria-labelledby="name, caption"
                aria-live="off"
                aria-busy
                aria-selected={false}
                accessibilityState={{ checked: true, busy: false }}
                aria-valuenow={2}
                accessibilityValue={{ min: 0, max: 5 }}
                id="cat"
                tabIndex={0}
            />,
        )
        expect(props).toMatchObject({
            accessibilityLabel: 'A cat',
            accessibilityLabelledBy: ['name', 'caption'],
            accessibilityLiveRegion: 'none',
            accessibilityState: {
                busy: true,
                checked: true,
                disabled: undefined,
                expanded: undefined,
                selected: false,
            },
            accessibilityValue: { min: 0, max: 5, now: 2, text: undefined },
            nativeID: 'cat',
            focusable: true,
        })
        expect(Object.keys(props).some((key) => key.startsWith('aria-'))).toBe(
            false,
        )
        expect(props.id).toBeUndefined()
        expect(props.tabIndex).toBeUndefined()
    })

    it('aria-hidden hides the image (not accessible on iOS)', () => {
        expect(
            viewProps(<FastImage source={source} accessible aria-hidden />),
        ).toMatchObject({
            accessible: false,
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants',
        })
        Platform.OS = 'android'
        expect(
            viewProps(<FastImage source={source} accessible aria-hidden />),
        ).toMatchObject({
            accessible: true,
            importantForAccessibility: 'no-hide-descendants',
        })
    })

    it('leave the props alone without them', () => {
        const props = viewProps(
            <FastImage
                source={source}
                accessible
                accessibilityLabel="A dog"
                accessibilityState={{ selected: true }}
            />,
        )
        expect(props.accessibilityLabel).toBe('A dog')
        expect(props.accessibilityState).toEqual({ selected: true })
        expect(props.importantForAccessibility).toBeUndefined()
        expect(props.nativeID).toBeUndefined()
    })
})
