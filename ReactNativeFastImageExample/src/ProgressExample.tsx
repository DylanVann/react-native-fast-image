import React, { useState } from 'react'
import { StyleSheet, View, Text } from 'react-native'
import SectionFlex from './SectionFlex'
import FastImage from 'react-native-fast-image'
import Section from './Section'
import FeatureText from './FeatureText'
import { useCacheBust } from './useCacheBust'

const IMAGE_URL = 'https://media.giphy.com/media/GEsoqZDGVoisw/giphy.gif'

export const ProgressExample = () => {
    const [state, setState] = useState<{
        mount: number
        start?: number
        progress?: number
        end?: number
    }>({
        mount: Date.now(),
        start: undefined,
        progress: undefined,
        end: undefined,
    })

    const { url, bust } = useCacheBust(IMAGE_URL)
    const { mount, start, progress, end } = state
    return (
        <View>
            <Section>
                <FeatureText text="• Progress callbacks." />
            </Section>
            <SectionFlex onPress={bust} style={styles.section}>
                <FastImage
                    style={styles.image}
                    source={{
                        uri: url,
                    }}
                    onLoadStart={() =>
                        setState((s) => ({ ...s, start: Date.now() }))
                    }
                    onProgress={(e) => {
                        const p = Math.round(
                            100 * (e.nativeEvent.loaded / e.nativeEvent.total),
                        )
                        setState((s) => ({
                            ...s,
                            progress: p,
                        }))
                    }}
                    onLoad={() => setState((s) => ({ ...s, end: Date.now() }))}
                    onLoadEnd={() => {}}
                />
                <Text>
                    onLoadStart
                    {start !== undefined && ` - ${start - mount} ms`}
                </Text>
                <Text>
                    onProgress
                    {progress !== undefined && ` - ${progress} %`}
                </Text>
                <Text>
                    onLoad
                    {end !== undefined && ` - ${end - mount} ms`}
                </Text>
            </SectionFlex>
        </View>
    )
}

const styles = StyleSheet.create({
    section: {
        flexDirection: 'column',
        alignItems: 'center',
        paddingBottom: 20,
    },
    image: {
        height: 100,
        backgroundColor: '#ddd',
        margin: 20,
        width: 100,
        flex: 0,
    },
})
