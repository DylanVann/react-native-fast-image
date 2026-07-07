import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import SectionFlex from './SectionFlex'
import FastImage from 'react-native-fast-image'
import { ExampleCard } from './ExampleCard'
import { FEATURE_COLORS, useTheme } from './theme'
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
    const theme = useTheme()

    const preload = () => {
        FastImage.preload([{ uri: url }])
    }

    return (
        <ExampleCard
            icon="cloud-download-outline"
            color={FEATURE_COLORS.preload}
            title="Preloading"
            subtitle="Progress indication using react-native-image-progress."
        >
            <SectionFlex style={styles.section}>
                {show ? (
                    <Image
                        style={[styles.image, { backgroundColor: theme.placeholder }]}
                        source={{ uri: url }}
                    />
                ) : (
                    <View
                        style={[styles.image, { backgroundColor: theme.placeholder }]}
                    />
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
        </ExampleCard>
    )
}

const styles = StyleSheet.create({
    buttonView: { flex: 1 },
    section: {
        flexDirection: 'column',
        alignItems: 'center',
        paddingBottom: 8,
    },
    buttons: {
        flexDirection: 'row',
        marginHorizontal: 12,
        marginBottom: 10,
    },
    image: {
        borderRadius: 12,
        marginBottom: 12,
        height: 100,
        width: 100,
    },
})
