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

## Walking through the examples

`maestro/walkthrough.yaml` is a [Maestro](https://maestro.dev) flow that scrolls through every example, preloads an image, opens both grids, and saves screenshots to `maestro-screenshots/`. Run it against either app on a booted simulator or emulator:

```bash
maestro test -e APP_ID=org.reactjs.native.example.ReactNativeFastImageExample maestro/walkthrough.yaml
```

The app IDs for each app and platform are listed at the top of the flow.

## How the example uses the library

-   `react-native.config.js` autolinks the library's native code from the repo root.
-   `metro.config.js` resolves `react-native-fast-image` to `../src/index.tsx` and makes the library source use the example's `react` and `react-native`, not the repo root's dev copies.
-   `tsconfig.json` does the same for TypeScript.
