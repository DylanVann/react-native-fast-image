import { StyleSheet, Platform } from 'react-native'
import React from 'react'
import renderer from 'react-test-renderer'
import FastImage from './index'

Platform.OS = 'ios'

const style = StyleSheet.create({
    image: { width: 44, height: 44 },
    tint: { tintColor: '#f00' },
})

test('FastImage renders correctly.', () => {
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

test('Renders a normal Image when not passed a uri.', () => {
    const tree = renderer
        .create(
            <FastImage
                source={require('../ReactNativeFastImageExampleServer/pictures/jellyfish.gif')}
                style={style.image}
            />,
        )
        .toJSON()

    expect(tree).toMatchSnapshot()
})

test('Renders Image with fallback prop.', () => {
    const tree = renderer
        .create(
            <FastImage
                source={require('../ReactNativeFastImageExampleServer/pictures/jellyfish.gif')}
                style={style.image}
                fallback
            />,
        )
        .toJSON()

    expect(tree).toMatchSnapshot()
})

test('Renders a normal defaultSource.', () => {
    const tree = renderer
        .create(
            <FastImage
                defaultSource={require('../ReactNativeFastImageExampleServer/pictures/jellyfish.gif')}
                style={style.image}
                fallback
            />,
        )
        .toJSON()

    expect(tree).toMatchSnapshot()
})

test('Renders a normal defaultSource when fails to load source.', () => {
    const tree = renderer
        .create(
            <FastImage
                defaultSource={require('../ReactNativeFastImageExampleServer/pictures/jellyfish.gif')}
                source={{
                    uri: 'https://www.google.com/image_does_not_exist.png',
                }}
                style={style.image}
                fallback
            />,
        )
        .toJSON()

    expect(tree).toMatchSnapshot()
})

test('Renders a normal Image with tintColor when passed as prop.', () => {
    const tree = renderer
        .create(
            <FastImage
                source={require('../ReactNativeFastImageExampleServer/pictures/jellyfish.gif')}
                tintColor={'#f00'}
            />,
        )
        .toJSON()

    expect(tree).toMatchSnapshot()
})

test('Renders a normal Image with tintColor when passed as style.', () => {
    const tree = renderer
        .create(
            <FastImage
                source={require('../ReactNativeFastImageExampleServer/pictures/jellyfish.gif')}
                style={[style.image, style.tint]}
            />,
        )
        .toJSON()

    expect(tree).toMatchSnapshot()
})
