import React from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export const useStatusBarHeight = () => useSafeAreaInsets().top

export default () => {
    const height = useStatusBarHeight()
    return <View style={[styles.statusBarUnderlay, { height }]} />
}

const styles = StyleSheet.create({
    statusBarUnderlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: 'white',
    },
})
