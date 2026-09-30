const { withAppDelegate, withInfoPlist } = require('expo/config-plugins')

// iOS 27 stops an app at launch unless it uses the scene life cycle, and
// Expo's SDK 57 project template doesn't (its AppDelegate creates the window).
// This switches the generated project to Expo's own ExpoAppSceneDelegate
// (in the expo package): the Info.plist names it as the scene delegate, and
// the AppDelegate leaves the window and starting React Native to it. Remove it
// once the template does this itself.
module.exports = function withSceneLifecycle(config) {
    config = withInfoPlist(config, (mod) => {
        mod.modResults.UIApplicationSceneManifest = {
            UIApplicationSupportsMultipleScenes: false,
            UISceneConfigurations: {
                UIWindowSceneSessionRoleApplication: [
                    {
                        UISceneConfigurationName: 'Default Configuration',
                        UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
                    },
                ],
            },
        }
        return mod
    })
    return withAppDelegate(config, (mod) => {
        let source = mod.modResults.contents
        const replace = (from, to) => {
            if (!source.includes(from)) {
                throw new Error(
                    `withSceneLifecycle: the AppDelegate no longer has ${JSON.stringify(from)}`,
                )
            }
            source = source.replace(from, to)
        }
        replace(
            'class AppDelegate: ExpoAppDelegate {',
            'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
        )
        // The scene delegate creates the window and starts React Native in it.
        source = source.replace(
            /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/,
            '',
        )
        if (source.includes('factory.startReactNative(')) {
            throw new Error(
                'withSceneLifecycle: the AppDelegate still starts React Native itself',
            )
        }
        mod.modResults.contents = source
        return mod
    })
}
