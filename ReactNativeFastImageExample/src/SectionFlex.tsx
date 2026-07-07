import React from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'

interface SectionFlexProps {
    style?: any
    onPress?: () => void
    children?: any
}

// Row-content wrapper used inside an ExampleCard - transparent, since the
// card itself owns the themed background now.
export default function SectionFlex({
    children,
    onPress,
    style,
}: SectionFlexProps) {
    return onPress ? (
        <TouchableOpacity style={[styles.sectionFlex, style]} onPress={onPress}>
            {children}
        </TouchableOpacity>
    ) : (
        <View style={[styles.sectionFlex, style]}>{children}</View>
    )
}

const styles = StyleSheet.create({
    sectionFlex: {
        flexDirection: 'row',
        justifyContent: 'center',
    },
})
