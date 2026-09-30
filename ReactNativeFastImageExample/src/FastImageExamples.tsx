import React from 'react'
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native'
import Section from './Section'
import FeatureText from './FeatureText'
import StatusBarUnderlay, { useStatusBarHeight } from './StatusBarUnderlay'
import { PriorityExample } from './PriorityExample'
import { GifExample } from './GifExample'
import { BorderRadiusExample } from './BorderRadiusExample'
import { ProgressExample } from './ProgressExample'
import { PreloadExample } from './PreloadExample'
import { ResizeModeExample } from './ResizeModeExample'
import { TintColorExample } from './TintColorExample'
import { LocalImagesExample } from './LocalImagesExample'
import { AutoSizeExample } from './AutoSizeExample'

const FastImageExample = () => {
    const statusBarHeight = useStatusBarHeight()
    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <ScrollView
                style={{ marginTop: statusBarHeight }}
                contentContainerStyle={styles.scrollContentContainer}
            >
                <View style={styles.contentContainer}>
                    <Section>
                        <Text style={styles.titleText}>🚩 FastImage</Text>
                        <FeatureText text="Tap images to reload examples." />
                    </Section>
                    <PriorityExample />
                    <GifExample />
                    <BorderRadiusExample />
                    <ProgressExample />
                    <PreloadExample />
                    <ResizeModeExample />
                    <TintColorExample />
                    <LocalImagesExample />
                    <AutoSizeExample />
                </View>
            </ScrollView>
            <StatusBarUnderlay />
        </View>
    )
}

const styles = StyleSheet.create({
    titleText: {
        fontWeight: '900',
        marginBottom: 20,
        color: '#222',
    },
    contentContainer: {
        marginTop: 20,
    },
    image: {
        flex: 1,
        height: 100,
        backgroundColor: '#ddd',
        margin: 10,
    },
    container: {
        flex: 1,
        alignItems: 'stretch',
        backgroundColor: '#fff',
    },
    scrollContentContainer: {
        alignItems: 'stretch',
        flex: 0,
    },
})

export default FastImageExample
