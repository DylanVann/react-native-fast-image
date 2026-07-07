import React from 'react'
import { StyleSheet } from 'react-native'
import SectionFlex from './SectionFlex'
import FastImage from 'react-native-fast-image'
import { ExampleCard } from './ExampleCard'
import { FEATURE_COLORS, useTheme } from './theme'
import { useCacheBust } from './useCacheBust'

const IMAGE_URL = 'https://media.giphy.com/media/GEsoqZDGVoisw/giphy.gif'

export const BorderRadiusExample = () => {
    const { query, bust } = useCacheBust('')
    const theme = useTheme()
    return (
        <ExampleCard
            icon="scan-outline"
            color={FEATURE_COLORS.borderRadius}
            title="Border Radius"
            subtitle="Apply beautiful border radius."
        >
            <SectionFlex onPress={bust} style={styles.row}>
                <FastImage
                    style={[
                        styles.imageSquare,
                        { backgroundColor: theme.placeholder },
                    ]}
                    source={{
                        uri: IMAGE_URL + query,
                    }}
                />
                <FastImage
                    style={[
                        styles.imageRectangular,
                        { backgroundColor: theme.placeholder },
                    ]}
                    source={{
                        uri: IMAGE_URL + query,
                    }}
                />
            </SectionFlex>
        </ExampleCard>
    )
}

const styles = StyleSheet.create({
    row: {
        paddingBottom: 16,
    },
    imageSquare: {
        borderRadius: 50,
        height: 100,
        margin: 8,
        width: 100,
        flex: 0,
    },
    imageRectangular: {
        borderRadius: 50,
        borderTopLeftRadius: 10,
        borderBottomRightRadius: 10,
        height: 100,
        margin: 8,
        flex: 1,
    },
})
