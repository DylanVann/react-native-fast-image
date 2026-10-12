import React, { useEffect, useState } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
// The runner and cases are shared with the main example app.
import RegressionRunner, {
    runnerWanted,
} from '../ReactNativeFastImageExample/src/RegressionRunner'
import RegressionExample, {
    REGRESSION_GROUPS,
} from '../ReactNativeFastImageExample/src/RegressionExample'

// The regression cases on the oldest React Native FastImage supports. The
// example screens (ExampleGroups) are only in the main example, which has
// their other dependencies.
export default function App() {
    // undefined until known, so the cases don't start when the runner is
    // wanted.
    const [runner, setRunner] = useState<boolean>()
    useEffect(() => {
        runnerWanted().then(setRunner)
    }, [])
    if (runner === undefined) return null
    if (runner) return <RegressionRunner groups={REGRESSION_GROUPS} />
    return (
        <SafeAreaProvider>
            <RegressionExample />
        </SafeAreaProvider>
    )
}
