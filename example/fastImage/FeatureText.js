import React from 'react'
import { StyleSheet, Text } from 'react-native'

export default ({ text }) => <Text style={styles.style}>{text}</Text>

const styles = StyleSheet.create({
  style: {
    color: '#222',
  },
})
