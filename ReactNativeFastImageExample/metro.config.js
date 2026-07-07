/**
 * Metro configuration for React Native
 * https://github.com/facebook/react-native
 *
 * @format
 */

const path = require('path')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')

const projectRoot = __dirname
// react-native-fast-image is `bun link`-ed in from the repo root, outside
// this app's own directory tree - Metro won't follow that symlink or watch
// its source unless told to.
const workspaceRoot = path.resolve(projectRoot, '..')

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
    watchFolders: [workspaceRoot],
    resolver: {
        unstable_enableSymlinks: true,
        nodeModulesPaths: [
            path.resolve(projectRoot, 'node_modules'),
            path.resolve(workspaceRoot, 'node_modules'),
        ],
        // react-native-fast-image's own node_modules also has react/react-native
        // installed (its devDependencies). `extraNodeModules` alone is only a
        // fallback for names that fail to resolve - since dist/index.cjs.js can
        // resolve 'react'/'react-native' fine from its own directory, that
        // fallback never triggers. Force it via resolveRequest instead, so both
        // the app and the linked library always share this app's single copy
        // (otherwise: two React instances loaded -> "Invalid hook call").
        resolveRequest: (context, moduleName, platform) => {
            if (
                moduleName === 'react' ||
                moduleName === 'react-native' ||
                moduleName.startsWith('react-native/') ||
                moduleName.startsWith('react/')
            ) {
                return context.resolveRequest(
                    { ...context, originModulePath: path.join(projectRoot, 'package.json') },
                    moduleName,
                    platform,
                )
            }
            return context.resolveRequest(context, moduleName, platform)
        },
    },
    transformer: {
        getTransformOptions: async () => ({
            transform: {
                experimentalImportSupport: false,
                inlineRequires: true,
            },
        }),
    },
}

module.exports = mergeConfig(getDefaultConfig(projectRoot), config)
