import React, { Component } from 'react'
import {
    StyleSheet,
    View,
    Text,
    TouchableOpacity,
    ViewProps,
} from 'react-native'
import FastImage, {
    FastImageBackground,
    FastImageProps,
    Source,
} from 'react-native-fast-image'
import Section from './Section'
import FeatureText from './FeatureText'
import FieldsBase64 from './images/fields'
import { launchImageLibrary } from 'react-native-image-picker'
import BulletText from './BulletText'

// @ts-ignore
import FieldsImage from './images/fields.jpg'
// @ts-ignore
import FieldsWebP from './images/fields-webp.webp'
// @ts-ignore
import JellyfishGIF from './images/jellyfish.gif'
// @ts-ignore
import JellyfishWebP from './images/jellyfish-webp.webp'
import { Masked, useLoads } from './RunnerContext'

// Smaller images, so the examples fit on one screen (see LocalImagesExample).
const CompactContext = React.createContext(false)

const Image = ({ source, style, ...p }: FastImageProps) => {
    const compact = React.useContext(CompactContext)
    return (
        <FastImage
            style={[styles.imageSquare, compact && styles.imageCompact, style]}
            source={source}
            {...p}
        />
    )
}

const Row: React.ComponentType<ViewProps> = (p: ViewProps) => (
    <View style={styles.row} {...p} />
)

interface ExampleProps {
    name: string
    source: any
    onLoad?: () => void
    // Animated: left out of screenshot comparisons.
    animated?: boolean
}

const Example = ({ name, source, onLoad, animated }: ExampleProps) => (
    <Row>
        <BulletText>{name}</BulletText>
        {animated ? (
            <Masked>
                <Image source={source} onLoad={onLoad} />
            </Masked>
        ) : (
            <Image source={source} onLoad={onLoad} />
        )}
    </Row>
)

interface PhotoExampleState {
    image?: Source
}

class PhotoExample extends Component<{}, PhotoExampleState> {
    state: PhotoExampleState = {}

    pick = () => {
        launchImageLibrary({ mediaType: 'photo' }, (response) => {
            if (response.didCancel) {
                console.log('ImagePicker - User cancelled.')
            } else if (response.errorCode) {
                console.log(`ImagePicker - Error ${response.errorMessage}.`)
            } else {
                const uri = response?.assets?.[0]?.uri
                if (uri) {
                    this.setState({
                        image: { uri: uri },
                    })
                }
            }
        })
    }

    render() {
        return (
            <Row>
                <BulletText>photo library</BulletText>
                <TouchableOpacity onPress={this.pick}>
                    <CompactContext.Consumer>
                        {(compact) => (
                            <FastImageBackground
                                source={this.state.image || 0}
                                style={[
                                    styles.imageSquare,
                                    compact && styles.imageCompact,
                                ]}
                            >
                                <Text style={styles.pickPhoto}>Pick Photo</Text>
                            </FastImageBackground>
                        )}
                    </CompactContext.Consumer>
                </TouchableOpacity>
            </Row>
        )
    }
}

// `compact` lays the examples out in rows, so they fit on one screen (the
// regression runner shows them that way).
export const LocalImagesExample = ({ compact }: { compact?: boolean }) => {
    const onLoad = useLoads('local-images', 6)
    return (
        <View>
            <Section>
                <FeatureText>• Local images.</FeatureText>
            </Section>
            <CompactContext.Provider value={!!compact}>
                <View style={[styles.container, compact && styles.compact]}>
                    <Example
                        name="Require"
                        source={require('./images/fields.jpg')}
                        onLoad={onLoad}
                    />
                    <Example
                        name="Import"
                        source={FieldsImage}
                        onLoad={onLoad}
                    />
                    <Example
                        name="GIF"
                        source={JellyfishGIF}
                        onLoad={onLoad}
                        animated
                    />
                    <Example
                        name="Animated WebP"
                        source={JellyfishWebP}
                        onLoad={onLoad}
                        animated
                    />
                    <Example
                        name="Base64"
                        source={{ uri: FieldsBase64 }}
                        onLoad={onLoad}
                    />
                    <Example name="WebP" source={FieldsWebP} onLoad={onLoad} />
                    <PhotoExample />
                </View>
            </CompactContext.Provider>
        </View>
    )
}

const styles = StyleSheet.create({
    pickPhoto: { color: 'white', fontWeight: '900' },
    row: {
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    container: {
        backgroundColor: '#eee',
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 10,
        paddingBottom: 10,
    },
    compact: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    imageSquare: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 100,
        backgroundColor: '#ddd',
        margin: 20,
        marginTop: 10,
        width: 100,
        flex: 0,
    },
    imageCompact: {
        height: 64,
        width: 64,
        margin: 10,
        marginTop: 6,
    },
    plus: {
        width: 30,
        height: 30,
        position: 'absolute',
        bottom: 0,
        right: 0,
    },
})
