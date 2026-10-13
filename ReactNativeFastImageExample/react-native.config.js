const path = require('path')
const pkg = require('../package.json')

// Autolink the library's native code (ios/, android/) from the repo root, or
// from the package that `scripts/verify.mts --package` installs, and
// react-native-fast-image-nitro-image's from packages/.
module.exports = {
    dependencies: {
        [pkg.name]: {
            root: process.env.FAST_IMAGE_FROM_PACKAGE
                ? path.join(__dirname, 'node_modules', pkg.name)
                : path.join(__dirname, '..'),
        },
        'react-native-fast-image-nitro-image': {
            root: path.join(
                __dirname,
                '..',
                'packages',
                'react-native-fast-image-nitro-image',
            ),
        },
    },
}
