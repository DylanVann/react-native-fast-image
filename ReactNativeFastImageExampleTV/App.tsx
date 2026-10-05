import React, { useEffect, useState } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
// The runner and cases are shared with the main example app.
import RegressionRunner, {
    runnerWanted,
} from '../ReactNativeFastImageExample/src/RegressionRunner'
import RegressionExample, {
    REGRESSION_GROUPS,
} from '../ReactNativeFastImageExample/src/RegressionExample'

// The regression cases on tvOS, except those that need a touch (an Apple TV
// has a remote instead).
const GROUPS = REGRESSION_GROUPS.filter((group) => group.name !== 'touch')

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
            <RegressionExample />
        </SafeAreaProvider>
    )
}
