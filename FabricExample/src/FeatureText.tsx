import React from 'react'
import { StyleSheet, Text } from 'react-native'

interface FeatureTextProps {
    text?: string
    style?: any
    children?: any
}

export default function FeatureText({
    text,
    style,
    children,
}: FeatureTextProps) {
    return <Text style={[styles.style, style]}>{text || children}</Text>
}

const styles = StyleSheet.create({
    style: {
        color: '#222',
    },
})
