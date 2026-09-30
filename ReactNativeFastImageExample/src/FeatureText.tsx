import React from 'react'
import { StyleSheet } from 'react-native'
import { Text } from './Text'

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
