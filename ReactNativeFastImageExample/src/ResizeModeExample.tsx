import React from 'react'
import { StyleSheet, View } from 'react-native'
import SectionFlex from './SectionFlex'
import FastImage from 'react-native-fast-image'
import Section from './Section'
import FeatureText from './FeatureText'
import BulletText from './BulletText'
import { imageUrl } from './imageServer'
import { useLoads } from './RunnerContext'

const IMAGE_URL = imageUrl('picsum/1018-600x300.jpg')

const Col = (p: any) => <View style={styles.col} {...p} />

export const ResizeModeExample = () => {
    const onLoad = useLoads('resize-mode-example', 4)
    return (
        <View>
            <Section>
                <FeatureText text="• objectFit." />
            </Section>
            <SectionFlex style={styles.container}>
                <Col>
                    <FastImage
                        style={styles.image}
                        objectFit="contain"
                        source={{ uri: IMAGE_URL }}
                        onLoad={onLoad}
                    />
                    <BulletText>contain</BulletText>
                </Col>
                <Col>
                    <FastImage
                        style={styles.image}
                        objectFit="scale-down"
                        source={{ uri: IMAGE_URL }}
                        onLoad={onLoad}
                    />
                    <BulletText>scale-down</BulletText>
                </Col>
                <Col>
                    <FastImage
                        style={styles.image}
                        objectFit="fill"
                        source={{ uri: IMAGE_URL }}
                        onLoad={onLoad}
                    />
                    <BulletText>fill</BulletText>
                </Col>
                <Col>
                    <FastImage
                        style={styles.image}
                        objectFit="cover"
                        source={{ uri: IMAGE_URL }}
                        onLoad={onLoad}
                    />
                    <BulletText>cover</BulletText>
                </Col>
            </SectionFlex>
        </View>
    )
}

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
