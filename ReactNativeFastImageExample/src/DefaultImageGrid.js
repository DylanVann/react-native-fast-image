// @flow
import React from 'react'
import { Image } from 'react-native'
import Icon from './Icons/Icon'
import ImageGrid from './ImageGrid'

const DefaultImageGrid = () => <ImageGrid ImageComponent={Image} />

DefaultImageGrid.navigationOptions = {
    tabBarLabel: 'Image Grid',
    tabBarIcon: props => <Icon name="ios-image" {...props} />,
}

export default DefaultImageGrid
