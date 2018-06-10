import React from 'react'
import { StyleSheet, View, Text } from 'react-native'
import SectionFlex from './SectionFlex'
import FastImage from 'react-native-fast-image'
import Section from './Section'
import FeatureText from './FeatureText'
import BulletText from './BulletText'

const IMAGE_URL = 'https://media.giphy.com/media/GEsoqZDGVoisw/giphy.gif'

const Col = p => <View style={styles.col} {...p} />

const ResizeModeExample = () => (
    <View>
        <Section>
            <FeatureText text="• resizeMode." />
        </Section>
        <SectionFlex style={styles.container}>
            <Col>
                <FastImage
                    style={styles.image}
                    resizeMode={FastImage.resizeMode.contain}
                    source={{ uri: IMAGE_URL }}
                />
                <BulletText>contain</BulletText>
            </Col>
            <Col>
                <FastImage
                    style={styles.image}
                    resizeMode={FastImage.resizeMode.center}
                    source={{ uri: IMAGE_URL }}
                />
                <BulletText>center</BulletText>
            </Col>
            <Col>
                <FastImage
                    style={styles.image}
                    resizeMode={FastImage.resizeMode.stretch}
                    source={{ uri: IMAGE_URL }}
                />
                <BulletText>stretch</BulletText>
            </Col>
            <Col>
                <FastImage
                    style={styles.image}
                    resizeMode={FastImage.resizeMode.cover}
                    source={{ uri: IMAGE_URL }}
                />
                <BulletText>cover</BulletText>
            </Col>
        </SectionFlex>
    </View>
)

const styles = StyleSheet.create({
    image: {
        height: 100,
        width: 50,
        backgroundColor: '#ddd',
        margin: 20,
        marginTop: 0,
        marginBottom: 10,
        flex: 0,
    },
    container: {
        padding: 20,
    },
    col: {
        alignItems: 'center',
    },
})

export default ResizeModeExample
