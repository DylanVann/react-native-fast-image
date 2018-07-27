import React from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'

export default ({ children, onPress, style }) =>
    onPress ? (
        <TouchableOpacity style={[styles.sectionFlex, style]} onPress={onPress}>
            {children}
        </TouchableOpacity>
    ) : (
        <View style={[styles.sectionFlex, style]}>{children}</View>
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
