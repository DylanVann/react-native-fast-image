const path = require('path')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const pkg = require('../package.json')

const root = path.resolve(__dirname, '..')

// The repo root has its own dev copies of the library's peer dependencies
// (react, react-native). Block them so the library source uses this app's.
const peers = Object.keys(pkg.peerDependencies)
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
    watchFolders: [root],
    resolver: {
        blockList: peers.map(
            (m) =>
                new RegExp(
                    `^${escape(path.join(root, 'node_modules', m))}\\/.*$`,
                ),
        ),
        extraNodeModules: Object.fromEntries(
            peers.map((m) => [m, path.join(__dirname, 'node_modules', m)]),
        ),
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
