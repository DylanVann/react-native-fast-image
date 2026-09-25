import React from 'react'
import { StyleSheet, View } from 'react-native'
import FastImage from 'react-native-fast-image'
import Section from './Section'
import SectionFlex from './SectionFlex'
import FeatureText from './FeatureText'
import { useCacheBust } from './useCacheBust'
import { imageUrl } from './imageServer'

const IMAGE_URLS = [
    imageUrl('picsum/1015-2048x2048.jpg'),
    imageUrl('picsum/1016-2048x2048.jpg'),
    imageUrl('picsum/1018-1024x1024.jpg'),
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
