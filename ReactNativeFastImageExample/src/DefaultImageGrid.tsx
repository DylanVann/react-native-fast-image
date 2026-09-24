import React from 'react'
import { Image } from 'react-native'
import { ImageGrid } from './ImageGrid'

const DefaultImageGrid = () => (
    <ImageGrid ImageComponent={Image} testIDPrefix="image-grid" />
)

export default DefaultImageGrid
