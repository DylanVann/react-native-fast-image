// The fast-image-local subject loads FastImage from this checkout (../..):
// its source (the root's src/, the only folder of the repo watched), with
// this app's dependencies (react, react-native) rather than the repo root's
// dev copies. Its native code is linked in react-native.config.js.
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')
const { subjects, subject } = require('./subjects')

const config = getDefaultConfig(__dirname)
const local = subjects[subject].local
if (local) {
    const src = path.resolve(__dirname, '..', '..', 'src')
    config.watchFolders = [...(config.watchFolders ?? []), src]
    const resolveRequest = config.resolver.resolveRequest
    config.resolver.resolveRequest = (context, moduleName, platform) => {
        const resolve = resolveRequest ?? context.resolveRequest
        if (moduleName === local) {
            return {
                type: 'sourceFile',
                filePath: path.join(src, 'index.tsx'),
            }
        }
        if (
            context.originModulePath.startsWith(src + path.sep) &&
            !moduleName.startsWith('.')
        ) {
            return resolve(
                {
                    ...context,
                    originModulePath: path.join(__dirname, 'index.ts'),
                },
                moduleName,
                platform,
            )
        }
        return resolve(context, moduleName, platform)
    }
}

module.exports = config
