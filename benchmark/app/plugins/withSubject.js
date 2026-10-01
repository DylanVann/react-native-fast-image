// Links only this build's subject (see subjects.js): expo-image is an Expo
// module, so it's excluded in the Podfile's use_expo_modules! (the React
// Native packages are in react-native.config.js). Adds the subject's own
// Podfile lines (`podfile` in subjects.json).
//
// Expo's precompiled modules are off: they stub out SDWebImage's sources when
// an excluded module's prebuilt framework would have bundled it, which leaves
// FastImage's SDWebImage symbols undefined. Every subject is built from
// source the same way.
const { withPodfile, withPodfileProperties } = require('expo/config-plugins')
const { others, subjects, subject } = require('../subjects')

module.exports = (config) => {
    config = withPodfileProperties(config, (config) => {
        config.modResults.EXPO_USE_PRECOMPILED_MODULES = 'false'
        return config
    })
    return withPodfile(config, (config) => {
        // Lines the subject needs in the app's target (subjects.json), e.g.
        // Nitro Image's Swift pods need SDWebImage's module map.
        const lines = subjects[subject].podfile ?? []
        if (lines.length > 0) {
            config.modResults.contents = config.modResults.contents.replace(
                /^(\s*)use_expo_modules!.*$/m,
                (line, indent) =>
                    [line, ...lines.map((l) => indent + l)].join('\n'),
            )
        }
        const exclude = others.filter((name) => name === 'expo-image')
        if (exclude.length > 0) {
            config.modResults.contents = config.modResults.contents.replace(
                /use_expo_modules!\s*$/m,
                `use_expo_modules!({ exclude: ${JSON.stringify(exclude)} })`,
            )
        }
        return config
    })
}
