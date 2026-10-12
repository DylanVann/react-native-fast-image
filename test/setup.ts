// Preloaded by `bun test` (bunfig.toml).
import { plugin } from 'bun'
import { mock } from 'bun:test'
import path from 'node:path'

// React Native is Flow-typed source, which Bun can't parse; the tests use a
// small stand-in instead.
mock.module('react-native', () => require('./react-native'))

// react-native-web's asset registry, where the web version looks up a
// require()d image's number (react-native-web isn't installed here). The
// tests register their own.
const assets: unknown[] = []
mock.module('react-native-web/dist/modules/AssetRegistry', () => ({
    registerAsset: (asset: unknown) => assets.push(asset),
    getAssetByID: (id: number) => assets[id - 1],
}))

// Tests render inside act() (test/render.ts), as React 19 expects, in React
// Native's test environment, as its Jest preset sets up (react-test-renderer
// warns that it's deprecated otherwise).
const testGlobals = globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean
    IS_REACT_NATIVE_TEST_ENVIRONMENT?: boolean
}
testGlobals.IS_REACT_ACT_ENVIRONMENT = true
testGlobals.IS_REACT_NATIVE_TEST_ENVIRONMENT = true

// require()d images become { testUri } objects, as with React Native's Jest
// preset (jest/assetFileTransformer.js).
plugin({
    name: 'react-native-assets',
    setup(build) {
        build.onLoad({ filter: /\.(bmp|gif|jpg|jpeg|png|webp)$/ }, (args) => ({
            loader: 'object',
            exports: {
                testUri: path.relative(
                    path.join(import.meta.dir, '..'),
                    args.path,
                ),
            },
        }))
    },
})
