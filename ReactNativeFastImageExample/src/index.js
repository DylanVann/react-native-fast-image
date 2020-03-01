import React from 'react'
import { YellowBox } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Icon } from './Icon'
import FastImageExamples from './FastImageExamples'
import FastImageGrid from './FastImageGrid'
import DefaultImageGrid from './DefaultImageGrid'

const Tab = createBottomTabNavigator()

YellowBox.ignoreWarnings([
    'Warning: isMounted(...) is deprecated',
    'Module RCTImageLoader',
])

export default function App() {
    return (
        <NavigationContainer>
            <Tab.Navigator>
                <Tab.Screen
                    name="FastImage Example"
                    component={FastImageExamples}
                    options={{
                        tabBarIcon: props => (
                            <Icon name="ios-information-circle" {...props} />
                        ),
                    }}
                />
                <Tab.Screen
                    name="Image Grid"
                    component={DefaultImageGrid}
                    options={{
                        tabBarIcon: props => (
                            <Icon name="ios-image" {...props} />
                        ),
                    }}
                />
                <Tab.Screen
                    name="FastImage Grid"
                    component={FastImageGrid}
                    options={{
                        tabBarIcon: props => (
                            <Icon name="ios-photos" {...props} />
                        ),
                    }}
                />
            </Tab.Navigator>
        </NavigationContainer>
    )
}
