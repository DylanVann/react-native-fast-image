import React from 'react'
import { StyleSheet } from 'react-native'
import SectionFlex from './SectionFlex'
import FastImage from 'react-native-fast-image'
import { ExampleCard } from './ExampleCard'
import { FEATURE_COLORS, useTheme } from './theme'
import { useCacheBust } from './useCacheBust'

const GIF_URL =
    'https://cdn-images-1.medium.com/max/1600/1*-CY5bU4OqiJRox7G00sftw.gif'

export const GifExample = () => {
    const { url, bust } = useCacheBust(GIF_URL)
    const theme = useTheme()
    return (
        <ExampleCard
            label="GIF"
            color={FEATURE_COLORS.gif}
            title="GIF Support"
            subtitle="GIF images are supported."
        >
            <SectionFlex onPress={bust} style={styles.row}>
                <FastImage
                    style={[styles.image, { backgroundColor: theme.placeholder }]}
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
        height: 100,
        width: 100,
        flex: 0,
    },
})
