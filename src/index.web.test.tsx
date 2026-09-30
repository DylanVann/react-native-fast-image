import { Image, Text } from 'react-native'
import React from 'react'
import { describe, expect, it, mock } from 'bun:test'
import renderer from 'react-test-renderer'
import FastImage, { FastImageBackground } from './index.web'

function renderImage(element: React.ReactElement) {
    const root = renderer.create(element).root
    return root.findAll((node) => node.type === ('Image' as any))[0]
}

describe('FastImage (web)', () => {
    it('passes what the web Image supports', () => {
        const image = renderImage(
            <FastImage
                source={{
                    uri: 'https://example.com/a.jpg',
                    headers: { token: 'a' },
                    priority: 'high',
                    cache: 'immutable',
                }}
                resizeMode="contain"
                tintColor="red"
                blurRadius={4}
                testID="image"
                accessibilityLabel="An image"
                transition={300}
                downsample
                loop={false}
                paused
                recyclingKey="row"
            />,
        )
        expect(image.props.source).toEqual({ uri: 'https://example.com/a.jpg' })
        expect(image.props.resizeMode).toBe('contain')
        expect(image.props.tintColor).toBe('red')
        expect(image.props.blurRadius).toBe(4)
        expect(image.props.testID).toBe('image')
        expect(image.props.accessibilityLabel).toBe('An image')
        for (const name of [
            'transition',
            'downsample',
            'loop',
            'paused',
            'recyclingKey',
            'headers',
        ]) {
            expect(image.props[name]).toBeUndefined()
        }
    })

    it('passes a require()d image through, and covers by default', () => {
        const image = renderImage(<FastImage source={3} />)
        expect(image.props.source).toBe(3)
        expect(image.props.resizeMode).toBe('cover')
    })

    it('renders children on top of the image', () => {
        const root = renderer.create(
            <FastImage source={{ uri: 'https://example.com/a.jpg' }}>
                <Text>on top</Text>
            </FastImage>,
        ).root
        expect(
            root.findAll((node) => node.type === ('Text' as any)),
        ).toHaveLength(1)
        const background = renderer.create(
            <FastImageBackground source={{ uri: 'https://example.com/a.jpg' }}>
                <Text>on top</Text>
            </FastImageBackground>,
        ).root
        expect(
            background.findAll((node) => node.type === ('Text' as any)),
        ).toHaveLength(1)
    })

    it('gives the browser several sizes once the view has been laid out', () => {
        const sources = [
            { uri: 'https://example.com/100.png', width: 100, height: 100 },
            { uri: 'https://example.com/300.png', width: 300, height: 300 },
            {
                uri: 'https://example.com/450.png',
                width: 300,
                height: 300,
                scale: 1.5,
            },
        ]
        const tree = renderer.create(<FastImage source={sources} />)
        const img = () =>
            tree.root.findAll((node) => node.type === ('img' as any))[0]
        const layout = (width: number) =>
            renderer.act(() => {
                tree.root
                    .findAll((node) => node.type === ('View' as any))[0]
                    .props.onLayout({
                        nativeEvent: { layout: { width, height: width } },
                    })
            })
        expect(img()).toBeUndefined()
        layout(150)
        expect(img().props.srcSet).toBe(
            'https://example.com/100.png 100w, https://example.com/300.png 300w, https://example.com/450.png 450w',
        )
        expect(img().props.sizes).toBe('150px')
        expect(img().props.src).toBe('https://example.com/450.png')
        // No width: the largest, as on native.
        layout(0)
        expect(img().props.srcSet).toBeUndefined()
        expect(img().props.src).toBe('https://example.com/450.png')
    })

    // After React Native's Image sends onLoadEnd, once FastImage has the
    // image's size.
    const settled = () => new Promise((resolve) => setTimeout(resolve, 10))

    it('sends onLoad and onLoadEnd as native does', async () => {
        const onLoad = mock()
        const onLoadEnd = mock()
        const image = renderImage(
            <FastImage
                source={{ uri: 'https://example.com/a.jpg' }}
                onLoad={onLoad}
                onLoadEnd={onLoadEnd}
            />,
        )
        image.props.onLoad({
            nativeEvent: { target: { naturalWidth: 40, naturalHeight: 30 } },
        })
        image.props.onLoadEnd()
        await settled()
        expect(onLoad).toHaveBeenCalledWith({
            nativeEvent: { width: 40, height: 30 },
        })
        expect(onLoadEnd).toHaveBeenCalledWith({
            ok: true,
            width: 40,
            height: 30,
        })
    })

    it("reads the image's size from its uri if the event lost it", async () => {
        ;(Image as any).getSize = (
            _uri: string,
            success: (w: number, h: number) => void,
        ) => success(64, 48)
        const onLoad = mock()
        const onLoadEnd = mock()
        const image = renderImage(
            <FastImage
                source={{ uri: 'https://example.com/a.jpg' }}
                onLoad={onLoad}
                onLoadEnd={onLoadEnd}
            />,
        )
        image.props.onLoad({ nativeEvent: { target: null } })
        image.props.onLoadEnd()
        expect(onLoadEnd).not.toHaveBeenCalled()
        await settled()
        expect(onLoad).toHaveBeenCalledWith({
            nativeEvent: { width: 64, height: 48 },
        })
        expect(onLoadEnd).toHaveBeenCalledWith({
            ok: true,
            width: 64,
            height: 48,
        })
    })

    it('sends onError and onLoadEnd as native does', async () => {
        const onError = mock()
        const onLoadEnd = mock()
        const image = renderImage(
            <FastImage
                source={{ uri: 'https://example.com/missing.jpg' }}
                onError={onError}
                onLoadEnd={onLoadEnd}
            />,
        )
        image.props.onError({
            nativeEvent: { error: 'Failed to load resource' },
        })
        image.props.onLoadEnd()
        await settled()
        expect(onError).toHaveBeenCalledWith({
            nativeEvent: { error: 'Failed to load resource' },
        })
        expect(onLoadEnd).toHaveBeenCalledWith({
            ok: false,
            error: 'Failed to load resource',
        })
    })

    it('preloads each source into the browser cache, with a result per source', async () => {
        const image = Image as any
        image.prefetch = (uri: string) =>
            uri.includes('missing')
                ? Promise.reject(new Error())
                : Promise.resolve(true)
        image.getSize = (
            _uri: string,
            success: (w: number, h: number) => void,
        ) => success(20, 10)
        const results = await FastImage.preload([
            { uri: 'https://example.com/a.jpg' },
            { uri: 'https://example.com/missing.jpg' },
            {},
            null as any,
        ])
        expect(results).toEqual([
            {
                ok: true,
                uri: 'https://example.com/a.jpg',
                width: 20,
                height: 10,
            },
            {
                ok: false,
                error: 'Failed to load the image',
                uri: 'https://example.com/missing.jpg',
            },
            { ok: false, error: 'Invalid source: no uri', uri: undefined },
            { ok: false, error: 'Invalid source: no uri', uri: undefined },
        ])
    })

    it('resolves the cache methods', async () => {
        await expect(FastImage.clearMemoryCache()).resolves.toBeUndefined()
        await expect(FastImage.clearDiskCache()).resolves.toBeUndefined()
        await expect(
            FastImage.configureCache({ maxDiskSize: 1 }),
        ).resolves.toEqual({})
        const notSupported = {
            ok: false,
            error: 'Not supported on the web',
        } as const
        await expect(
            FastImage.getCachePath({ uri: 'https://example.com/a.jpg' }),
        ).resolves.toEqual(notSupported)
        await expect(
            FastImage.writeToCache(
                { uri: 'https://example.com/a.jpg' },
                '/a.jpg',
            ),
        ).resolves.toEqual(notSupported)
    })

    it('has the same constants as native', () => {
        expect(FastImage.resizeMode.contain).toBe('contain')
        expect(FastImage.priority.high).toBe('high')
        expect(FastImage.cacheControl.web).toBe('web')
    })
})
