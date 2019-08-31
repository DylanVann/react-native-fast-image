import { YellowBox } from 'react-native'
import { createBottomTabNavigator, createAppContainer } from 'react-navigation'
import FastImageExamples from './FastImageExamples'
import FastImageGrid from './FastImageGrid'
import DefaultImageGrid from './DefaultImageGrid'

YellowBox.ignoreWarnings([
    'Warning: isMounted(...) is deprecated',
    'Module RCTImageLoader',
])

const App = createBottomTabNavigator({
    fastImageExample: {
        screen: FastImageExamples,
    },
    image: {
        screen: DefaultImageGrid,
    },
    fastImage: {
        screen: FastImageGrid,
    },
})

export default createAppContainer(App)
