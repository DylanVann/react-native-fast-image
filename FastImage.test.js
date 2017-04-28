import 'react-native'
import React from 'react'
import renderer from 'react-test-renderer'
import FastImage from './FastImage.js'

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
      />,
    )
    .toJSON()

  expect(tree).toMatchSnapshot()
})
