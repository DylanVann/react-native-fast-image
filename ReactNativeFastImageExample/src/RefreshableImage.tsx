import React from 'react'
import { TouchableOpacity } from 'react-native'
import FastImage, { FastImageProps } from 'react-native-fast-image'
import { useCacheBust } from './useCacheBust'

interface RefreshableImageProps extends FastImageProps{
  touchableOpacityStyle?: any
}

export const RefreshableImage = ({touchableOpacityStyle,...props}: RefreshableImageProps) => {
    const { query, bust } = useCacheBust('')

    return (
        <TouchableOpacity onPress={bust} style={touchableOpacityStyle}>
            <FastImage
                {...props}
                style={{flex:1}}
                source={
                    typeof props.source === 'number'
                        ? props.source
                        : { ...props.source, uri: props.source.uri + query }
                }
            />
        </TouchableOpacity>
    )
}
