import React from 'react'
import { PixelRatio, StyleSheet, View } from 'react-native'
import FastImage from 'react-native-fast-image'
import SectionFlex from './SectionFlex'
import { ExampleCard } from './ExampleCard'
import FeatureText from './FeatureText'
import { FEATURE_COLORS, useTheme } from './theme'
import { useCacheBust } from './useCacheBust'

const getImageUrl = (id: string, width: number, height: number) =>
    `https://source.unsplash.com/${id}/${width}x${height}`
const IMAGE_SIZE = 1024
const IMAGE_SIZE_PX = PixelRatio.getPixelSizeForLayoutSize(IMAGE_SIZE)
const IMAGE_URLS = [
    getImageUrl('x58soEovG_M', IMAGE_SIZE_PX, IMAGE_SIZE_PX),
    getImageUrl('yPI7myL5eWY', IMAGE_SIZE_PX, IMAGE_SIZE_PX),
    getImageUrl('S7VCcp6KCKE', IMAGE_SIZE, IMAGE_SIZE),
]

export const PriorityExample = () => {
    const { query, bust } = useCacheBust('')
    const theme = useTheme()
    return (
        <ExampleCard
            icon="swap-vertical-outline"
            color={FEATURE_COLORS.priority}
            title="Priority"
            subtitle="Set image loading priority."
            featured
        >
            <SectionFlex onPress={bust} style={styles.row}>
                <View style={styles.col}>
                    <FastImage
                        style={[
                            styles.image,
                            { backgroundColor: theme.placeholder },
                        ]}
                        source={{
                            uri: IMAGE_URLS[0] + query,
                            priority: FastImage.priority.low,
                        }}
                    />
                    <FeatureText text="Low Priority" style={styles.caption} />
                </View>
                <View style={styles.col}>
                    <FastImage
                        style={[
                            styles.image,
                            { backgroundColor: theme.placeholder },
                        ]}
                        source={{
                            uri: IMAGE_URLS[1] + query,
                            priority: FastImage.priority.normal,
                        }}
                    />
                    <FeatureText text="Normal Priority" style={styles.caption} />
                </View>
                <View style={styles.col}>
                    <FastImage
                        style={[
                            styles.image,
                            { backgroundColor: theme.placeholder },
                        ]}
                        source={{
                            uri: IMAGE_URLS[2] + query,
                            priority: FastImage.priority.high,
                        }}
                    />
                    <FeatureText text="High Priority" style={styles.caption} />
                </View>
            </SectionFlex>
        </ExampleCard>
    )
}

const styles = StyleSheet.create({
    row: {
        paddingHorizontal: 8,
        paddingBottom: 16,
    },
    col: {
        flex: 1,
        alignItems: 'center',
    },
    image: {
        width: '100%',
        height: 90,
        borderRadius: 12,
        marginHorizontal: 4,
    },
    caption: {
        fontSize: 12,
        fontWeight: '600',
        textAlign: 'center',
        marginTop: 6,
    },
})
