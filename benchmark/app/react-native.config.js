// Turns off the other subjects' native code (see subjects.js).
const { others } = require('./subjects')

module.exports = {
    dependencies: Object.fromEntries(
        others
            .filter((name) => name !== 'expo-image')
            .map((name) => [name, { platforms: { ios: null, android: null } }]),
    ),
}
