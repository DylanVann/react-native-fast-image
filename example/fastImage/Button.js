import React from 'react'
import { StyleSheet, Text, TouchableOpacity } from 'react-native'

const Button = ({ text, onPress }) => (
  <TouchableOpacity onPress={onPress}>
    <Text style={styles.button}>{text}</Text>
  </TouchableOpacity>
)

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'black',
    color: 'white',
    margin: 5,
    padding: 5,
    paddingLeft: 10,
    paddingRight: 10,
    borderRadius: 2,
  },
})

export default Button
