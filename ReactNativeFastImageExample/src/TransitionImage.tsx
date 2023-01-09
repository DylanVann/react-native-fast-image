import React, { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { FastImageProps } from 'react-native-fast-image'
import FeatureText from './FeatureText'
import { RefreshableImage } from './RefreshableImage'

interface TransitionImageProps extends Omit<FastImageProps, 'source'> {}

const IMAGE_URL = 'https://source.unsplash.com/WJXkdAWOWGo/1024x1024'

export const TransitionImage = (props: TransitionImageProps) => {
    const [transitionDuration, setTransitionDuration] = useState(500)

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <View
                    style={{
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <TouchableOpacity
                        style={
                            transitionDuration === 500
                                ? styles.activeTimeDuration
                                : styles.timeDuration
                        }
                        onPress={() => setTransitionDuration(500)}
                    >
                        <Text style={styles.text}>0.5s</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={
                            transitionDuration === 1500
                                ? styles.activeTimeDuration
                                : styles.timeDuration
                        }
                        onPress={() => setTransitionDuration(1500)}
                    >
                        <Text style={styles.text}>1.5s</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={
                            transitionDuration === 3000
                                ? styles.activeTimeDuration
                                : styles.timeDuration
                        }
                        onPress={() => setTransitionDuration(3000)}
                    >
                        <Text style={styles.text}>3s</Text>
                    </TouchableOpacity>
                </View>

                <View style={{ alignItems: 'center' }}>
                    <FeatureText>{props.enterTransition}</FeatureText>
                    <RefreshableImage
                        {...props}
                        transitionDuration={transitionDuration}
                        touchableOpacityStyle={styles.image}
                        source={{ uri: IMAGE_URL }}
                    />
                </View>
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    activeTimeDuration: {
        backgroundColor: 'white',
        margin: 5,
        padding: 5,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    timeDuration: {
        margin: 5,
        padding: 5,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        fontSize: 12,
    },
    image: {
        height: 100,
        aspectRatio: 1,
        backgroundColor: '#ddd',
        margin: 10,
    },
})
