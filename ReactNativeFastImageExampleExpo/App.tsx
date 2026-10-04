import React, { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
// The runner and cases are shared with the main example app.
import RegressionRunner, {
    runnerWanted,
} from '../ReactNativeFastImageExample/src/RegressionRunner'
import { SMOKE_GROUPS } from '../ReactNativeFastImageExample/src/SmokeExample'
import {
    CaseStatus,
    caseStyles,
} from '../ReactNativeFastImageExample/src/CaseStatus'
import { imageUrl } from '../ReactNativeFastImageExample/src/imageServer'
import type { RegressionGroup } from '../ReactNativeFastImageExample/src/RunnerContext'
import { Image as ExpoImage } from 'expo-image'

// Busts the image caches between runs.
const RUN = Date.now()

// expo-image in the same app: on Android, both use Glide, with expo-image's
// AppGlideModule (FastImage leaves its own out), so its images still load
// with its own setup.
function ExpoImageCase() {
    const [status, setStatus] = useState('loading')
    return (
        <View style={caseStyles.row}>
            <ExpoImage
                style={caseStyles.image}
                source={{
                    uri: imageUrl(`picsum/1020-120x120.jpg?expo-image=${RUN}`),
                }}
                onLoad={() => setStatus('OK')}
                onError={(e) => setStatus(`error: ${e.error}`)}
            />
            <CaseStatus
                id="expo-image"
                status={status}
                description="expo-image's Image loads, in the same app as FastImage"
            />
        </View>
    )
}

const GROUPS: RegressionGroup[] = [
    ...SMOKE_GROUPS,
    { name: 'expo-image', cases: [<ExpoImageCase key="expo-image" />] },
]

// FastImage in an Expo app (iOS, Android and the web), next to expo-image:
// the smoke cases, run by scripts/verify.mts with `--app expo`, or shown for
// a look by hand.
export default function App() {
    // undefined until known, so the cases don't start when the runner is
    // wanted.
    const [runner, setRunner] = useState<boolean>()
    useEffect(() => {
        runnerWanted().then(setRunner)
    }, [])
    if (runner === undefined) return null
    if (runner) return <RegressionRunner groups={GROUPS} />
    return (
        <SafeAreaProvider>
            <SafeAreaView style={styles.screen}>
                <ScrollView contentContainerStyle={styles.content}>
                    <Text style={styles.title}>FastImage in an Expo app</Text>
                    {GROUPS.flatMap((group) => group.cases)}
                </ScrollView>
            </SafeAreaView>
        </SafeAreaProvider>
    )
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: 'white',
    },
    content: {
        padding: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
    },
})
