import React, { Component } from 'react'
import {
    StyleSheet,
    View,
    Text,
    TouchableOpacity,
    ViewProps,
} from 'react-native'
import FastImage, { FastImageProps, Source } from 'react-native-fast-image'
import { ExampleCard } from './ExampleCard'
import { FEATURE_COLORS, useTheme } from './theme'
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

const LocalPreviewImage = ({ source, ...rest }: FastImageProps) => {
    const theme = useTheme()
    return (
        <FastImage
            style={[styles.imageSquare, { backgroundColor: theme.placeholder }]}
            source={source}
            {...rest}
        />
    )
}

const LocalImageRow: React.ComponentType<ViewProps> = (props: ViewProps) => (
    <View style={styles.row} {...props} />
)

interface ExampleProps {
    name: string
    source: any
}

const Example = ({ name, source }: ExampleProps) => (
    <LocalImageRow>
        <BulletText>{name}</BulletText>
        <LocalPreviewImage source={source} />
    </LocalImageRow>
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
            <LocalImageRow>
                <BulletText>photo library</BulletText>
                <TouchableOpacity onPress={this.pick}>
                    <LocalPreviewImage source={this.state.image || 0}>
                        <Text style={styles.pickPhoto}>Pick Photo</Text>
                    </LocalPreviewImage>
                </TouchableOpacity>
            </LocalImageRow>
        )
    }
}

export const LocalImagesExample = () => {
    const theme = useTheme()
    return (
        <ExampleCard
            icon="folder-outline"
            color={FEATURE_COLORS.localImages}
            title="Local Images"
            subtitle="require(), import, GIF, WebP, base64, and photo library."
        >
            <View
                style={[styles.container, { backgroundColor: theme.background }]}
            >
                <Example
                    name="Require"
                    source={require('./images/fields.jpg')}
                />
                <Example name="Import" source={FieldsImage} />
                <Example name="GIF" source={JellyfishGIF} />
                <Example name="Animated WebP" source={JellyfishWebP} />
                <Example name="Base64" source={{ uri: FieldsBase64 }} />
                <Example name="WebP" source={FieldsWebP} />
                <PhotoExample />
            </View>
        </ExampleCard>
    )
}

const styles = StyleSheet.create({
    pickPhoto: { color: 'white', fontWeight: '900' },
    row: {
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    container: {
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 4,
    },
    imageSquare: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 100,
        borderRadius: 12,
        margin: 20,
        marginTop: 10,
        width: 100,
        flex: 0,
    },
})
