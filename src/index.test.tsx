import { StyleSheet, Platform, NativeModules } from 'react-native'
import React from 'react'
import { render } from '@testing-library/react-native'
import FastImage from './index'

const style = StyleSheet.create({ image: { width: 44, height: 44 } })

function renderJSON(element: React.ReactElement) {
    const { toJSON } = render(element)
    return toJSON()
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
        const tree = renderJSON(
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

        expect(tree).toMatchSnapshot()
    })

    it('renders a normal Image when not passed a uri', () => {
        const tree = renderJSON(
            <FastImage
                source={require('../ReactNativeFastImageExampleServer/pictures/jellyfish.gif')}
                style={style.image}
            />,
        )

        expect(tree).toMatchSnapshot()
    })

    it('renders Image with fallback prop', () => {
        const tree = renderJSON(
            <FastImage
                source={require('../ReactNativeFastImageExampleServer/pictures/jellyfish.gif')}
                style={style.image}
                fallback
            />,
        )

        expect(tree).toMatchSnapshot()
    })

    it('renders defaultSource', () => {
        const tree = renderJSON(
            <FastImage
                defaultSource={require('../ReactNativeFastImageExampleServer/pictures/jellyfish.gif')}
                style={style.image}
            />,
        )

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
        NativeModules.FastImageView = {
            preload: Function.prototype,
            clearMemoryCache: Function.prototype,
            clearDiskCache: Function.prototype,
        }
    })

    it('renders a normal defaultSource', () => {
        const tree = renderJSON(
            <FastImage
                defaultSource={require('../ReactNativeFastImageExampleServer/pictures/jellyfish.gif')}
                style={style.image}
            />,
        )

        expect(tree).toMatchSnapshot()
    })

    it('renders a normal defaultSource when fails to load source', () => {
        const tree = renderJSON(
            <FastImage
                defaultSource={require('../ReactNativeFastImageExampleServer/pictures/jellyfish.gif')}
                source={{
                    uri: 'https://www.google.com/image_does_not_exist.png',
                }}
                style={style.image}
            />,
        )

        expect(tree).toMatchSnapshot()
    })

    it('renders a non-existing defaultSource', () => {
        const tree = renderJSON(
            <FastImage defaultSource={12345} style={style.image} />,
        )

        expect(tree).toMatchSnapshot()
    })
})
