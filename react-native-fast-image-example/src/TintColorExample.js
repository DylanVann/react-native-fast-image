import React from 'react'
import { PixelRatio, StyleSheet, View } from 'react-native'
import withCacheBust from './withCacheBust'
import FastImage from 'react-native-fast-image'
import Section from './Section'
import SectionFlex from './SectionFlex'
import FeatureText from './FeatureText'

const getImageUrl = (id, width, height) =>
    `https://source.unsplash.com/${id}/${width}x${height}`
const IMAGE_SIZE = 1024
const IMAGE_SIZE_PX = PixelRatio.getPixelSizeForLayoutSize(IMAGE_SIZE)
const IMAGE_URLS = [
    getImageUrl('x58soEovG_M', IMAGE_SIZE_PX, IMAGE_SIZE_PX),
    getImageUrl('yPI7myL5eWY', IMAGE_SIZE_PX, IMAGE_SIZE_PX),
    getImageUrl('S7VCcp6KCKE', IMAGE_SIZE, IMAGE_SIZE),
]

const TintColorExample = ({ onPressReload, bust }) => (
    <View>
        <Section>
            <FeatureText text="Images with tint color" />
        </Section>
        <SectionFlex onPress={onPressReload}>
            <FastImage
                style={styles.image}
                tintColor={'green'}
                source={{
                    uri: IMAGE_URLS[0] + bust,
                    priority: FastImage.priority.low,
                }}
            />
            <FastImage
                style={styles.image}
                tintColor={'#9324c3'}
                source={{
                    uri: IMAGE_URLS[1],
                    priority: FastImage.priority.normal,
                }}
            />
            <FastImage
                style={styles.image}
                tintColor={'rgba(0,0,0,0.5)'}
                source={{
                    uri: IMAGE_URLS[2] + bust,
                    priority: FastImage.priority.high,
                }}
            />
        </SectionFlex>
    </View>
)

const styles = StyleSheet.create({
    image: {
        flex: 1,
        height: 100,
        backgroundColor: '#ddd',
        margin: 10,
    },
})

export default withCacheBust(TintColorExample)