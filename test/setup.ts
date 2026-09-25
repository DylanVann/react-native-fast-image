// Preloaded by `bun test` (bunfig.toml).
import { plugin } from 'bun'
import { mock } from 'bun:test'
import path from 'node:path'

// React Native is Flow-typed source, which Bun can't parse; the tests use a
// small stand-in instead.
mock.module('react-native', () => require('./react-native'))

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
