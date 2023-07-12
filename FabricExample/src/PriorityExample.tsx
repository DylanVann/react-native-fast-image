import React from 'react'
import { PixelRatio, StyleSheet, View } from 'react-native'
import FastImage from 'react-native-fast-image'
import Section from './Section'
import SectionFlex from './SectionFlex'
import FeatureText from './FeatureText'
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
    return (
        <View>
            <Section>
                <FeatureText text="• Prioritize images (low, normal, high)." />
            </Section>
            <SectionFlex onPress={bust}>
                <FastImage
                    style={styles.image}
                    source={{
                        uri: IMAGE_URLS[0] + query,
                        priority: FastImage.priority.low,
                    }}
                />
                <FastImage
                    style={styles.image}
                    source={{
                        uri: IMAGE_URLS[1] + query,
                        priority: FastImage.priority.normal,
                    }}
                />
                <FastImage
                    style={styles.image}
                    source={{
                        uri: IMAGE_URLS[2] + query,
                        priority: FastImage.priority.high,
                    }}
                />
            </SectionFlex>
        </View>
    )
}

const styles = StyleSheet.create({
    image: {
        flex: 1,
        height: 100,
        backgroundColor: '#ddd',
        margin: 10,
        marginVertical: 20,
    },
})
