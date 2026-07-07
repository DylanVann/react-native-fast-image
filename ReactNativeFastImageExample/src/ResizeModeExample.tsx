import React from 'react'
import { StyleSheet, View } from 'react-native'
import SectionFlex from './SectionFlex'
import FastImage from 'react-native-fast-image'
import { ExampleCard } from './ExampleCard'
import BulletText from './BulletText'
import { FEATURE_COLORS, useTheme } from './theme'

const IMAGE_URL = 'https://media.giphy.com/media/GEsoqZDGVoisw/giphy.gif'

const ResizeModeColumn = (props: { children?: React.ReactNode }) => (
    <View style={styles.col} {...props} />
)

export const ResizeModeExample = () => {
    const theme = useTheme()
    return (
        <ExampleCard
            icon="expand-outline"
            color={FEATURE_COLORS.resizeMode}
            title="Resize Mode"
            subtitle="contain, center, stretch, and cover."
        >
            <SectionFlex style={styles.container}>
                <ResizeModeColumn>
                    <FastImage
                        style={[styles.image, { backgroundColor: theme.placeholder }]}
                        resizeMode={FastImage.resizeMode.contain}
                        source={{ uri: IMAGE_URL }}
                    />
                    <BulletText>contain</BulletText>
                </ResizeModeColumn>
                <ResizeModeColumn>
                    <FastImage
                        style={[styles.image, { backgroundColor: theme.placeholder }]}
                        resizeMode={FastImage.resizeMode.center}
                        source={{ uri: IMAGE_URL }}
                    />
                    <BulletText>center</BulletText>
                </ResizeModeColumn>
                <ResizeModeColumn>
                    <FastImage
                        style={[styles.image, { backgroundColor: theme.placeholder }]}
                        resizeMode={FastImage.resizeMode.stretch}
                        source={{ uri: IMAGE_URL }}
                    />
                    <BulletText>stretch</BulletText>
                </ResizeModeColumn>
                <ResizeModeColumn>
                    <FastImage
                        style={[styles.image, { backgroundColor: theme.placeholder }]}
                        resizeMode={FastImage.resizeMode.cover}
                        source={{ uri: IMAGE_URL }}
                    />
                    <BulletText>cover</BulletText>
                </ResizeModeColumn>
            </SectionFlex>
        </ExampleCard>
    )
}

const styles = StyleSheet.create({
    image: {
        height: 100,
        width: 50,
        borderRadius: 8,
        marginBottom: 10,
        flex: 0,
    },
    container: {
        paddingHorizontal: 8,
        paddingBottom: 16,
    },
    col: {
        alignItems: 'center',
        flex: 1,
    },
})
