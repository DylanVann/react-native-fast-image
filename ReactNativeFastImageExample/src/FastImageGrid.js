import React from 'react'
import FastImage from 'react-native-fast-image'
import Icon from './Icons/Icon'
import ImageGrid from './ImageGrid'

const FastImageGrid = () => <ImageGrid ImageComponent={FastImage} />

FastImageGrid.navigationOptions = {
    tabBarLabel: 'FastImage Grid',
    tabBarIcon: props => <Icon name="ios-photos" {...props} />,
}

export default FastImageGrid
