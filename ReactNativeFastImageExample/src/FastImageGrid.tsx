import React from 'react'
import FastImage from 'react-native-fast-image'
import { ImageGrid } from './ImageGrid'

const FastImageGrid = ({ rows }: { rows?: number }) => (
    <ImageGrid
        ImageComponent={FastImage}
        testIDPrefix="fastimage-grid"
        rows={rows}
    />
)

export default FastImageGrid
