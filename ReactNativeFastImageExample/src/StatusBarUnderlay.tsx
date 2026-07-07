import React from 'react'
import { StyleSheet, View } from 'react-native'
import { getStatusBarHeight } from 'react-native-status-bar-height'
import { useTheme } from './theme'

export const STATUS_BAR_HEIGHT = getStatusBarHeight()

export default () => {
    const theme = useTheme()
    return (
        <View
            style={[
                styles.statusBarUnderlay,
                { backgroundColor: theme.background },
            ]}
        />
    )
}

const styles = StyleSheet.create({
    statusBarUnderlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: STATUS_BAR_HEIGHT,
    },
})
