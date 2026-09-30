const Module = require('module')
const path = require('path')

// FastImage's Expo config plugin: the package's when `scripts/verify.mts
// --package` installed it, else the repo's app.plugin.js. That one requires
// expo/config-plugins, which the repo root doesn't have, so it's also looked up
// in this app's node_modules.
const fromPackage = !!process.env.FAST_IMAGE_FROM_PACKAGE
if (!fromPackage) {
    process.env.NODE_PATH = [
        path.join(__dirname, 'node_modules'),
        process.env.NODE_PATH,
    ]
        .filter(Boolean)
        .join(path.delimiter)
    Module._initPaths()
}

module.exports = {
    expo: {
        name: 'ReactNativeFastImageExampleExpo',
        slug: 'ReactNativeFastImageExampleExpo',
        version: '1.0.0',
        orientation: 'portrait',
        icon: './assets/icon.png',
        userInterfaceStyle: 'light',
        ios: {
            supportsTablet: true,
            bundleIdentifier:
                'org.reactjs.native.example.ReactNativeFastImageExampleExpo',
        },
        android: {
            package: 'com.reactnativefastimageexampleexpo',
            adaptiveIcon: {
                backgroundColor: '#E6F4FE',
                foregroundImage: './assets/android-icon-foreground.png',
                backgroundImage: './assets/android-icon-background.png',
                monochromeImage: './assets/android-icon-monochrome.png',
            },
            predictiveBackGestureEnabled: false,
        },
        web: {
            favicon: './assets/favicon.png',
        },
        experiments: {
            // tsconfig.json's paths are for type checking only (they point
            // react at its types); metro.config.js resolves the library.
            tsconfigPaths: false,
        },
        plugins: [
            './plugins/withSceneLifecycle',
            [
                fromPackage ? 'react-native-fast-image' : '../app.plugin.js',
                // The limits the smoke cases check (EXPO_CACHE_LIMITS in
                // ../ReactNativeFastImageExample/src/SmokeExample.tsx).
                {
                    maxDiskSize: 150 * 1024 * 1024,
                    maxDiskAge: 7 * 24 * 60 * 60,
                    maxMemorySize: 50 * 1024 * 1024,
                },
            ],
        ],
    },
}
