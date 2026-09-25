# Development

The example app in `ReactNativeFastImageExample` runs against the library source in this repo, so changes to `src/`, `ios/`, and `android/` show up without publishing or linking anything.

- JS/TS changes in `src/` are picked up by Metro (fast refresh).
- Native changes in `ios/` or `android/` need the app to be rebuilt.

## Requirements

- Node 22.11 or later
- [Bun](https://bun.sh), which installs dependencies and runs package scripts (Node still runs the tools)
- Xcode, CocoaPods (via Bundler), and an iOS simulator
- JDK 17, the Android SDK, and an Android emulator

## Running the example

```bash
# In the repo root folder.
bun install

# Move to the example folder and install its dependencies.
cd ReactNativeFastImageExample
bun install

# Install pods (repeat after changing the podspec or native dependencies).
bundle install
bundle exec pod install --project-directory=ios

# Start the packager.
bun run start

# In another terminal, build and run the app.
bun run ios
bun run android
```

## Testing on older React Native (legacy architecture)

`ReactNativeFastImageExampleLegacy` runs the same screens (`ReactNativeFastImageExample/src`) on React Native 0.73 with the legacy architecture (Paper and the bridge). Use it to check that fixes still work for apps on older React Native versions.

```bash
cd ReactNativeFastImageExampleLegacy
bun install
bundle install
bundle exec pod install --project-directory=ios

# Stop the main example's packager first; both use port 8081.
bun run start
bun run ios
bun run android
```

Its `metro.config.js` resolves every import from the shared screens and the library source to this app's `node_modules`. The Gemfile and Podfile carry a few workarounds so React Native 0.73 still builds with current Ruby and Xcode.

## Verifying changes

`scripts/verify.mts` checks the library and runs both example apps on iOS and Android. Run it with Node 24 (or 22.18+), which runs TypeScript directly:

1. Builds the library, runs its tests, and type-checks the example and the script.
2. For each app, builds it for iOS and Android in parallel, starts its packager, and runs the Maestro flows on both platforms at once. A failed flow or a crash fails the run.

```bash
node scripts/verify.mts                      # everything
node scripts/verify.mts --app legacy --ios   # one app and platform
node scripts/verify.mts --ref main           # the library code from main, for a "before" run
```

The flows are [Maestro](https://maestro.dev) YAML, run with [maestro-runner](https://github.com/devicelab-dev/maestro-runner), which is faster than the Maestro CLI (about 40% less time here), can drive iOS and Android at the same time, and is installed by `bun install` as a dev dependency. Screenshots are saved in each run's report (`verify-output/…/<app>-<platform>/report/assets/`).

Run `node scripts/verify.mts --help` for all options. Use an Android emulator with a plain AOSP system image (`system-images;android-36;default;arm64-v8a`, not Google APIs), at least 4 GB of RAM and hardware graphics (`hw.ramSize` and `hw.gpu.mode = host` in the AVD's `config.ini`; the script starts emulators with `-gpu host` and no window: macOS throttles the emulator while its window is hidden or behind the iOS Simulator, and the app stalls until the window is brought forward), and pick it with `ANDROID_AVD`. Google APIs images run Play services and other apps in the background; combined with the example's animated images they overload the emulator until system dialogs ("… isn't responding") cover the app and flows fail. ATD images are lighter still, but render a black screen, so screenshots are empty. The script also sets `hide_error_dialogs` on emulators. Builds and each app and platform's flows have time limits; raise them with `VERIFY_BUILD_TIMEOUT` or `VERIFY_FLOWS_TIMEOUT` (seconds) if one is hit. Logs, screenshots and crash reports go to `verify-output/`. It needs a free port 8081, an iOS simulator, and an Android emulator (it starts one if none is running).

### Maestro flows

- `maestro/walkthrough.yaml` scrolls through every example, checks that the progress events fire, opens both grids, and saves screenshots.
- `maestro/regression.yaml` opens the **Regression** tab and waits for every case to report `OK`. Each case covers a fixed bug (for example, removing an event handler after it fires). Add a case there when fixing a bug that can be reproduced in the app.

To run a flow by hand against a running app:

```bash
bunx maestro-runner --platform ios test -e APP_ID=org.reactjs.native.example.ReactNativeFastImageExample maestro/regression.yaml
```

With Xcode 27, maestro-runner 1.1.27 needs `XCODE_XCCONFIG_FILE=scripts/maestro-runner-wda.xcconfig` for iOS (its bundled WebDriverAgent targets iOS 12); `verify.mts` sets this.

The app IDs for each app and platform are listed at the top of `maestro/walkthrough.yaml`.

## How the example uses the library

- `react-native.config.js` autolinks the library's native code from the repo root.
- `metro.config.js` resolves `react-native-fast-image` to `../src/index.tsx` and makes the library source use the example's `react` and `react-native`, not the repo root's dev copies.
- `tsconfig.json` does the same for TypeScript.
