import React, { useEffect, useState } from 'react'
import {
    Linking,
    Platform,
    Pressable,
    Settings,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import { Scenario, SCENARIOS, type ScenarioName } from './src/Scenario'
import adapter from './src/subject'

// The benchmark app. On iOS it's launched with arguments, e.g. `-scenario
// grid -run <id>`, which iOS puts in the app's user defaults; on Android with
// a link, rnfibench://run?scenario=grid&run=<id>. Both can also pass `server`
// (the Android tests serve the images on the phone, with `warm=0` since
// there's no edge cache to warm) and `delay`. Without them it shows a menu,
// for trying a scenario by hand.
const SERVER = 'https://react-native-fast-image-benchmark.dylanvann.workers.dev'

type Args = Record<string, string | undefined>

const iosArgs = (): Args =>
    Object.fromEntries(
        ['scenario', 'run', 'server', 'delay', 'warm'].map((name) => [
            name,
            Settings.get(name) ?? undefined,
        ]),
    )

// rnfibench://run?scenario=grid&run=<id>
const linkArgs = (url: string | null): Args =>
    Object.fromEntries(
        (url?.split('?')[1] ?? '')
            .split('&')
            .filter(Boolean)
            .map((pair) => pair.split('=').map(decodeURIComponent)),
    )

export default function App() {
    const [args, setArgs] = useState<Args | undefined>(() =>
        Platform.OS === 'ios' ? iosArgs() : undefined,
    )
    useEffect(() => {
        if (Platform.OS !== 'ios') {
            Linking.getInitialURL().then((url) => setArgs(linkArgs(url)))
        }
    }, [])
    const [chosen, setChosen] = useState<ScenarioName>()
    const [manualRun] = useState(() => `manual-${Date.now()}`)
    if (!args) return null
    const scenario = (args.scenario as ScenarioName | undefined) ?? chosen
    if (scenario) {
        return (
            <Scenario
                name={scenario}
                adapter={adapter}
                run={args.run ?? manualRun}
                server={args.server ?? SERVER}
                delay={Number(args.delay ?? 0)}
                warm={args.warm !== '0'}
            />
        )
    }
    return (
        <View style={styles.menu}>
            <Text style={styles.title}>
                {adapter.id} {adapter.version}
            </Text>
            {(Object.keys(SCENARIOS) as ScenarioName[]).map((name) => (
                <Pressable
                    key={name}
                    testID={`scenario-${name}`}
                    style={styles.button}
                    onPress={() => setChosen(name)}
                >
                    <Text>{name}</Text>
                </Pressable>
            ))}
        </View>
    )
}

const styles = StyleSheet.create({
    menu: { flex: 1, padding: 24, paddingTop: 100, gap: 12 },
    title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
    button: { padding: 16, backgroundColor: '#eeeeee', borderRadius: 8 },
})
