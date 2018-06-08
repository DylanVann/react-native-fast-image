import React from 'react'
import { StyleSheet, Text } from 'react-native'

export default ({ text, style }) => <Text style={[styles.style, style]}>{text}</Text>

const styles = StyleSheet.create({
    style: {
        color: '#222',
    },
})
