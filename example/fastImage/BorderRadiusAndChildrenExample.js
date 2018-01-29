import React from 'react'
import { StyleSheet, View } from 'react-native'
import withCacheBust from './withCacheBust'
import SectionFlex from './SectionFlex'
import FastImage from 'react-native-fast-image'
import Section from './Section'
import FeatureText from './FeatureText'

const IMAGE_URL = 'https://media.giphy.com/media/GEsoqZDGVoisw/giphy.gif'
const PLUS_IMAGE_URL =
  'https://cdn3.iconfinder.com/data/icons/block/32/add-512.png'

const BorderRadiusAndChildrenExample = ({ onPressReload, bust }) => (
  <View>
    <Section>
      <FeatureText text="• Border radius + children." />
    </Section>
    <SectionFlex onPress={onPressReload}>
      <FastImage
        style={styles.image}
        borderRadius={100}
        source={{
          uri: IMAGE_URL + bust,
        }}
      >
        <FastImage style={styles.plus} source={{ uri: PLUS_IMAGE_URL }} />
      </FastImage>
    </SectionFlex>
  </View>
)

const styles = StyleSheet.create({
  image: {
    height: 100,
    backgroundColor: '#ddd',
    margin: 20,
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

export default withCacheBust(BorderRadiusAndChildrenExample)
