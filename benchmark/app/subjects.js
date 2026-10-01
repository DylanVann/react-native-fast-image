// The subjects (subjects.json) and which one this build is for
// (BENCH_SUBJECT). Each build links only its subject's native code: the other
// subjects' React Native packages are turned off in react-native.config.js,
// and expo-image (an Expo module) in plugins/withSubject.js.
const subjects = require('./subjects.json')

const subject = process.env.BENCH_SUBJECT ?? 'image'
if (!subjects[subject]) {
    throw new Error(
        `Unknown BENCH_SUBJECT ${subject}: ${Object.keys(subjects).join(', ')}`,
    )
}
const own = Object.keys(subjects[subject].packages)
const others = [
    ...new Set(Object.values(subjects).flatMap((s) => Object.keys(s.packages))),
].filter((name) => !own.includes(name))

module.exports = { subjects, subject, own, others }
