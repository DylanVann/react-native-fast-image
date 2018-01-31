import React, { Component } from 'react'
import { View, StyleSheet } from 'react-native'
import SectionFlex from './SectionFlex'
import FastImage from 'react-native-fast-image'
import Section from './Section'
import FeatureText from './FeatureText'
import uuid from 'uuid/v4'
import Button from './Button'

const IMAGE_URL =
  'https://cdn-images-1.medium.com/max/1600/1*-CY5bU4OqiJRox7G00sftw.gif'

class PreloadExample extends Component {
  state = {
    show: false,
    url: IMAGE_URL,
  }

  bustAndPreload = () => {
    const key = uuid()
    const bust = `?bust=${key}`
    // Preload images. This can be called anywhere.
    const url = IMAGE_URL + bust
    FastImage.preload([{ uri: url }])
    this.setState({ url, show: false })
  }

  showImage = () => {
    this.setState({ show: true })
  }

  render() {
    return (
      <View>
        <Section>
          <FeatureText text="• Preloading." />
        </Section>
        <SectionFlex style={styles.section} onPress={this.props.onPressReload}>
          {this.state.show ? (
            <FastImage style={styles.image} source={{ uri: this.state.url }} />
          ) : (
            <View style={styles.image} />
          )}
          <Button
            text="Bust cache and preload."
            onPress={this.bustAndPreload}
          />
          <Button text="Render image." onPress={this.showImage} />
        </SectionFlex>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  section: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  image: {
    backgroundColor: '#ddd',
    margin: 10,
    height: 100,
    width: 100,
  },
})

export default PreloadExample
