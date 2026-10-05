const path = require('path')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const pkg = require('../package.json')

const root = path.resolve(__dirname, '..')
const example = path.join(root, 'ReactNativeFastImageExample')
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const dir = (p) => new RegExp(`^${escape(p)}\\/.*$`)

// Metro sends the app an update for any change in its watch folders, even a
// file the app doesn't use, and React Native shows "Refreshing..." for it
// (in verify.mts's screenshots too). Leave out what changes while the app
// runs and isn't JavaScript: verify.mts's output and references, local
// notes, and the native projects builds write into.
const notSource = [
    ...[
        'verify-output',
        'screenshots',
        'recordings',
        '.local',
        'android',
        'ios',
    ].map((d) => dir(path.join(root, d))),
    dir(path.join(__dirname, 'android')),
    dir(path.join(__dirname, 'ios')),
    new RegExp(`^${escape(root)}\\/[^/]+\\.md$`),
]

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
    watchFolders: [root],
    resolver: {
        // The screens (../ReactNativeFastImageExample/src) and the library
        // source (../src) must use this app's dependencies, not the main
        // example's or the repo root's dev copies.
        blockList: [
            dir(path.join(example, 'node_modules')),
            dir(path.join(example, 'ios')),
            dir(path.join(example, 'android')),
            ...Object.keys(pkg.peerDependencies).map((m) =>
                dir(path.join(root, 'node_modules', m)),
            ),
            ...notSource,
        ],
        nodeModulesPaths: [path.join(__dirname, 'node_modules')],
        // Needed for subpath imports like @react-native-vector-icons/ionicons/static;
        // on by default in newer React Native.
        unstable_enablePackageExports: true,
        // Load the library from its source so changes show up without a build
        // (unless `scripts/verify.mts --package` installed the package).
        resolveRequest: (context, moduleName, platform) => {
            if (
                moduleName === pkg.name &&
                !process.env.FAST_IMAGE_FROM_PACKAGE
            ) {
                return {
                    type: 'sourceFile',
                    filePath: path.join(root, 'src', 'index.tsx'),
                }
            }
            return context.resolveRequest(context, moduleName, platform)
        },
    },
}

module.exports = mergeConfig(getDefaultConfig(__dirname), config)
