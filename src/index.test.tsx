import { Image, StyleSheet, Platform, NativeModules } from 'react-native'
import React from 'react'
import renderer from 'react-test-renderer'
import FastImage from './index'

const style = StyleSheet.create({ image: { width: 44, height: 44 } })

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

        expect(tree).toMatchSnapshot()
    })

    it('passes a required (numeric) source to Image when using fallback', () => {
        const resolveAssetSource = jest
            .spyOn(Image, 'resolveAssetSource')
            .mockImplementation(
                (asset: any) => ({ uri: `asset-${asset}` }) as any,
            )
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
        const flatten = jest
            .spyOn(StyleSheet, 'flatten')
            .mockImplementation((s: any) =>
                s === 7 ? ({ tintColor: 'purple' } as any) : s,
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

        expect(tree).toMatchSnapshot()
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

        expect(tree).toMatchSnapshot()
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

        expect(tree).toMatchSnapshot()
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

        expect(tree).toMatchSnapshot()
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

        expect(tree).toMatchSnapshot()
    })

    it('renders a non-existing defaultSource', () => {
        const tree = renderer
            .create(<FastImage defaultSource={12345} style={style.image} />)
            .toJSON()

        expect(tree).toMatchSnapshot()
    })
})
