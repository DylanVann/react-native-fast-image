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

# Start the packager, and in another terminal the image server (below).
bun run start
bun run images

# In another terminal, build and run the app.
bun run ios
bun run android
```

The examples load their remote images from a local server (`ReactNativeFastImageExampleServer`, run with Bun) instead of the internet, so they work offline and the flows don't depend on other servers. It serves `ReactNativeFastImageExampleServer/images` on port 8090; the app reaches it at `localhost` on iOS and `10.0.2.2` (the host machine) on the Android emulator. A path that doesn't exist returns 404, and query strings are ignored. The images were downloaded from their original URLs by `ReactNativeFastImageExampleServer/download.ts`, which lists each source; run it again to add one.

## Native code (New Architecture)

9.x is a native Fabric component and TurboModule, defined by the Codegen specs in `src/FastImageViewNativeComponent.ts` and `src/NativeFastImageModule.ts`. Codegen runs during `pod install` and the Android build. After changing a spec, run `pod install` again and rebuild.

- iOS: `FFFastImageViewComponentView` (the Fabric component) shows an `FFFastImageView` (SDWebImage) as its content; `FFFastImageModule` is the TurboModule.
- Android: `FastImageViewManager` sets the props on `FastImageViewWithUrl` (Glide); `FastImageModule` is the TurboModule.

The legacy architecture (React Native 0.60 and newer) is supported by 8.x, which has its own legacy example app on that branch.

## Verifying changes

`scripts/verify.mts` checks the library and runs the example app on iOS and Android. Run it with Node 24 (or 22.18+), which runs TypeScript directly:

1. Builds the library, runs its tests, and type-checks the example, the script and the image server.
2. Starts the image server. For each app, builds it for iOS and Android in parallel, starts its packager, and runs the Maestro flows on both platforms at once. A failed flow or a crash fails the run.

```bash
node scripts/verify.mts                      # everything
node scripts/verify.mts --ios                # one platform
node scripts/verify.mts --ref main           # the library code from main, for a "before" run
node scripts/verify.mts --package            # the package as published (see below)
```

With `--package`, the script builds the library, packs it with `npm pack`, and installs the tarball into each app's `node_modules`. The apps then load `dist/` through the package's `main` field and autolink the native code from the installed package, so a file missing from `files` in `package.json`, or a broken build, fails the run. Switching between this and the usual mode reinstalls pods and regenerates Android autolinking, so the next run takes longer. Use it for changes to the build or to what gets published.

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
- With `FAST_IMAGE_FROM_PACKAGE=1` (set by `verify.mts --package`), both use the package installed in the app's `node_modules` instead.
- `tsconfig.json` does the same for TypeScript.

## Releasing

Releases are automatic from `main`, with an approval step:

1. A merge to `main` runs CI (`.github/workflows/ci.yml`). Commits with `[skip ci]` in the message don't run it, so they don't release on their own.
2. The `release` job waits for a maintainer to approve it (it runs in the `release` GitHub environment, which has a required reviewer). Approve it from the workflow run's page: **Review deployments**. Only one release job runs at a time; merges while one is waiting release together.
3. [semantic-release](https://semantic-release.gitbook.io) (`release.config.js`) works out the version from the commit messages since the last release, updates `CHANGELOG.md` and `package.json`, publishes to npm with [trusted publishing](https://docs.npmjs.com/trusted-publishers) (no npm token; provenance is attached), pushes the release commit and tag, and comments on the released issues and pull requests.

npm only accepts trusted publishing for this package from `ci.yml` in the `release` environment. Don't edit `CHANGELOG.md` or the version in `package.json` by hand.
