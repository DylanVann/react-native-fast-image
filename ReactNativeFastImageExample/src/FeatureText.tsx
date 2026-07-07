import React from 'react'
import { Text } from 'react-native'
import { useTheme } from './theme'

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
    const theme = useTheme()
    return (
        <Text style={[{ color: theme.textSecondary }, style]}>
            {text || children}
        </Text>
    )
}
