import React, { useCallback, useMemo, useState } from 'react'
import { StyleSheet } from 'react-native'
import SectionFlex from './SectionFlex'
import FastImage, { FastImageProps } from 'react-native-fast-image'
import { ExampleCard } from './ExampleCard'
import { FEATURE_COLORS } from './theme'
import { useCacheBust } from './useCacheBust'

const GIF_URL =
    'https://cdn-images-1.medium.com/max/1600/1*-CY5bU4OqiJRox7G00sftw.gif'

interface AutoSizingImageProps extends FastImageProps {
    onLoad?: (event: any) => void
    defaultHeight?: number
    width: number
    style?: any
}

const AutoSizingImage = (props: AutoSizingImageProps) => {
    const [dimensions, setDimensions] = useState({
        height: 0,
        width: 0,
    })

    const propsOnLoad = props.onLoad
    const onLoad = useCallback(
        (e: any) => {
            const {
                nativeEvent: { width, height },
            } = e
            setDimensions({ width, height })
            if (propsOnLoad) {
                propsOnLoad(e)
            }
        },
        [propsOnLoad],
    )

    const height = useMemo(() => {
        if (!dimensions.height) {
            return props.defaultHeight === undefined ? 300 : props.defaultHeight
        }
        const ratio = dimensions.height / dimensions.width
        return props.width * ratio
    }, [dimensions.height, dimensions.width, props.defaultHeight, props.width])
    return (
        <FastImage
            {...props}
            onLoad={onLoad}
            style={[{ width: props.width, height }, props.style]}
        />
    )
}

export const AutoSizeExample = () => {
    const { bust, url } = useCacheBust(GIF_URL)
    return (
        <ExampleCard
            icon="aperture-outline"
            color={FEATURE_COLORS.autoSize}
            title="Auto Size"
            subtitle="Resizes to fit the source image's aspect ratio."
        >
            <SectionFlex onPress={bust} style={styles.row}>
                <AutoSizingImage
                    style={styles.image}
                    width={200}
                    source={{ uri: url }}
                />
            </SectionFlex>
        </ExampleCard>
    )
}

const styles = StyleSheet.create({
    row: {
        paddingBottom: 16,
    },
    image: {
        borderRadius: 12,
        margin: 20,
        flex: 0,
    },
})
