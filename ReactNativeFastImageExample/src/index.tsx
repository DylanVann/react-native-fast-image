import React, { useEffect, useState } from 'react'
import { LogBox } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Icon } from './Icon'
import FastImageExamples from './FastImageExamples'
import FastImageGrid from './FastImageGrid'
import DefaultImageGrid from './DefaultImageGrid'
import RegressionExample from './RegressionExample'
import RegressionRunner from './RegressionRunner'
import { regressionCheckUrl } from './imageServer'

const Tab = createBottomTabNavigator()

// Whether scripts/verify.mts is waiting to run the regression cases: it
// connects to the image server's relay before launching the app, and the app
// then shows the regression runner instead of its tabs. Without the server
// (or the script), the request fails at once and the app starts as usual; a
// cold start on the emulator can take a few seconds to reach the server, so
// it's given time and a second try.
async function runnerWanted() {
    for (let attempt = 0; attempt < 2; attempt++) {
        const abort = new AbortController()
        const timer = setTimeout(() => abort.abort(), 5000)
        try {
            const response = await fetch(regressionCheckUrl(), {
                signal: abort.signal,
            })
            return (await response.json()).controller === true
        } catch {
            // Refused (no server): start as usual. Timed out: once more.
            if (!abort.signal.aborted) return false
        } finally {
            clearTimeout(timer)
        }
    }
    return false
}

LogBox.ignoreLogs([
    'Warning: isMounted(...) is deprecated',
    'Module RCTImageLoader',
])

export default function App() {
    // undefined until known, so the tabs (and their images) don't start when
    // the runner is wanted.
    const [runner, setRunner] = useState<boolean>()
    useEffect(() => {
        runnerWanted().then(setRunner)
    }, [])
    if (runner === undefined) return null
    if (runner) return <RegressionRunner />
    return (
        <SafeAreaProvider>
            <NavigationContainer>
                <Tab.Navigator screenOptions={{ headerShown: false }}>
                    <Tab.Screen
                        name="FastImage Example"
                        component={FastImageExamples}
                        options={{
                            tabBarButtonTestID: 'tab-examples',
                            tabBarIcon: (props) => (
                                <Icon name="information-circle" {...props} />
                            ),
                        }}
                    />
                    <Tab.Screen
                        name="Image Grid"
                        component={DefaultImageGrid}
                        options={{
                            tabBarButtonTestID: 'tab-image-grid',
                            tabBarIcon: (props) => (
                                <Icon name="image-outline" {...props} />
                            ),
                        }}
                    />
                    <Tab.Screen
                        name="FastImage Grid"
                        component={FastImageGrid}
                        options={{
                            tabBarButtonTestID: 'tab-fastimage-grid',
                            tabBarIcon: (props) => (
                                <Icon name="images-outline" {...props} />
                            ),
                        }}
                    />
                    <Tab.Screen
                        name="Regression"
                        component={RegressionExample}
                        options={{
                            tabBarButtonTestID: 'tab-regression',
                            tabBarIcon: (props) => (
                                <Icon
                                    name="checkmark-circle-outline"
                                    {...props}
                                />
                            ),
                        }}
                    />
                </Tab.Navigator>
            </NavigationContainer>
        </SafeAreaProvider>
    )
}
