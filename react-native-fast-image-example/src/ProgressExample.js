import React, { Component } from 'react'
import { StyleSheet, View, Text } from 'react-native'
import withCacheBust from './withCacheBust'
import SectionFlex from './SectionFlex'
import FastImage from 'react-native-fast-image'
import Section from './Section'
import FeatureText from './FeatureText'

const IMAGE_URL = 'https://media.giphy.com/media/GEsoqZDGVoisw/giphy.gif'

class ProgressExample extends Component {
    state = {
        mount: new Date(),
        start: undefined,
        progress: undefined,
        end: undefined,
    }

    render() {
        const { onPressReload, bust } = this.props
        const { mount, start, progress, end } = this.state
        return (
            <View>
                <Section>
                    <FeatureText text="• Progress callbacks." />
                </Section>
                <SectionFlex
                    onPress={onPressReload}
                    style={{
                        flexDirection: 'column',
                        alignItems: 'center',
                        paddingBottom: 20,
                    }}
                >
                    <FastImage
                        style={styles.image}
                        source={{
                            uri: IMAGE_URL + bust,
                        }}
                        onLoadStart={() => this.setState({ start: Date.now() })}
                        onProgress={e =>
                            this.setState({
                                progress: Math.round(
                                    100 *
                                        (e.nativeEvent.loaded /
                                            e.nativeEvent.total),
                                ),
                            })
                        }
                        onLoad={() => this.setState({ end: Date.now() })}
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
}

const styles = StyleSheet.create({
    image: {
        height: 100,
        backgroundColor: '#ddd',
        margin: 20,
        width: 100,
        flex: 0,
    },
})

export default withCacheBust(ProgressExample)
