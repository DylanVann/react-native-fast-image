import React from 'react'
import { StyleSheet, View } from 'react-native'
import withCacheBust from './withCacheBust'
import SectionFlex from './SectionFlex'
import FastImage from 'react-native-fast-image'
import Section from './Section'
import FeatureText from './FeatureText'

const IMAGE_URL = 'https://media.giphy.com/media/GEsoqZDGVoisw/giphy.gif'

const BorderRadiusExample = ({ onPressReload, bust }) => (
  <View>
    <Section>
      <FeatureText text="• Border radius." />
    </Section>
    <SectionFlex onPress={onPressReload}>
      <FastImage
        style={styles.imageSquare}
        borderRadius={50}
        source={{
          uri: IMAGE_URL + bust,
        }}
      />
      <FastImage
        style={styles.imageRectangular}
        borderRadius={50}
        source={{
          uri: IMAGE_URL + bust,
        }}
      />
    </SectionFlex>
  </View>
)

const styles = StyleSheet.create({
  imageSquare: {
    height: 100,
    backgroundColor: '#ddd',
    margin: 20,
    width: 100,
    flex: 0,
  },
  imageRectangular: {
    height: 100,
    backgroundColor: '#ddd',
    margin: 20,
    flex: 1,
  },
  plus: {
    width: 30,
    height: 30,
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
})

export default withCacheBust(BorderRadiusExample)
