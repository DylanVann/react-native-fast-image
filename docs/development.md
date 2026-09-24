# Development

The example app in `ReactNativeFastImageExample` runs against the library source in this repo, so changes to `src/`, `ios/`, and `android/` show up without publishing or linking anything.

-   JS/TS changes in `src/` are picked up by Metro (fast refresh).
-   Native changes in `ios/` or `android/` need the app to be rebuilt.

## Requirements

-   Node 22.11 or later
-   Xcode, CocoaPods (via Bundler), and an iOS simulator
-   JDK 17, the Android SDK, and an Android emulator

## Running the example

```bash
# In the repo root folder.
yarn

# Move to the example folder and install its dependencies.
cd ReactNativeFastImageExample
yarn

# Install pods (repeat after changing the podspec or native dependencies).
bundle install
bundle exec pod install --project-directory=ios

# Start the packager.
yarn start

# In another terminal, build and run the app.
yarn ios
yarn android
```

## Testing on older React Native (legacy architecture)

`ReactNativeFastImageExampleLegacy` runs the same screens (`ReactNativeFastImageExample/src`) on React Native 0.73 with the legacy architecture (Paper and the bridge). Use it to check that fixes still work for apps on older React Native versions.

```bash
cd ReactNativeFastImageExampleLegacy
yarn
bundle install
bundle exec pod install --project-directory=ios

# Stop the main example's packager first; both use port 8081.
yarn start
yarn ios
yarn android
```

Its `metro.config.js` resolves every import from the shared screens and the library source to this app's `node_modules`. The Gemfile and Podfile carry a few workarounds so React Native 0.73 still builds with current Ruby and Xcode.

## Verifying changes

`scripts/verify.sh` checks the library and runs both example apps on iOS and Android:

1. Builds the library, runs its tests, and type-checks the example.
2. For each app, builds it for iOS and Android in parallel, starts its packager, and runs the [Maestro](https://maestro.dev) flows on each platform. A failed flow or a crash fails the run.

```bash
scripts/verify.sh                      # everything
scripts/verify.sh --app legacy --ios   # one app and platform
scripts/verify.sh --ref main           # the library code from main, for a "before" run
```

Run `scripts/verify.sh --help` for all options. Give the Android emulator at least 4 GB of RAM and hardware graphics (`hw.ramSize` and `hw.gpu.mode = host` in the AVD's `config.ini`; the script starts emulators with `-gpu host`). With less memory or software rendering, the example's animated images make the emulator too slow and Maestro can't read the screen. Each step has a time limit of about twice a typical run; raise it with `VERIFY_WALKTHROUGH_TIMEOUT`, `VERIFY_REGRESSION_TIMEOUT` or `VERIFY_BUILD_TIMEOUT` (seconds) if one is hit. Logs, screenshots and crash reports go to `verify-output/`. It needs a free port 8081, Maestro, an iOS simulator, and an Android emulator (it starts one if none is running).

### Maestro flows

-   `maestro/walkthrough.yaml` scrolls through every example, checks that the progress events fire, preloads an image, opens both grids, and saves screenshots.
-   `maestro/regression.yaml` opens the **Regression** tab and waits for every case to report `OK`. Each case covers a fixed bug (for example, removing an event handler after it fires). Add a case there when fixing a bug that can be reproduced in the app.

To run a flow by hand against a running app:

```bash
maestro test -e APP_ID=org.reactjs.native.example.ReactNativeFastImageExample maestro/regression.yaml
```

The app IDs for each app and platform are listed at the top of `maestro/walkthrough.yaml`.

## How the example uses the library

-   `react-native.config.js` autolinks the library's native code from the repo root.
-   `metro.config.js` resolves `react-native-fast-image` to `../src/index.tsx` and makes the library source use the example's `react` and `react-native`, not the repo root's dev copies.
-   `tsconfig.json` does the same for TypeScript.
