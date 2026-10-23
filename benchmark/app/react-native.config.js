// Turns off the other subjects' native code (see subjects.js), and links the
// fast-image-local subject's package (../scripts/local.ts), which isn't in
// package.json.
const path = require('path')
const { others, subjects, subject } = require('./subjects')

const local = subjects[subject].local

module.exports = {
    dependencies: {
        ...Object.fromEntries(
            others
                .filter((name) => name !== 'expo-image')
                .map((name) => [
                    name,
                    { platforms: { ios: null, android: null } },
                ]),
        ),
        ...(local
            ? { [local]: { root: path.join(__dirname, 'node_modules', local) } }
            : {}),
    },
}
