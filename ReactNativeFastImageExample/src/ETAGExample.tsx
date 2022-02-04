import { Button, Dimensions, StatusBar, StyleSheet, View } from 'react-native'
import React, { useRef } from 'react'
import FastImage from '@cuvent/react-native-fast-image'

export const ETAGExample = () => {
    const ref = useRef<FastImage>(null)

    return (
        <View style={styles.container}>
            <StatusBar
                translucent
                barStyle="dark-content"
                backgroundColor="transparent"
            />

            <FastImage
                ref={ref}
                style={styles.image}
                source={{
                    cache: 'web',
                    uri: 'http://192.168.178.78:8080/pictures/cat.jpg',
                }}
            />

            <Button
                title={'Reload'}
                onPress={() => {
                    ref.current?.refresh()
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
    image: {
        height: 300,
        width: Dimensions.get('window').width,
    },
})
