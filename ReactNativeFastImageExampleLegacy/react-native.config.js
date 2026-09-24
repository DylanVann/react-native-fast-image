const path = require('path')
const pkg = require('../package.json')

// Autolink the library's native code (ios/, android/) from the repo root.
module.exports = {
    dependencies: {
        [pkg.name]: {
            root: path.join(__dirname, '..'),
        },
    },
}
