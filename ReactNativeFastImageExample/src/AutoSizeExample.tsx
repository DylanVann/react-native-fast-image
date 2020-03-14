import React, { Component } from 'react'
import { StyleSheet, View } from 'react-native'
import withCacheBust from './withCacheBust'
import SectionFlex from './SectionFlex'
import FastImage, { FastImageProps } from 'react-native-fast-image'
import Section from './Section'
import FeatureText from './FeatureText'

const GIF_URL =
    'https://cdn-images-1.medium.com/max/1600/1*-CY5bU4OqiJRox7G00sftw.gif'

interface AutoSizingImageProps extends FastImageProps {
    onLoad?: (event: any) => void
    defaultHeight?: number
    width: number
    style?: any
}

interface AutoSizingImageState {
    height: number
    width: number
}

class AutoSizingImage extends Component<
    AutoSizingImageProps,
    AutoSizingImageState
> {
    state = {
        height: 0,
        width: 0,
    }

    onLoad = (e: any) => {
        const {
            nativeEvent: { width, height },
        } = e
        this.setState({ width, height })
        if (this.props.onLoad) {
            this.props.onLoad(e)
        }
    }

    getHeight = () => {
        if (!this.state.height) {
            return this.props.defaultHeight === undefined
                ? 300
                : this.props.defaultHeight
        }
        const ratio = this.state.height / this.state.width
        const height = this.props.width * ratio
        return height
    }

    render() {
        const height = this.getHeight()
        return (
            <FastImage
                {...this.props}
                onLoad={this.onLoad}
                style={[{ width: this.props.width, height }, this.props.style]}
            />
        )
    }
}

interface AutoSizeExampleProps {
    onPressReload: () => void
    bust: boolean
}

const AutoSizeExample = ({ onPressReload, bust }: AutoSizeExampleProps) => (
    <View>
        <Section>
            <FeatureText text="• AutoSize." />
        </Section>
        <SectionFlex onPress={onPressReload}>
            <AutoSizingImage
                style={styles.image}
                width={200}
                source={{ uri: GIF_URL + bust }}
            />
        </SectionFlex>
    </View>
)

const styles = StyleSheet.create({
    image: {
        backgroundColor: '#ddd',
        margin: 20,
        flex: 0,
    },
})

export default withCacheBust(AutoSizeExample)
