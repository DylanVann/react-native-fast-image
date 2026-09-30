import React, { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
// The runner and cases are shared with the main example app.
import RegressionRunner, {
    runnerWanted,
} from '../ReactNativeFastImageExample/src/RegressionRunner'
import { SMOKE_GROUPS } from '../ReactNativeFastImageExample/src/SmokeExample'

// FastImage in an Expo app (iOS, Android and the web): the smoke cases, run by
// scripts/verify.mts with `--app expo`, or shown for a look by hand.
export default function App() {
    // undefined until known, so the cases don't start when the runner is
    // wanted.
    const [runner, setRunner] = useState<boolean>()
    useEffect(() => {
        runnerWanted().then(setRunner)
    }, [])
    if (runner === undefined) return null
    if (runner) return <RegressionRunner groups={SMOKE_GROUPS} />
    return (
        <SafeAreaProvider>
            <SafeAreaView style={styles.screen}>
                <ScrollView contentContainerStyle={styles.content}>
                    <Text style={styles.title}>FastImage in an Expo app</Text>
                    {SMOKE_GROUPS.flatMap((group) => group.cases)}
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
