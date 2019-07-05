import React from 'react'
import { StyleSheet, View} from 'react-native'
import withCacheBust from './withCacheBust'
import FastImage from 'react-native-fast-image'
import Section from './Section'
import SectionFlex from './SectionFlex'
import FeatureText from './FeatureText'
import LogoImage from './images/logo.png'

const TintColorExample = ({ onPressReload }) => (
    <View>
        <Section>
            <FeatureText text="Images with tint color." />
            <FeatureText text="All non-transparent pixels are changed to the color." />
        </Section>
        <SectionFlex onPress={onPressReload}>
            <FastImage
                style={styles.image}
                tintColor={'green'}
                source={LogoImage}
            />
            <FastImage
                style={styles.image}
                tintColor={'#9324c3'}
                source={LogoImage}
            />
            <FastImage
                style={styles.image}
                tintColor={'rgba(0,0,0,0.5)'}
                source={LogoImage}
            />
        </SectionFlex>
    </View>
)

const styles = StyleSheet.create({
    image: {
        flex: 1,
        height: 100,
        margin: 10,
    },
})

export default withCacheBust(TintColorExample)
