import { Platform } from 'react-native'

// Remote images come from the example image server
// (ReactNativeFastImageExampleServer) rather than the internet, so the
// examples and flows don't depend on other servers. The Android emulator
// reaches the computer at 10.0.2.2.
const HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost'

export const imageUrl = (path: string) => `http://${HOST}:8090/${path}`

// The same images sent slowly (about 7 s, with progress), which needs the
// header `x-token: fast-image`. See ReactNativeFastImageExampleServer.
export const slowImageUrl = (path: string) => `http://${HOST}:8091/${path}`

// The server also relays the regression runner's WebSocket (RegressionRunner.tsx)
// to scripts/verify.mts, and says whether the script is waiting for the app.
// An Apple TV app is on its own channel (tvos), so an iPhone app left open on
// another simulator doesn't take its place (Platform.OS is ios on both).
const RELAY_PLATFORM = Platform.isTV ? 'tvos' : Platform.OS
export const regressionCheckUrl = () =>
    `http://${HOST}:8090/regression?platform=${RELAY_PLATFORM}`
export const regressionSocketUrl = () =>
    `ws://${HOST}:8090/regression?role=app&platform=${RELAY_PLATFORM}`
