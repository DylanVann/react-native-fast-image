import React from 'react'
import { StyleSheet, View } from 'react-native'
import SectionFlex from './SectionFlex'
import FastImage from 'react-native-fast-image'
import Section from './Section'
import FeatureText from './FeatureText'
import { useCacheBust } from './useCacheBust'
import { imageUrl } from './imageServer'
import { useLoads } from './RunnerContext'

const IMAGE_URL = imageUrl('picsum/1025-200x200.jpg')

export const BorderRadiusExample = () => {
    const { query, bust } = useCacheBust('')
    const onLoad = useLoads('border-radius', 4)
    return (
        <View>
            <Section>
                <FeatureText text="• Border radius." />
            </Section>
            <SectionFlex onPress={bust}>
                <FastImage
                    style={styles.imageSquare}
                    source={{
                        uri: IMAGE_URL + query,
                    }}
                    onLoad={onLoad}
                />
                <FastImage
                    style={styles.imageRectangular}
                    source={{
                        uri: IMAGE_URL + query,
                    }}
                    onLoad={onLoad}
                />
            </SectionFlex>
            {/* A border with a radius (#757), and a radius with a scale
                transform (#870). */}
            <SectionFlex onPress={bust}>
                <FastImage
                    style={styles.imageBorder}
                    source={{
                        uri: IMAGE_URL + query,
                    }}
                    onLoad={onLoad}
                />
                <FastImage
                    style={styles.imageScaled}
                    source={{
                        uri: IMAGE_URL + query,
                    }}
                    onLoad={onLoad}
                />
            </SectionFlex>
        </View>
    )
}

const styles = StyleSheet.create({
    imageSquare: {
        borderRadius: 50,
        height: 100,
        backgroundColor: '#ddd',
        margin: 20,
        width: 100,
        flex: 0,
    },
    imageRectangular: {
        borderRadius: 50,
        borderTopLeftRadius: 10,
        borderBottomRightRadius: 10,
        height: 100,
        backgroundColor: '#ddd',
        margin: 20,
        flex: 1,
    },
    imageBorder: {
        borderRadius: 24,
        borderWidth: 4,
        borderColor: 'red',
        height: 80,
        backgroundColor: '#ddd',
        margin: 20,
        width: 80,
    },
    imageScaled: {
        borderRadius: 40,
        borderWidth: 4,
        borderColor: 'red',
        height: 80,
        backgroundColor: '#ddd',
        margin: 20,
        width: 80,
        transform: [{ scale: 0.9 }],
    },
    plus: {
        width: 30,
        height: 30,
        position: 'absolute',
        bottom: 0,
        right: 0,
    },
})
