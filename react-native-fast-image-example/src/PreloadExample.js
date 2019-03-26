import React, { Component } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import SectionFlex from './SectionFlex'
import FastImage from 'react-native-fast-image'
import Section from './Section'
import FeatureText from './FeatureText'
import uuid from 'uuid/v4'
import Button from './Button'
import { createImageProgress } from 'react-native-image-progress'

const IMAGE_URLS = [
    'https://cdn-images-1.medium.com/max/1600/1*-CY5bU4OqiJRox7G00sftw.gif',
    'https://media.giphy.com/media/GEsoqZDGVoisw/giphy.gif',
    'https://image.that.always.fails.com',
]

const Image = createImageProgress(FastImage)

class PreloadExample extends Component {
    state = {
        show: false,
        urls: [...IMAGE_URLS],
        progress: [0, 0],
        result: [0, 0],
    }

    bustCache = () => {
        this.setState({
            urls: IMAGE_URLS.map(url => `${url}?bust=${uuid()}`),
            show: false,
            progress: [0, 0],
            result: [0, 0],
        })
    }

    onProgress = (loaded, total) => {
        this.setState({ progress: [loaded, total] })
    }

    onComplete = (loaded, skipped) => {
        this.setState({ result: [skipped, loaded] })
    }

    preload = () => {
        FastImage.preload(
            this.state.urls.map(uri => ({ uri })),
            this.onProgress,
            this.onComplete,
        )
    }

    showImage = () => {
        this.setState({ show: true })
    }

    renderImage = uri => {
        return this.state.show ? (
            <Image key={uri} style={styles.image} source={{ uri }} />
        ) : (
            <View key={uri} style={styles.image} />
        )
    }

    renderImages = () => {
        const { urls, show } = this.state
        return <View style={styles.images}>{urls.map(this.renderImage)}</View>
    }

    render() {
        return (
            <View>
                <Section>
                    <FeatureText text="• Preloading. Last image always fails" />
                    <FeatureText text="• Progress indication using react-native-image-progress." />
                </Section>
                <SectionFlex
                    style={styles.section}
                    onPress={this.props.onPressReload}
                >
                    {this.renderImages()}
                    <Text>
                        {`processed: ${this.state.progress[0]} out of ${
                            this.state.progress[1]
                        }`}
                    </Text>
                    {!!this.state.result[1] && (
                        <Text>
                            {`completed: skipped ${
                                this.state.result[0]
                            } out of ${this.state.result[1]}`}
                        </Text>
                    )}
                    <View style={styles.buttons}>
                        <View style={{ flex: 1 }}>
                            <Button text="Bust" onPress={this.bustCache} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Button text="Preload" onPress={this.preload} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Button text="Render" onPress={this.showImage} />
                        </View>
                    </View>
                </SectionFlex>
            </View>
        )
    }
}

const styles = StyleSheet.create({
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
    images: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
})

export default PreloadExample
