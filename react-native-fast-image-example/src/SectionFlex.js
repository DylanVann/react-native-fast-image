import React from 'react'
import { StyleSheet, TouchableOpacity } from 'react-native'

export default ({ children, onPress, style }) => (
    <TouchableOpacity style={[styles.sectionFlex, style]} onPress={onPress}>
        {children}
    </TouchableOpacity>
)

const styles = StyleSheet.create({
    sectionFlex: {
        backgroundColor: '#eee',
        flexDirection: 'row',
        justifyContent: 'center',
        marginLeft: -10,
        marginRight: -10,
    },
})
