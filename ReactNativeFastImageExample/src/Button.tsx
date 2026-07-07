import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTheme } from './theme'

interface ButtonProps {
    text: string
    onPress: () => void
}

const Button = ({ text, onPress }: ButtonProps) => {
    const theme = useTheme()
    return (
        <TouchableOpacity onPress={onPress}>
            <View style={[styles.button, { backgroundColor: theme.accent }]}>
                <Text style={styles.text}>{text}</Text>
            </View>
        </TouchableOpacity>
    )
}

const styles = StyleSheet.create({
    button: {
        margin: 10,
        height: 44,
        paddingLeft: 10,
        paddingRight: 10,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        color: 'white',
        fontWeight: '600',
    },
})

export default Button
