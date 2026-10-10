import { Image, Text } from 'react-native'
import React from 'react'
import { describe, expect, it, mock } from 'bun:test'
import renderer, { act } from 'react-test-renderer'
// The stand-in for react-native-web's asset registry (test/setup.ts).
// @ts-expect-error react-native-web has no type declarations.
import { registerAsset } from 'react-native-web/dist/modules/AssetRegistry'
import FastImage, { FastImageBackground } from './index.web'

// Renders with effects run, as in a browser.
function render(element: React.ReactElement, options?: any) {
    let tree: renderer.ReactTestRenderer | undefined
    act(() => {
        tree = renderer.create(element, options)
    })
    return tree as renderer.ReactTestRenderer
}

const hosts = (tree: renderer.ReactTestRenderer, type: string) =>
    tree.root.findAll((node) => node.type === (type as any))

const images = (tree: renderer.ReactTestRenderer) => hosts(tree, 'img')

// The load handling waits for the image to be decoded.
const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 10))

const A = { uri: 'https://example.com/a.jpg' }

describe('FastImage (web)', () => {
    it('renders the image in an <img>, in a View with the View props', () => {
        const tree = render(
            <FastImage
                source={{
                    uri: 'https://example.com/a.jpg',
                    headers: { token: 'a' },
                    priority: 'high',
                    cache: 'immutable',
                }}
                resizeMode="contain"
                blurRadius={4}
                style={{ width: 40, height: 30 }}
                testID="image"
                accessibilityLabel="An image"
                transition={300}
                downsample
                loop={false}
                paused
                recyclingKey="row"
            />,
        )
        const [view] = hosts(tree, 'View')
        expect(view.props.testID).toBe('image')
        expect(view.props['aria-label']).toBe('An image')
        expect(view.props.accessibilityLabel).toBeUndefined()
        expect(view.props.style).toEqual([
            { overflow: 'hidden' },
            { width: 40, height: 30 },
        ])
        for (const name of [
            'transition',
            'downsample',
            'loop',
            'paused',
            'recyclingKey',
            'headers',
        ]) {
            expect(view.props[name]).toBeUndefined()
        }
        const [img] = images(tree)
        expect(images(tree)).toHaveLength(1)
        expect(img.props.src).toBe('https://example.com/a.jpg')
        expect(img.props.alt).toBe('An image')
        expect(img.props.draggable).toBe(false)
        expect(img.props.loading).toBeUndefined()
        expect(img.props.style).toEqual({
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            filter: 'blur(4px)',
            opacity: undefined,
        })
    })

    it('fits the image as resizeMode says, covering by default', () => {
        const fit = (mode?: any) =>
            images(render(<FastImage source={A} resizeMode={mode} />))[0].props
                .style.objectFit
        expect(fit()).toBe('cover')
        expect(fit('cover')).toBe('cover')
        expect(fit('contain')).toBe('contain')
        expect(fit('stretch')).toBe('fill')
        // At its size, scaled down if it's larger than the view.
        expect(fit('center')).toBe('scale-down')
    })

    it('fits the image as objectFit says, CSS object-fit', () => {
        const fit = (props: object) =>
            images(render(<FastImage source={A} {...props} />))[0].props.style
                .objectFit
        for (const value of [
            'fill',
            'contain',
            'cover',
            'none',
            'scale-down',
        ]) {
            expect(fit({ objectFit: value })).toBe(value)
        }
        // In style, where the prop wins; either one wins over resizeMode.
        expect(
            fit({ style: [{ objectFit: 'contain' }, { objectFit: 'none' }] }),
        ).toBe('none')
        expect(fit({ objectFit: 'fill', style: { objectFit: 'none' } })).toBe(
            'fill',
        )
        expect(fit({ objectFit: 'contain', resizeMode: 'repeat' })).toBe(
            'contain',
        )
        // An unknown value leaves resizeMode.
        expect(fit({ objectFit: 'tile', resizeMode: 'center' })).toBe(
            'scale-down',
        )
    })

    it('tints the image with an SVG filter, after the blur', () => {
        const tree = render(
            <FastImage source={A} tintColor="red" blurRadius={2} />,
        )
        const [filter] = hosts(tree, 'filter')
        expect(images(tree)[0].props.style.filter).toBe(
            `blur(2px) url(#${filter.props.id})`,
        )
        expect(hosts(tree, 'feFlood')[0].props.floodColor).toBe('red')
        expect(hosts(tree, 'feComposite')[0].props).toEqual({
            in2: 'SourceAlpha',
            operator: 'in',
        })
        // Each image has its own.
        const other = hosts(
            render(<FastImage source={A} tintColor="red" />),
            'filter',
        )[0]
        expect(other.props.id).not.toBe(filter.props.id)
        expect(hosts(render(<FastImage source={A} />), 'svg')).toHaveLength(0)
    })

    it("loads a require()d image from the asset registry, or the bundler's uri", () => {
        // On the web, a bundler's asset (Metro's, without Expo) is in
        // react-native-web's registry: the file for the scale closest to the
        // screen's (2 in the tests).
        const id = registerAsset({
            httpServerLocation: '/assets/images',
            name: 'logo',
            type: 'png',
            scales: [1, 2, 3],
        })
        const src = (source: any) =>
            images(render(<FastImage source={source} />))[0]?.props.src
        expect(src(id)).toBe('/assets/images/logo@2x.png')
        const single = registerAsset({
            httpServerLocation: '/assets',
            name: 'icon',
            type: 'png',
            scales: [1],
        })
        expect(src(single)).toBe('/assets/icon.png')
        // Expo makes it an object.
        expect(src({ uri: '/assets/logo.png', width: 10, height: 10 })).toBe(
            '/assets/logo.png',
        )
        // An unknown asset, or a source without a uri, shows nothing.
        expect(src(999)).toBeUndefined()
        expect(src({})).toBeUndefined()
        // An array of one is that source.
        expect(src([A])).toBe(A.uri)
        // An SVG's markup in a data uri is escaped.
        expect(src({ uri: 'data:image/svg+xml;utf8,<svg fill="#f00"/>' })).toBe(
            'data:image/svg+xml;utf8,%3Csvg%20fill%3D%22%23f00%22%2F%3E',
        )
    })

    it('shows defaultSource until the image loads, and if it fails', async () => {
        const tree = render(
            <FastImage
                source={A}
                defaultSource={{ uri: '/assets/placeholder.png' } as any}
                resizeMode="contain"
                accessibilityLabel="An image"
            />,
        )
        let [placeholder, image] = images(tree)
        expect(placeholder.props.src).toBe('/assets/placeholder.png')
        expect(placeholder.props.style.objectFit).toBe('contain')
        // The image has the label.
        expect(placeholder.props.alt).toBe('')
        expect(image.props.alt).toBe('An image')
        // Under the image, which shows as it loads (the browser draws it over
        // defaultSource), and replaces it once it has loaded.
        expect(image.props.src).toBe(A.uri)
        expect(image.props.style.opacity).toBeUndefined()
        act(() => {
            image.props.onLoad({
                currentTarget: { naturalWidth: 4, naturalHeight: 3 },
            })
        })
        await act(settled)
        expect(images(tree)).toHaveLength(1)
        expect(images(tree)[0].props.style.opacity).toBeUndefined()

        // A new image that fails.
        act(() => {
            tree.update(
                <FastImage
                    source={{ uri: 'https://example.com/missing.jpg' }}
                    defaultSource={{ uri: '/assets/placeholder.png' } as any}
                />,
            )
        })
        ;[placeholder, image] = images(tree)
        expect(placeholder.props.src).toBe('/assets/placeholder.png')
        act(() => {
            image.props.onError({ currentTarget: {} })
        })
        ;[placeholder, image] = images(tree)
        expect(placeholder.props.src).toBe('/assets/placeholder.png')
        expect(image.props.style.opacity).toBe(0)

        // Without an image, it shows, with the label.
        const alone = images(
            render(
                <FastImage
                    defaultSource={{ uri: '/assets/placeholder.png' } as any}
                    accessibilityLabel="An image"
                />,
            ),
        )
        expect(alone).toHaveLength(1)
        expect(alone[0].props.alt).toBe('An image')
    })

    it("hides an image that failed (the browser's broken image)", () => {
        const tree = render(<FastImage source={A} accessibilityLabel="A" />)
        act(() => {
            images(tree)[0].props.onError({ currentTarget: {} })
        })
        expect(images(tree)[0].props.style.opacity).toBe(0)
    })

    it('tiles the image as a CSS background for resizeMode repeat', () => {
        const tree = render(
            <FastImage source={A} resizeMode="repeat" tintColor="red" />,
        )
        const [tiles] = hosts(tree, 'div')
        const [filter] = hosts(tree, 'filter')
        expect(tiles.props.style).toEqual({
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundImage: `url("${A.uri}")`,
            backgroundRepeat: 'repeat',
            backgroundPosition: '0',
            backgroundSize: undefined,
            filter: `url(#${filter.props.id})`,
            opacity: undefined,
        })
        // The <img> is on top, transparent, for its events and the browser.
        const [img] = images(tree)
        expect(img.props.src).toBe(A.uri)
        expect(img.props.style.opacity).toBe(0)
    })

    it('renders children on top of the image', () => {
        const tree = render(
            <FastImage source={A}>
                <Text>on top</Text>
            </FastImage>,
        )
        expect(hosts(tree, 'Text')).toHaveLength(1)
        const background = render(
            <FastImageBackground source={A}>
                <Text>on top</Text>
            </FastImageBackground>,
        )
        expect(hosts(background, 'Text')).toHaveLength(1)
    })

    const sizes = [
        { uri: 'https://example.com/100.png', width: 100, height: 100 },
        { uri: 'https://example.com/300.png', width: 300, height: 300 },
        {
            uri: 'https://example.com/450.png',
            width: 300,
            height: 300,
            scale: 1.5,
        },
    ]

    it('gives the browser several sizes to pick from (srcset)', () => {
        const [img] = images(render(<FastImage source={sizes} />))
        expect(img.props.srcSet).toBe(
            'https://example.com/100.png 100w, https://example.com/300.png 300w, https://example.com/450.png 450w',
        )
        // The width it's laid out at; auto needs a lazy image.
        expect(img.props.sizes).toBe('auto, 100vw')
        expect(img.props.loading).toBe('lazy')
        // Without srcset support, the largest.
        expect(img.props.src).toBe('https://example.com/450.png')
    })

    it('sends onLoad and then onLoadEnd as native does, with the size', async () => {
        const events: unknown[] = []
        const tree = render(
            <FastImage
                source={A}
                onLoad={(event) => events.push(['onLoad', event])}
                onLoadEnd={(result) => events.push(['onLoadEnd', result])}
            />,
        )
        act(() => {
            images(tree)[0].props.onLoad({
                currentTarget: {
                    naturalWidth: 40,
                    naturalHeight: 30,
                    currentSrc: A.uri,
                    decode: () => Promise.resolve(),
                },
            })
        })
        expect(events).toEqual([])
        await act(settled)
        expect(events).toEqual([
            ['onLoad', { nativeEvent: { width: 40, height: 30 } }],
            ['onLoadEnd', { ok: true, width: 40, height: 30 }],
        ])
    })

    it('sends the size of the one the browser picked, in pixels, of several', async () => {
        const onLoad = mock()
        const tree = render(<FastImage source={sizes} onLoad={onLoad} />)
        act(() => {
            // At 1.5x density, the 450 px image is 300 CSS px wide.
            images(tree)[0].props.onLoad({
                currentTarget: {
                    naturalWidth: 300,
                    naturalHeight: 300,
                    currentSrc: 'https://example.com/450.png',
                },
            })
        })
        await act(settled)
        expect(onLoad).toHaveBeenCalledWith({
            nativeEvent: { width: 450, height: 450 },
        })
    })

    it('sends onError and onLoadEnd as native does', async () => {
        const onError = mock()
        const onLoadEnd = mock()
        const uri = 'https://example.com/missing.jpg'
        const tree = render(
            <FastImage
                source={{ uri }}
                onError={onError}
                onLoadEnd={onLoadEnd}
            />,
        )
        act(() => {
            images(tree)[0].props.onError({
                currentTarget: { currentSrc: uri },
            })
        })
        expect(onError).toHaveBeenCalledWith({
            nativeEvent: { error: `Failed to load resource ${uri}` },
        })
        expect(onLoadEnd).toHaveBeenCalledWith({
            ok: false,
            error: `Failed to load resource ${uri}`,
        })
    })

    it('loads each new image in a new <img>, with onLoadStart', async () => {
        const onLoadStart = mock()
        const onLoad = mock()
        // Called for each <img> mounted (for its ref).
        const mounted = mock(() => ({}))
        const tree = render(
            <FastImage source={A} onLoadStart={onLoadStart} onLoad={onLoad} />,
            { createNodeMock: mounted },
        )
        const firstLoad = images(tree)[0].props.onLoad
        expect(mounted).toHaveBeenCalledTimes(1)
        expect(onLoadStart).toHaveBeenCalledTimes(1)
        // The same image: nothing new.
        act(() => {
            tree.update(
                <FastImage
                    source={{ ...A }}
                    onLoadStart={onLoadStart}
                    onLoad={onLoad}
                />,
            )
        })
        expect(mounted).toHaveBeenCalledTimes(1)
        expect(onLoadStart).toHaveBeenCalledTimes(1)
        act(() => {
            tree.update(
                <FastImage
                    source={{ uri: 'https://example.com/b.jpg' }}
                    onLoadStart={onLoadStart}
                    onLoad={onLoad}
                />,
            )
        })
        expect(mounted).toHaveBeenCalledTimes(2)
        expect(onLoadStart).toHaveBeenCalledTimes(2)
        expect(images(tree)[0].props.src).toBe('https://example.com/b.jpg')
        // The replaced image's load doesn't count.
        act(() => {
            firstLoad({ currentTarget: { naturalWidth: 1, naturalHeight: 1 } })
        })
        await act(settled)
        expect(onLoad).not.toHaveBeenCalled()
    })

    it('keeps the <img> for new sizes, which the browser shows when loaded', () => {
        const onLoadStart = mock()
        const mounted = mock(() => ({}))
        const tree = render(
            <FastImage source={sizes} onLoadStart={onLoadStart} />,
            { createNodeMock: mounted },
        )
        act(() => {
            tree.update(
                <FastImage
                    source={sizes.map((size) => ({
                        ...size,
                        uri: `${size.uri}?b`,
                    }))}
                    onLoadStart={onLoadStart}
                />,
            )
        })
        expect(mounted).toHaveBeenCalledTimes(1)
        expect(onLoadStart).toHaveBeenCalledTimes(2)
        expect(images(tree)[0].props.src).toBe('https://example.com/450.png?b')
    })

    it('sends onLoad for an image that loaded before it mounted, once', async () => {
        const onLoad = mock()
        // In a page rendered on a server, the image can load before React
        // handles its events. One from the memory cache has loaded when it
        // mounts, and also sends a load event.
        const loaded = {
            complete: true,
            naturalWidth: 8,
            naturalHeight: 6,
            currentSrc: A.uri,
        }
        const tree = render(<FastImage source={A} onLoad={onLoad} />, {
            createNodeMock: () => loaded,
        })
        await act(settled)
        expect(onLoad).toHaveBeenCalledTimes(1)
        expect(onLoad).toHaveBeenCalledWith({
            nativeEvent: { width: 8, height: 6 },
        })
        act(() => {
            images(tree)[0].props.onLoad({ currentTarget: loaded })
        })
        await act(settled)
        expect(onLoad).toHaveBeenCalledTimes(1)
    })

    it('sends onLoad for new sizes when the browser keeps the same file', async () => {
        // The browser fires load for each new srcset, also when it picks the
        // file it already shows (e.g. a larger size added to the list).
        const onLoad = mock()
        const onLoadEnd = mock()
        const tree = render(
            <FastImage source={sizes} onLoad={onLoad} onLoadEnd={onLoadEnd} />,
        )
        const picked = {
            naturalWidth: 300,
            naturalHeight: 300,
            currentSrc: 'https://example.com/300.png',
        }
        act(() => {
            images(tree)[0].props.onLoad({ currentTarget: picked })
        })
        await act(settled)
        act(() => {
            tree.update(
                <FastImage
                    source={[
                        ...sizes,
                        { uri: 'https://example.com/900.png', width: 900 },
                    ]}
                    onLoad={onLoad}
                    onLoadEnd={onLoadEnd}
                />,
            )
        })
        act(() => {
            images(tree)[0].props.onLoad({ currentTarget: picked })
        })
        await act(settled)
        expect(onLoad).toHaveBeenCalledTimes(2)
        expect(onLoadEnd).toHaveBeenCalledTimes(2)
    })

    it('sends onError for an image that failed before it mounted', async () => {
        // In a page rendered on a server: a broken image is complete with no
        // size, and doesn't decode.
        const onError = mock()
        const onLoadEnd = mock()
        const tree = render(
            <FastImage
                source={A}
                defaultSource={{ uri: '/assets/placeholder.png' } as any}
                onError={onError}
                onLoadEnd={onLoadEnd}
            />,
            {
                createNodeMock: () => ({
                    complete: true,
                    naturalWidth: 0,
                    naturalHeight: 0,
                    currentSrc: A.uri,
                    decode: () => Promise.reject(new Error('EncodingError')),
                }),
            },
        )
        await act(settled)
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onLoadEnd).toHaveBeenCalledWith({
            ok: false,
            error: `Failed to load resource ${A.uri}`,
        })
        // Hidden, over defaultSource.
        const [placeholder, image] = images(tree)
        expect(placeholder.props.src).toBe('/assets/placeholder.png')
        expect(image.props.style.opacity).toBe(0)
    })

    it('sends onLoad for an SVG without a size that loaded before it mounted', async () => {
        // Some browsers give it no natural size; it decodes.
        const onLoad = mock()
        const onError = mock()
        render(<FastImage source={A} onLoad={onLoad} onError={onError} />, {
            createNodeMock: () => ({
                complete: true,
                naturalWidth: 0,
                naturalHeight: 0,
                currentSrc: A.uri,
                decode: () => Promise.resolve(),
            }),
        })
        await act(settled)
        expect(onLoad).toHaveBeenCalledTimes(1)
        expect(onError).not.toHaveBeenCalled()
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
        await expect(FastImage.clearMemoryCache()).resolves.toEqual({
            ok: false,
            error: 'Not supported on the web',
        })
        await expect(FastImage.clearDiskCache()).resolves.toEqual({
            ok: false,
            error: 'Not supported on the web',
        })
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
