import React from 'react'
import { StyleSheet, View, Text } from 'react-native'
import withCacheBust from './withCacheBust'
import SectionFlex from './SectionFlex'
import FastImage from 'react-native-fast-image'
import Section from './Section'
import FeatureText from './FeatureText'

const IMAGE_URL = 'https://media.giphy.com/media/GEsoqZDGVoisw/giphy.gif'

const Label = ({ children }) => <Text style={styles.text}>{children}</Text>

const BorderRadiusExample = ({ onPressReload, bust }) => (
    <View>
        <Section>
            <FeatureText text="• resizeMode." />
        </Section>
        <SectionFlex onPress={onPressReload}>
            <View>
                <FastImage
                    style={styles.image}
                    resizeMode={FastImage.resizeMode.contain}
                    source={{ uri: IMAGE_URL }}
                />
                <Label>contain</Label>
            </View>
            <View>
                <FastImage
                    style={styles.image}
                    resizeMode={FastImage.resizeMode.center}
                    source={{ uri: IMAGE_URL }}
                />
                <Label>center</Label>
            </View>
            <View>
                <FastImage
                    style={styles.image}
                    resizeMode={FastImage.resizeMode.stretch}
                    source={{ uri: IMAGE_URL }}
                />
                <Label>stretch</Label>
            </View>
            <View>
                <FastImage
                    style={styles.image}
                    resizeMode={FastImage.resizeMode.cover}
                    source={{ uri: IMAGE_URL }}
                />
                <Label>cover</Label>
            </View>
        </SectionFlex>
    </View>
)

const styles = StyleSheet.create({
    image: {
        height: 100,
        width: 50,
        backgroundColor: '#ddd',
        margin: 20,
        marginBottom: 10,
        flex: 0,
    },
    text: {
        textAlign: 'center',
        marginBottom: 20,
    },
})

export default withCacheBust(BorderRadiusExample)
