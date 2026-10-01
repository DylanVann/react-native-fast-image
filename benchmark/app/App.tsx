import React, { useState } from 'react'
import {
    Platform,
    Pressable,
    Settings,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import { Scenario, SCENARIOS, type ScenarioName } from './src/Scenario'
import adapter from './src/subject'

// The benchmark app. The UI test (../ios) launches it with arguments, e.g.
// `-scenario grid -run <id>`, which iOS puts in the app's user defaults;
// without them it shows a menu, for trying a scenario by hand.
const SERVER = 'https://react-native-fast-image-benchmark.dylanvann.workers.dev'

const arg = (name: string): string | undefined =>
    Platform.OS === 'ios' ? (Settings.get(name) ?? undefined) : undefined

export default function App() {
    const fromArgs = arg('scenario') as ScenarioName | undefined
    const [scenario, setScenario] = useState(fromArgs)
    const [run] = useState(() => arg('run') ?? `manual-${Date.now()}`)
    if (scenario) {
        return (
            <Scenario
                name={scenario}
                adapter={adapter}
                run={run}
                server={arg('server') ?? SERVER}
                delay={Number(arg('delay') ?? 0)}
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
                    onPress={() => setScenario(name)}
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
