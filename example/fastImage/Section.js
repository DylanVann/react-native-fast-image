import React from 'react'
import { View, StyleSheet } from 'react-native'

export default ({ children }) => <View style={styles.section}>{children}</View>

const styles = StyleSheet.create({
  section: {
    marginTop: 10,
    marginBottom: 10,
    marginLeft: 40,
    marginRight: 40,
  },
})
