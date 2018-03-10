// @flow
import React from 'react'
import { Image } from 'react-native'
import Icon from 'react-native-vector-icons/Ionicons'
import ImageGrid from './ImageGrid'

const DefaultImageGrid = () => <ImageGrid ImageComponent={Image} />

DefaultImageGrid.navigationOptions = {
  tabBarLabel: 'Image Grid',
  tabBarIcon: ({ focused, tintColor }) => {
    if (focused) return <Icon name="ios-image" size={26} color={tintColor} />
    return <Icon name="ios-image-outline" size={26} color={tintColor} />
  },
}

export default DefaultImageGrid
