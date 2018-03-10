import React from 'react'
import { TabNavigator, TabBarBottom } from 'react-navigation'
import FastImageExamples from './fastImage/FastImageExamples'
import FastImageGrid from './fastImage/FastImageGrid'
import DefaultImageGrid from './fastImage/DefaultImageGrid'

const App = TabNavigator(
  {
    fastImageExample: {
      screen: FastImageExamples,
    },
    image: {
      screen: DefaultImageGrid,
    },
    fastImage: {
      screen: FastImageGrid,
    },
  },
  {
    tabBarComponent: TabBarBottom,
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
