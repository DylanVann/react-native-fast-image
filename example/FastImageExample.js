// @flow
import React, { Component } from 'react'
import { View, Text, StyleSheet, ScrollView, StatusBar } from 'react-native'
import Icon from 'react-native-vector-icons/Ionicons'
import FastImage from 'react-native-fast-image'
import timeout from 'react-timeout'
import uuid from 'uuid/v4'

const baseUrl = '192.168.2.11'
const image1 = `http://${baseUrl}:8080/pictures/ahmed-saffu-235616.jpg`
const image2 = `http://${baseUrl}:8080/pictures/alex-bertha-236361.jpg`
const image3 = `http://${baseUrl}:8080/pictures/jaromir-kavan-233699.jpg`
const token = 'someToken'

class FastImageExample extends Component {
  componentDidMount() {
    // Forcing an update every 5s to demonstrate loading.
    this.props.setInterval(() => {
      this.forceUpdate()
    }, 5000)
  }

  render() {
    // Force complete re-render.
    const key = uuid()
    // Busting image cache.
    const bust = `?bust=${key}`
    return (
      <View style={styles.container} key={key}>
        <StatusBar
          translucent
          barStyle="dark-content"
          backgroundColor="transparent"
        />
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContentContainer}
        >
          <View style={styles.textContainer}>
            <Text style={styles.bold}>FastImage</Text>
            <Text>• priority (low, normal, high)</Text>
            <Text>• authentication (token)</Text>
          </View>
          <FastImage
            style={styles.image}
            source={{
              uri: image1 + bust,
              headers: {
                token,
              },
              priority: FastImage.priority.low,
            }}
          />
          <FastImage
            style={styles.image}
            source={{
              uri: image2 + bust,
              headers: {
                token,
              },
              priority: FastImage.priority.normal,
            }}
          />
          <FastImage
            style={styles.image}
            source={{
              uri: image3 + bust,
              headers: {
                token,
              },
              priority: FastImage.priority.high,
            }}
          />
        </ScrollView>
      </View>
    )
  }
}

FastImageExample = timeout(FastImageExample)

FastImageExample.navigationOptions = {
  tabBarLabel: 'FastImage Example',
  tabBarIcon: ({ focused, tintColor }) => {
    if (focused)
      return <Icon name="ios-information-circle" size={26} color={tintColor} />
    return (
      <Icon name="ios-information-circle-outline" size={26} color={tintColor} />
    )
  },
}

const IMAGE_SIZE = 150

const styles = StyleSheet.create({
  bold: {
    fontWeight: '900',
  },
  textContainer: {
    marginTop: 40,
    marginBottom: 20,
  },
  image: {
    height: IMAGE_SIZE,
    width: IMAGE_SIZE,
    backgroundColor: '#eee',
    margin: 2,
  },
  container: {
    flex: 1,
  },
  scrollContainer: {},
  scrollContentContainer: {
    alignItems: 'center',
    flex: 0,
  },
})

export default FastImageExample
