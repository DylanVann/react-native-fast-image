import { Image, NativeModules, StyleSheet } from 'react-native'
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

// The props FastImage gives the native view.
function nativeProps(element: React.ReactElement) {
    const tree: any = renderer.create(element).toJSON()
    return tree.props
}

describe('FastImage', () => {
    beforeAll(() => {
        NativeModules.FastImageModule = {
            preload: async () => [],
            clearMemoryCache: async () => {},
            clearDiskCache: async () => {},
        }
    })

    it('renders the native view directly', () => {
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

    it('sends headers as a list', () => {
        const props = nativeProps(
            <FastImage
                source={{
                    uri: 'https://example.com/a.png',
                    headers: { a: '1', b: '2' },
                }}
            />,
        )
        expect(props.source.headers).toEqual([
            { name: 'a', value: '1' },
            { name: 'b', value: '2' },
        ])
    })

    it('marks any source as provided, so one without a uri fails', () => {
        expect(nativeProps(<FastImage source={{ uri: '' }} />).source).toEqual(
            expect.objectContaining({ provided: true, uri: '' }),
        )
        expect(nativeProps(<FastImage />).source).toBeUndefined()
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
            const props = nativeProps(
                <FastImage
                    source={{ uri: 'https://example.com/a.gif' }}
                    loop={loop}
                />,
            )
            expect(props.loopCount).toBe(loopCount)
        }
    })

    it('only enables progress with an onProgress handler', () => {
        const source = { uri: 'https://example.com/a.png' }
        expect(nativeProps(<FastImage source={source} />).progressEnabled).toBe(
            false,
        )
        expect(
            nativeProps(<FastImage source={source} onProgress={() => {}} />)
                .progressEnabled,
        ).toBe(true)
    })

    it('resolves require()d sources and defaultSource', () => {
        const resolveAssetSource = spyOn(
            Image,
            'resolveAssetSource',
        ).mockImplementation(
            (asset: any) =>
                ({
                    uri: `asset-${asset}`,
                    width: 10,
                    height: 20,
                    scale: 2,
                    __packager_asset: true,
                }) as any,
        )
        try {
            const props = nativeProps(
                <FastImage source={1} defaultSource={2} />,
            )
            expect(props.source).toEqual({ provided: true, uri: 'asset-1' })
            expect(props.defaultSource).toEqual({
                uri: 'asset-2',
                width: 10,
                height: 20,
                scale: 2,
                packagerAsset: true,
            })
        } finally {
            resolveAssetSource.mockRestore()
        }
    })

    it('renders FastImageBackground as a view with the image and children', () => {
        const tree = renderer
            .create(
                <FastImageBackground
                    source={{ uri: 'https://example.com/a.png' }}
                    style={style.image}
                    imageStyle={{ borderRadius: 4 }}
                >
                    <FastImage source={{ uri: 'https://example.com/b.png' }} />
                </FastImageBackground>,
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
        } finally {
            preload.mockRestore()
        }
    })

    it('runs static functions', async () => {
        await FastImage.clearMemoryCache()
        await FastImage.clearDiskCache()
    })
})

describe('FastImage children', () => {
    it('throws, pointing to FastImageBackground', () => {
        const error = spyOn(console, 'error').mockImplementation(() => {})
        try {
            expect(() =>
                renderer.create(
                    <FastImage source={{ uri: 'https://example.com/a.png' }}>
                        <FastImage />
                    </FastImage>,
                ),
            ).toThrow(/FastImageBackground/)
        } finally {
            error.mockRestore()
        }
    })
})
