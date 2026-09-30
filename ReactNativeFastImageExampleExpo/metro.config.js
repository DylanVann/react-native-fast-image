const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')
const pkg = require('../package.json')

const root = path.resolve(__dirname, '..')
const example = path.join(root, 'ReactNativeFastImageExample')
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const dir = (p) => new RegExp(`^${escape(p)}\\/.*$`)

const config = getDefaultConfig(__dirname)

config.watchFolders = [...(config.watchFolders ?? []), root]
config.resolver.blockList = [
    ...[config.resolver.blockList ?? []].flat(),
    // The shared screens (../ReactNativeFastImageExample/src) and the library
    // source (../src) use this app's dependencies, not the main example's or
    // the repo root's dev copies.
    dir(path.join(example, 'node_modules')),
    dir(path.join(example, 'ios')),
    dir(path.join(example, 'android')),
    ...Object.keys(pkg.peerDependencies).map((m) =>
        dir(path.join(root, 'node_modules', m)),
    ),
    // What changes while the app runs and isn't JavaScript (see the main
    // example's metro.config.js).
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
config.resolver.nodeModulesPaths = [path.join(__dirname, 'node_modules')]
// Load the library from its source (its web version on the web), so changes
// show up without a build, unless `scripts/verify.mts --package` installed
// the package.
const resolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === pkg.name && !process.env.FAST_IMAGE_FROM_PACKAGE) {
        return {
            type: 'sourceFile',
            filePath: path.join(
                root,
                'src',
                platform === 'web' ? 'index.web.tsx' : 'index.tsx',
            ),
        }
    }
    return (resolveRequest ?? context.resolveRequest)(
        context,
        moduleName,
        platform,
    )
}

module.exports = config
