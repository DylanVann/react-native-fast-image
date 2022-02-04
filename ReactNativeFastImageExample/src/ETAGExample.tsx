import { StatusBar, StyleSheet, View } from 'react-native'
import React from 'react'
import FastImage from '@cuvent/react-native-fast-image'

export const ETAGExample = () => {
    return (
        <View style={styles.container}>
            <StatusBar
                translucent
                barStyle="dark-content"
                backgroundColor="transparent"
            />

            <FastImage
                source={{
                    uri: 'https://cdn.overscore.gg/development/images/customization/QyIU5h7W8CSQa0CsnM33',
                }}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'stretch',
        backgroundColor: '#fff',
    },
})
