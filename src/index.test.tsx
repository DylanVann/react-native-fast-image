import { StyleSheet } from 'react-native'
import React from 'react'
import renderer from 'react-test-renderer'
import { FastImage, priority } from './index'

const style = StyleSheet.create({ image: { width: 44, height: 44 } })

test('renders', () => {
    const tree = renderer
        .create(
            <FastImage
                source={{
                    uri: 'https://facebook.github.io/react/img/logo_og.png',
                    headers: {
                        token: 'someToken',
                    },
                    priority: priority.high,
                }}
                style={style.image}
            />,
        )
        .toJSON()

    expect(tree).toMatchInlineSnapshot(`
        <View
          style={
            Array [
              Object {
                "overflow": "hidden",
              },
              Object {
                "height": 44,
                "width": 44,
              },
            ]
          }
        >
          <FastImageView
            resizeMode="cover"
            source={
              Object {
                "headers": Object {
                  "token": "someToken",
                },
                "priority": "high",
                "uri": "https://facebook.github.io/react/img/logo_og.png",
              }
            }
            style={
              Object {
                "bottom": 0,
                "left": 0,
                "position": "absolute",
                "right": 0,
                "top": 0,
              }
            }
          />
        </View>
    `)
})

test('renders a normal Image when not passed a uri', () => {
    const tree = renderer
        .create(
            <FastImage
                source={require('../ReactNativeFastImageExampleServer/pictures/jellyfish.gif')}
                style={style.image}
            />,
        )
        .toJSON()

    expect(tree).toMatchInlineSnapshot(`
        <View
          style={
            Array [
              Object {
                "overflow": "hidden",
              },
              Object {
                "height": 44,
                "width": 44,
              },
            ]
          }
        >
          <FastImageView
            resizeMode="cover"
            source={
              Object {
                "testUri": "../../../ReactNativeFastImageExampleServer/pictures/jellyfish.gif",
              }
            }
            style={
              Object {
                "bottom": 0,
                "left": 0,
                "position": "absolute",
                "right": 0,
                "top": 0,
              }
            }
          />
        </View>
    `)
})

test('renders Image with fallback prop', () => {
    const tree = renderer
        .create(
            <FastImage
                source={require('../ReactNativeFastImageExampleServer/pictures/jellyfish.gif')}
                style={style.image}
                fallback
            />,
        )
        .toJSON()

    expect(tree).toMatchInlineSnapshot(`
        <View
          style={
            Array [
              Object {
                "overflow": "hidden",
              },
              Object {
                "height": 44,
                "width": 44,
              },
            ]
          }
        >
          <Image
            resizeMode="cover"
            source={
              Object {
                "testUri": "../../../ReactNativeFastImageExampleServer/pictures/jellyfish.gif",
              }
            }
            style={
              Object {
                "bottom": 0,
                "left": 0,
                "position": "absolute",
                "right": 0,
                "top": 0,
              }
            }
          />
        </View>
    `)
})
