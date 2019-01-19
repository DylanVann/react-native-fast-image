import React from 'react'
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native'
import Icon from './Icons/Icon'
import Section from './Section'
import PriorityExample from './PriorityExample'
import GifExample from './GifExample'
import BorderRadiusExample from './BorderRadiusExample'
import FeatureText from './FeatureText'
import ProgressExample from './ProgressExample'
import PreloadExample from './PreloadExample'
import ResizeModeExample from './ResizeModeExample'
import LocalImagesExample from './LocalImagesExample'
import StatusBarUnderlay, { STATUS_BAR_HEIGHT } from './StatusBarUnderlay'
import AutoSizeExample from './AutoSizeExample'

const FastImageExample = () => (
    <View style={styles.container}>
        <StatusBar
            translucent
            barStyle="dark-content"
            backgroundColor="transparent"
        />
        <ScrollView
            style={styles.scrollContainer}
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
                <LocalImagesExample />
                <AutoSizeExample />
            </View>
        </ScrollView>
        <StatusBarUnderlay />
    </View>
)

FastImageExample.navigationOptions = {
    tabBarLabel: 'FastImage Example',
    tabBarIcon: props => <Icon name="ios-information-circle" {...props} />,
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
    scrollContainer: {
        marginTop: STATUS_BAR_HEIGHT,
    },
    scrollContentContainer: {
        alignItems: 'stretch',
        flex: 0,
    },
})

export default FastImageExample
