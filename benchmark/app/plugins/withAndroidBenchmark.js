// The Android build's benchmark setup (see ../../android):
// - expo-image (an Expo module) is excluded unless it's the subject, as
//   withSubject does on iOS (the React Native packages are in
//   react-native.config.js);
// - the Macrobenchmark module (../../android/macrobenchmark) is copied into
//   the generated project and included in the build;
// - the app is profileable from the shell, and has profileinstaller (1.4+
//   for API 34+), which Macrobenchmark needs to measure a release build.
const fs = require('fs')
const path = require('path')
const {
    withAndroidManifest,
    withAppBuildGradle,
    withDangerousMod,
    withSettingsGradle,
} = require('expo/config-plugins')
const { others } = require('../subjects')

const MODULE = path.join(__dirname, '..', '..', 'android', 'macrobenchmark')

module.exports = (config) => {
    config = withSettingsGradle(config, (config) => {
        let contents = config.modResults.contents
        const exclude = others.filter((name) => name === 'expo-image')
        if (exclude.length > 0) {
            contents = contents.replace(
                /^expoAutolinking\.useExpoModules\(\)/m,
                `expoAutolinking.exclude = ${JSON.stringify(exclude)}\nexpoAutolinking.useExpoModules()`,
            )
        }
        if (!contents.includes("include ':macrobenchmark'")) {
            contents = contents.replace(
                "include ':app'",
                "include ':app'\ninclude ':macrobenchmark'",
            )
        }
        config.modResults.contents = contents
        return config
    })
    config = withDangerousMod(config, [
        'android',
        (config) => {
            const target = path.join(
                config.modRequest.platformProjectRoot,
                'macrobenchmark',
            )
            fs.rmSync(target, { recursive: true, force: true })
            fs.cpSync(MODULE, target, { recursive: true })
            return config
        },
    ])
    config = withAppBuildGradle(config, (config) => {
        const line =
            "    implementation 'androidx.profileinstaller:profileinstaller:1.4.1'"
        if (!config.modResults.contents.includes('profileinstaller')) {
            config.modResults.contents = config.modResults.contents.replace(
                /^dependencies \{$/m,
                `dependencies {\n${line}`,
            )
        }
        return config
    })
    return withAndroidManifest(config, (config) => {
        const application = config.modResults.manifest.application?.[0]
        if (application) {
            application.profileable = [
                { $: { 'android:shell': 'true', 'tools:targetApi': '29' } },
            ]
            config.modResults.manifest.$['xmlns:tools'] =
                'http://schemas.android.com/tools'
        }
        return config
    })
}
