import React from 'react'
import { StyleSheet, Text } from 'react-native'

export default ({ text, style, children }) => (
    <Text style={[styles.style, style]}>{text || children}</Text>
)

const styles = StyleSheet.create({
    style: {
        color: '#222',
    },
})
