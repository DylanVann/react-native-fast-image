import React from 'react'
import { LogBox } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Icon } from './Icon'
import FastImageExamples from './FastImageExamples'
import FastImageGrid from './FastImageGrid'
import DefaultImageGrid from './DefaultImageGrid'
import RegressionExample from './RegressionExample'

const Tab = createBottomTabNavigator()

LogBox.ignoreLogs([
    'Warning: isMounted(...) is deprecated',
    'Module RCTImageLoader',
])

export default function App() {
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
