// The Android build's benchmark setup (see ../../android):
// - expo-image (an Expo module) is excluded unless it's the subject, as
//   withSubject does on iOS (the React Native packages are in
//   react-native.config.js);
// - the Macrobenchmark module (../../android/macrobenchmark) is copied into
//   the generated project and included in the build;
// - the module's assets get the images (../../images/out), which its tests
//   serve on the phone, and the app may load them over HTTP from 127.0.0.1
//   (only);
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
const IMAGES = path.join(__dirname, '..', '..', 'images', 'out')

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">127.0.0.1</domain>
    </domain-config>
</network-security-config>
`

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
            if (!fs.existsSync(path.join(IMAGES, 'manifest.json'))) {
                throw new Error(
                    `No images in ${IMAGES}: run make-images.ts (benchmark/images)`,
                )
            }
            fs.cpSync(
                IMAGES,
                path.join(target, 'src', 'main', 'assets', 'images'),
                {
                    recursive: true,
                },
            )
            const xml = path.join(
                config.modRequest.platformProjectRoot,
                'app',
                'src',
                'main',
                'res',
                'xml',
            )
            fs.mkdirSync(xml, { recursive: true })
            fs.writeFileSync(
                path.join(xml, 'network_security_config.xml'),
                NETWORK_SECURITY_CONFIG,
            )
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
            application.$['android:networkSecurityConfig'] =
                '@xml/network_security_config'
            application.profileable = [
                { $: { 'android:shell': 'true', 'tools:targetApi': '29' } },
            ]
            config.modResults.manifest.$['xmlns:tools'] =
                'http://schemas.android.com/tools'
        }
        return config
    })
}
