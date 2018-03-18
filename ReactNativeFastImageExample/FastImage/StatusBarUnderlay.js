import React from 'react'
import { Platform, StatusBar, StyleSheet, View } from 'react-native'

export const STATUS_BAR_HEIGHT =
  Platform.OS === 'ios' ? 20 : StatusBar.currentHeight

export default () => <View style={styles.statusBarUnderlay} />

const styles = StyleSheet.create({
  statusBarUnderlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: STATUS_BAR_HEIGHT,
    backgroundColor: 'white',
  },
})
