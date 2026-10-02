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
// a link, rnfibench://run?scenario=grid&run=<id>&server=<url>. Both pass
// `server`, the image server the tests run on the phone. Without a scenario it
// shows a menu, for trying one by hand (still with a `server`).

type Args = Record<string, string | undefined>

const iosArgs = (): Args =>
    Object.fromEntries(
        ['scenario', 'run', 'server'].map((name) => [
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
            .map((pair) => {
                const at = pair.indexOf('=')
                return [pair.slice(0, at), pair.slice(at + 1)].map((part) =>
                    decodeURIComponent(part.replace(/\+/g, ' ')),
                )
            }),
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
    if (!args.server) {
        return (
            <View style={styles.menu}>
                <Text>
                    No image server: launch with `server` (see README.md).
                </Text>
            </View>
        )
    }
    if (scenario) {
        return (
            <Scenario
                name={scenario}
                adapter={adapter}
                run={args.run ?? manualRun}
                server={args.server}
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
