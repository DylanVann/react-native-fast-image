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

## How the example uses the library

-   `react-native.config.js` autolinks the library's native code from the repo root.
-   `metro.config.js` resolves `react-native-fast-image` to `../src/index.tsx` and makes the library source use the example's `react` and `react-native`, not the repo root's dev copies.
-   `tsconfig.json` does the same for TypeScript.
