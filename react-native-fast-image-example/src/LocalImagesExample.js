import React, { Component } from 'react'
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native'
import withCacheBust from './withCacheBust'
import FastImage from 'react-native-fast-image'
import Section from './Section'
import FeatureText from './FeatureText'
import FieldsImage from './images/fields.jpg'
import FieldsBase64 from './images/fields.js'
import ImagePicker from 'react-native-image-picker'

var options = {
    title: 'Select Avatar',
    customButtons: [{ name: 'fb', title: 'Choose Photo from Facebook' }],
    storageOptions: {
        skipBackup: true,
        path: 'images',
    },
}

const Image = ({ source, ...p }) => (
    <FastImage style={styles.imageSquare} source={source} {...p} />
)

const BulletText = ({ text }) => (
    <FeatureText text={`• ${text} •`} style={{ color: 'white' }} />
)

const Row = p => <View style={styles.row} {...p} />

class PhotoExample extends Component {
    state = {}

    pick = () => {
        ImagePicker.showImagePicker(options, response => {
            console.log('Response = ', response)
            if (response.didCancel) {
                console.log('User cancelled image picker')
            } else if (response.error) {
                console.log('ImagePicker Error: ', response.error)
            } else if (response.customButton) {
                console.log(
                    'User tapped custom button: ',
                    response.customButton,
                )
            } else {
                const fileUri = `file://${response.path}`
                const uri = response.uri
                this.setState({
                    image: { uri: uri },
                })
            }
        })
    }

    render() {
        return (
            <Row>
                <BulletText text="photo library" />
                <TouchableOpacity onPress={this.pick}>
                    <Image style={styles.imageSquare} source={this.state.image}>
                        <Text style={{ color: 'white', fontWeight: '900' }}>
                            Pick Photo
                        </Text>
                    </Image>
                </TouchableOpacity>
            </Row>
        )
    }
}

const Require = () => (
    <React.Fragment>
        <BulletText text="require" />
        <Image source={require('./images/fields.jpg')} />
    </React.Fragment>
)

const Import = () => (
    <React.Fragment>
        <BulletText text="import" />
        <Image source={FieldsImage} />
    </React.Fragment>
)

const GIF = () => (
    <React.Fragment>
        <BulletText text="gif" />
        <Image source={FieldsImage} />
    </React.Fragment>
)

export const Base64 = () =>
    <React.Fragment>
        <BulletText text="base64" />
        <Image source={{ uri: FieldsBase64 }} />
    </React.Fragment>

const LocalImagesExample = ({ onPressReload, bust }) => (
    <View>
        <Section>
            <FeatureText text="• Local images." />
        </Section>
        <View style={styles.container}>
            <Row>
                <Require />
            </Row>
            <Row>
                <Import />
            </Row>
            <Row>
                <GIF />
            </Row>
            <Row>
                <Base64 />
            </Row>
            <PhotoExample />
        </View>
    </View>
)

const styles = StyleSheet.create({
    row: {
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    container: {
        backgroundColor: '#000',
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

export default withCacheBust(LocalImagesExample)
