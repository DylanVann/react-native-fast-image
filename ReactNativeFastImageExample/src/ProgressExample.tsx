import React, { useState } from 'react'
import { StyleSheet, View, Text } from 'react-native'
import SectionFlex from './SectionFlex'
import FastImage from 'react-native-fast-image'
import { ExampleCard } from './ExampleCard'
import { FEATURE_COLORS, useTheme } from './theme'
import { useCacheBust } from './useCacheBust'

const IMAGE_URL = 'https://media.giphy.com/media/GEsoqZDGVoisw/giphy.gif'

export const ProgressExample = () => {
    const [state, setState] = useState<{
        mount: number
        start?: number
        progress?: number
        end?: number
    }>({
        mount: Date.now(),
        start: undefined,
        progress: undefined,
        end: undefined,
    })

    const { url, bust } = useCacheBust(IMAGE_URL)
    const { progress } = state
    const theme = useTheme()
    const pct = progress ?? 0
    return (
        <ExampleCard
            icon="speedometer-outline"
            color={FEATURE_COLORS.progress}
            title="Progress Callbacks"
            subtitle="Track image loading progress."
        >
            <SectionFlex onPress={bust} style={styles.row}>
                <FastImage
                    style={[styles.image, { backgroundColor: theme.placeholder }]}
                    source={{
                        uri: url,
                    }}
                    onLoadStart={() =>
                        setState((s) => ({ ...s, start: Date.now() }))
                    }
                    onProgress={(e) => {
                        const p = Math.round(
                            100 * (e.nativeEvent.loaded / e.nativeEvent.total),
                        )
                        setState((s) => ({
                            ...s,
                            progress: p,
                        }))
                    }}
                    onLoad={() => setState((s) => ({ ...s, end: Date.now() }))}
                    onLoadEnd={() => {}}
                />
                <View style={styles.progressRow}>
                    <View
                        style={[
                            styles.progressTrack,
                            { backgroundColor: theme.placeholder },
                        ]}
                    >
                        <View
                            style={[
                                styles.progressFill,
                                {
                                    width: `${pct}%`,
                                    backgroundColor: FEATURE_COLORS.progress,
                                },
                            ]}
                        />
                    </View>
                    <Text
                        style={[styles.progressLabel, { color: theme.textSecondary }]}
                    >
                        {pct}%
                    </Text>
                </View>
            </SectionFlex>
        </ExampleCard>
    )
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'column',
        alignItems: 'center',
        paddingBottom: 16,
    },
    image: {
        height: 100,
        borderRadius: 12,
        marginBottom: 12,
        width: 100,
        flex: 0,
    },
    progressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        paddingHorizontal: 16,
    },
    progressTrack: {
        flex: 1,
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
    progressLabel: {
        marginLeft: 8,
        fontSize: 12,
        fontWeight: '700',
        width: 36,
        textAlign: 'right',
    },
})
