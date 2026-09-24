const path = require('path')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const pkg = require('../package.json')

const root = path.resolve(__dirname, '..')
const example = path.join(root, 'ReactNativeFastImageExample')
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const dir = (p) => new RegExp(`^${escape(p)}\\/.*$`)

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
        ],
        nodeModulesPaths: [path.join(__dirname, 'node_modules')],
        // Needed for subpath imports like @react-native-vector-icons/ionicons/static;
        // on by default in newer React Native.
        unstable_enablePackageExports: true,
        // Load the library from its source so changes show up without a build.
        resolveRequest: (context, moduleName, platform) => {
            if (moduleName === pkg.name) {
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
