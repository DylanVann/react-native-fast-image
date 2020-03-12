import React from 'react'
import { StyleSheet, View } from 'react-native'

interface SectionProps {
    children?: any
}

export default function Section({ children }: SectionProps) {
    return <View style={styles.section}>{children}</View>
}

const styles = StyleSheet.create({
    section: {
        marginTop: 10,
        marginBottom: 10,
        marginLeft: 40,
        marginRight: 40,
    },
})
