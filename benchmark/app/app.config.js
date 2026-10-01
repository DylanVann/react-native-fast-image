// The benchmark app, built once per subject (see ../scripts/build.mts):
// BENCH_SUBJECT picks the image library, which the build installs alone. Each
// subject is its own app (bundle id), so they can be installed side by side.
const { subject } = require('./subjects')

module.exports = {
    expo: {
        name: `Bench ${subject}`,
        slug: 'react-native-fast-image-benchmark',
        // Android launches a scenario with rnfibench://run?scenario=…&run=…
        scheme: 'rnfibench',
        version: '1.0.0',
        orientation: 'portrait',
        userInterfaceStyle: 'light',
        ios: {
            bundleIdentifier: `com.dylanvann.rnfibenchmark.${subject.replace(/[^a-z0-9]/gi, '')}`,
            appleTeamId: 'U8E2VB5JLQ',
        },
        android: {
            package: `com.dylanvann.rnfibenchmark.${subject.replace(/[^a-z0-9]/gi, '')}`,
        },
        plugins: [
            './plugins/withSceneLifecycle',
            './plugins/withSubject',
            './plugins/withAndroidBenchmark',
        ],
        extra: { subject },
    },
}
