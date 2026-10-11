// Expo config plugin: sets FastImage's cache limits in the native projects, so
// they're in effect from the first image. In app.json:
//
//     "plugins": [["react-native-fast-image", { "maxDiskSize": 209715200 }]]
//
// maxDiskSize (bytes), maxDiskAge (seconds, iOS) and maxMemorySize (bytes,
// iOS); 0 means no limit. See the README's Native config section.

const INFO_PLIST_KEYS = {
    maxDiskSize: 'FastImageMaxDiskSize',
    maxDiskAge: 'FastImageMaxDiskAge',
    maxMemorySize: 'FastImageMaxMemorySize',
}
const ANDROID_MAX_DISK_SIZE = 'fastimage.MAX_DISK_SIZE'

// Sets the limits given in the iOS Info.plist.
function setInfoPlist(infoPlist, options = {}) {
    for (const [name, key] of Object.entries(INFO_PLIST_KEYS)) {
        if (typeof options[name] === 'number') infoPlist[key] = options[name]
    }
    return infoPlist
}

// Sets maxDiskSize in the Android manifest's application meta-data (Android
// only has that limit).
function setAndroidManifest(manifest, options = {}) {
    if (typeof options.maxDiskSize !== 'number') return manifest
    const application = manifest.manifest.application[0]
    const metaData = (application['meta-data'] || []).filter(
        (item) => item.$['android:name'] !== ANDROID_MAX_DISK_SIZE,
    )
    metaData.push({
        $: {
            'android:name': ANDROID_MAX_DISK_SIZE,
            'android:value': String(options.maxDiskSize),
        },
    })
    application['meta-data'] = metaData
    return manifest
}

function withFastImage(config, options) {
    // From the Expo project's expo package.
    const plugins = require('expo/config-plugins')
    config = plugins.withInfoPlist(config, (mod) => {
        mod.modResults = setInfoPlist(mod.modResults, options)
        return mod
    })
    return plugins.withAndroidManifest(config, (mod) => {
        mod.modResults = setAndroidManifest(mod.modResults, options)
        return mod
    })
}

module.exports = withFastImage
module.exports.setInfoPlist = setInfoPlist
module.exports.setAndroidManifest = setAndroidManifest
