import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import SectionFlex from './SectionFlex'
import FastImage from 'react-native-fast-image'
import Section from './Section'
import FeatureText from './FeatureText'
import Button from './Button'
// @ts-ignore
import { createImageProgress } from 'react-native-image-progress'
import { useCacheBust } from './useCacheBust'

const IMAGE_URL =
    'https://cdn-images-1.medium.com/max/1600/1*-CY5bU4OqiJRox7G00sftw.gif'

const Image = createImageProgress(FastImage)

export const PreloadExample = () => {
    const [show, setShow] = useState(false)
    const { url, bust } = useCacheBust(IMAGE_URL)

    const preload = () => {
        FastImage.preload([{ uri: url }])
    }

    return (
        <View>
            <Section>
                <FeatureText text="• Preloading." />
                <FeatureText text="• Progress indication using react-native-image-progress." />
            </Section>
            <SectionFlex style={styles.section}>
                {show ? (
                    <Image style={styles.image} source={{ uri: url }} />
                ) : (
                    <View style={styles.image} />
                )}
                <View style={styles.buttons}>
                    <View style={styles.buttonView}>
                        <Button text="Bust" onPress={bust} />
                    </View>
                    <View style={styles.buttonView}>
                        <Button text="Preload" onPress={preload} />
                    </View>
                    <View style={styles.buttonView}>
                        <Button
                            text={show ? 'Hide' : 'Show'}
                            onPress={() => setShow((v) => !v)}
                        />
                    </View>
                </View>
            </SectionFlex>
        </View>
    )
}

const styles = StyleSheet.create({
    buttonView: { flex: 1 },
    section: {
        flexDirection: 'column',
        alignItems: 'center',
    },
    buttons: {
        flexDirection: 'row',
        marginHorizontal: 20,
        marginBottom: 10,
    },
    image: {
        backgroundColor: '#ddd',
        margin: 20,
        marginBottom: 10,
        height: 100,
        width: 100,
    },
})
