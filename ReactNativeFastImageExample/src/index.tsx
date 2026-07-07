import React from 'react'
import { LogBox } from 'react-native'
import {
    NavigationContainer,
    DefaultTheme,
    DarkTheme,
} from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Icon } from './Icon'
import { useTheme } from './theme'
import FastImageExamples from './FastImageExamples'
import FastImageGrid from './FastImageGrid'
import DefaultImageGrid from './DefaultImageGrid'

const Tab = createBottomTabNavigator()

LogBox.ignoreLogs([
    'Warning: isMounted(...) is deprecated',
    'Module RCTImageLoader',
])

// Hoisted to module scope (not defined inline in options={{...}}) so
// react-navigation doesn't see a new component type on every App() render.
type TabBarIconProps = { color: string; size: number; focused: boolean }
const renderHomeIcon = (props: TabBarIconProps) => (
    <Icon name="home-outline" {...props} />
)
const renderGridIcon = (props: TabBarIconProps) => (
    <Icon name="image-outline" {...props} />
)
const renderFastGridIcon = (props: TabBarIconProps) => (
    <Icon name="images-outline" {...props} />
)

export default function App() {
    const theme = useTheme()
    const navigationTheme = {
        ...(theme.dark ? DarkTheme : DefaultTheme),
        colors: {
            ...(theme.dark ? DarkTheme.colors : DefaultTheme.colors),
            background: theme.background,
            card: theme.tabBarBackground,
        },
    }

    return (
        <NavigationContainer theme={navigationTheme}>
            <Tab.Navigator
                screenOptions={{
                    headerShown: false,
                    tabBarActiveTintColor: theme.tabBarActive,
                    tabBarInactiveTintColor: theme.tabBarInactive,
                    tabBarStyle: {
                        backgroundColor: theme.tabBarBackground,
                        borderTopColor: theme.border,
                    },
                    tabBarLabelStyle: { fontWeight: '600', fontSize: 11 },
                }}
            >
                <Tab.Screen
                    name="FastImage Example"
                    component={FastImageExamples}
                    options={{
                        tabBarLabel: 'Home',
                        tabBarIcon: renderHomeIcon,
                    }}
                />
                <Tab.Screen
                    name="Image Grid"
                    component={DefaultImageGrid}
                    options={{
                        tabBarLabel: 'Grid',
                        tabBarIcon: renderGridIcon,
                    }}
                />
                <Tab.Screen
                    name="FastImage Grid"
                    component={FastImageGrid}
                    options={{
                        tabBarLabel: 'Fast',
                        tabBarIcon: renderFastGridIcon,
                    }}
                />
            </Tab.Navigator>
        </NavigationContainer>
    )
}
