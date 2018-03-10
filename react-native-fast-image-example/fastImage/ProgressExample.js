import React from 'react'
import { StyleSheet, View } from 'react-native'
import withCacheBust from './withCacheBust'
import SectionFlex from './SectionFlex'
import FastImage from 'react-native-fast-image'
import Section from './Section'
import FeatureText from './FeatureText'

const IMAGE_URL = 'https://media.giphy.com/media/GEsoqZDGVoisw/giphy.gif'

const getTestProgressCallbacks = label => ({
  onLoadStart: () => console.log(`${label} - onLoadStart`),
  onProgress: e =>
    console.log(
      `${label} - onProgress - ${e.nativeEvent.loaded / e.nativeEvent.total}`,
    ),
  onLoad: () => console.log(`${label} - onLoad`),
  onError: () => console.log(`${label} - onError`),
  onLoadEnd: () => console.log(`${label} - onLoadEnd`),
})

const ProgressExample = ({ onPressReload, bust }) => (
  <View>
    <Section>
      <FeatureText text="• Progress callbacks." />
    </Section>
    <SectionFlex onPress={onPressReload}>
      <FastImage
        style={styles.image}
        source={{
          uri: IMAGE_URL + bust,
        }}
        {...getTestProgressCallbacks('ProgressExample')}
      />
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
})

export default withCacheBust(ProgressExample)
