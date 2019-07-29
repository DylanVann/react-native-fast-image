import { StyleSheet } from 'react-native'
import React from 'react'
import renderer from 'react-test-renderer'
import FastImage from './index.js'

const style = StyleSheet.create({ image: { width: 44, height: 44 } })

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
