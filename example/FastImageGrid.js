// @flow
import React from 'react'
import FastImage from 'react-native-fast-image'
import Icon from 'react-native-vector-icons/Ionicons'
import ImageGrid from './ImageGrid'

const FastImageGrid = () => <ImageGrid ImageComponent={FastImage} />

FastImageGrid.navigationOptions = {
  tabBarLabel: 'FastImage Grid',
  tabBarIcon: ({ focused, tintColor }) => {
    if (focused) return <Icon name="ios-photos" size={26} color={tintColor} />
    return <Icon name="ios-photos-outline" size={26} color={tintColor} />
  },
}

export default FastImageGrid
