import React, { Component } from 'react'
import {
    StyleSheet,
    View,
    Text,
    TouchableOpacity,
    ViewProps,
} from 'react-native'
import FastImage, { FastImageProps, Source } from 'react-native-fast-image'
import Section from './Section'
import FeatureText from './FeatureText'
import FieldsBase64 from './images/fields'
import { launchImageLibrary } from 'react-native-image-picker'
import BulletText from './BulletText'

// @ts-ignore
import FieldsImage from './images/fields.jpg'
// @ts-ignore
import FieldsWebP from './images/fields.webp'
// @ts-ignore
import JellyfishGIF from './images/jellyfish.gif'
// @ts-ignore
import JellyfishWebP from './images/jellyfish.webp'

const Image = ({ source, ...p }: FastImageProps) => (
    <FastImage style={styles.imageSquare} source={source} {...p} />
)

const Row: React.ComponentType<ViewProps> = (p: ViewProps) => (
    <View style={styles.row} {...p} />
)

interface ExampleProps {
    name: string
    source: any
}

const Example = ({ name, source }: ExampleProps) => (
    <Row>
        <BulletText>{name}</BulletText>
        <Image source={source} />
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
                    <Image
                        style={styles.imageSquare}
                        source={this.state.image || 0}
                    >
                        <Text style={styles.pickPhoto}>Pick Photo</Text>
                    </Image>
                </TouchableOpacity>
            </Row>
        )
    }
}

export const LocalImagesExample = () => (
    <View>
        <Section>
            <FeatureText>• Local images.</FeatureText>
        </Section>
        <View style={styles.container}>
            <Example name="Require" source={require('./images/fields.jpg')} />
            <Example name="Import" source={FieldsImage} />
            <Example name="GIF" source={JellyfishGIF} />
            <Example name="Animated WebP" source={JellyfishWebP} />
            <Example name="Base64" source={{ uri: FieldsBase64 }} />
            <Example name="WebP" source={FieldsWebP} />
            <PhotoExample />
        </View>
    </View>
)

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
    plus: {
        width: 30,
        height: 30,
        position: 'absolute',
        bottom: 0,
        right: 0,
    },
})
