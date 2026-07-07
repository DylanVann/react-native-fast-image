import React from 'react'
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native'
import StatusBarUnderlay, { STATUS_BAR_HEIGHT } from './StatusBarUnderlay'
import { IconAvatar } from './IconAvatar'
import { useTheme, FEATURE_COLORS } from './theme'
import { PriorityExample } from './PriorityExample'
import { GifExample } from './GifExample'
import { BorderRadiusExample } from './BorderRadiusExample'
import { ProgressExample } from './ProgressExample'
import { PreloadExample } from './PreloadExample'
import { ResizeModeExample } from './ResizeModeExample'
import { TintColorExample } from './TintColorExample'
import { LocalImagesExample } from './LocalImagesExample'
import { AutoSizeExample } from './AutoSizeExample'

const FastImageExample = () => {
    const theme = useTheme()
    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <StatusBar
                translucent
                barStyle={theme.statusBarStyle}
                backgroundColor="transparent"
            />
            <ScrollView
                style={styles.scrollContainer}
                contentContainerStyle={styles.scrollContentContainer}
            >
                <View style={styles.header}>
                    <IconAvatar
                        name="flash-outline"
                        color={FEATURE_COLORS.brand}
                        size={44}
                    />
                    <View style={styles.headerText}>
                        <Text
                            style={[styles.title, { color: theme.textPrimary }]}
                        >
                            FastImage
                        </Text>
                        <Text
                            style={[
                                styles.subtitle,
                                { color: theme.textSecondary },
                            ]}
                        >
                            High performance image loading for React Native
                        </Text>
                    </View>
                    <IconAvatar
                        name="images-outline"
                        color={theme.accent}
                        size={44}
                        circle
                    />
                </View>
                <Text style={[styles.hint, { color: theme.textSecondary }]}>
                    ✦ Tap images to reload examples ✦
                </Text>
                <PriorityExample />
                <GifExample />
                <BorderRadiusExample />
                <ProgressExample />
                <PreloadExample />
                <ResizeModeExample />
                <TintColorExample />
                <LocalImagesExample />
                <AutoSizeExample />
            </ScrollView>
            <StatusBarUnderlay />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'stretch',
    },
    scrollContainer: {
        marginTop: STATUS_BAR_HEIGHT,
    },
    scrollContentContainer: {
        alignItems: 'stretch',
        flex: 0,
        paddingBottom: 24,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 4,
    },
    headerText: {
        marginLeft: 12,
        flex: 1,
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
    },
    subtitle: {
        fontSize: 13,
        marginTop: 2,
    },
    headerButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    hint: {
        textAlign: 'left',
        paddingHorizontal: 20,
        marginTop: 12,
        marginBottom: 4,
        fontSize: 13,
    },
})

export default FastImageExample
