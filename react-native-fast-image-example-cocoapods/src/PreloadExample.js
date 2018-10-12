import React, { Component } from 'react'
import { StyleSheet, View } from 'react-native'
import SectionFlex from './SectionFlex'
import FastImage from 'react-native-fast-image'
import Section from './Section'
import FeatureText from './FeatureText'
import uuid from 'uuid/v4'
import Button from './Button'
import { createImageProgress } from 'react-native-image-progress'

const IMAGE_URL =
    'https://cdn-images-1.medium.com/max/1600/1*-CY5bU4OqiJRox7G00sftw.gif'

const Image = createImageProgress(FastImage)

class PreloadExample extends Component {
    state = {
        show: false,
        url: IMAGE_URL,
    }

    bustCache = () => {
        const key = uuid()
        const bust = `?bust=${key}`
        // Preload images. This can be called anywhere.
        const url = IMAGE_URL + bust
        this.setState({
            url,
            show: false,
        })
    }

    preload = () => {
        FastImage.preload([{ uri: this.state.url }])
    }

    showImage = () => {
        this.setState({ show: true })
    }

    render() {
        return (
            <View>
                <Section>
                    <FeatureText text="• Preloading." />
                    <FeatureText text="• Progress indication using react-native-image-progress." />
                </Section>
                <SectionFlex
                    style={styles.section}
                    onPress={this.props.onPressReload}
                >
                    {this.state.show ? (
                        <Image
                            style={styles.image}
                            source={{ uri: this.state.url }}
                        />
                    ) : (
                        <View style={styles.image} />
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
})

export default PreloadExample
