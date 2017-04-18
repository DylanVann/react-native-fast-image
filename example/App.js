// @flow
import React from 'react'
import { TabNavigator, TabView } from 'react-navigation'
import FastImageExample from './FastImageExample'
import FastImageGrid from './FastImageGrid'
import DefaultImageGrid from './DefaultImageGrid'

const App = TabNavigator(
  {
    fastImageExample: {
      screen: FastImageExample,
    },
    image: {
      screen: DefaultImageGrid,
    },
    fastImage: {
      screen: FastImageGrid,
    },
  },
  {
    tabBarComponent: TabView.TabBarBottom,
    tabBarPosition: 'bottom',
    swipeEnabled: false,
    animationEnabled: false,
    tabBarOptions: {
      style: {
        backgroundColor: 'white',
      },
    },
  },
)

export default App
