import { Platform } from 'react-native'

// Remote images come from the example image server
// (ReactNativeFastImageExampleServer) rather than the internet, so the
// examples and flows don't depend on other servers. The Android emulator
// reaches the computer at 10.0.2.2.
const HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost'

export const imageUrl = (path: string) => `http://${HOST}:8090/${path}`
