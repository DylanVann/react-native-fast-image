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

## Testing on older React Native (legacy architecture)

`ReactNativeFastImageExampleLegacy` runs the same screens (`ReactNativeFastImageExample/src`) on React Native 0.73 with the legacy architecture (Paper and the bridge). Use it to check that fixes still work for apps on older React Native versions.

```bash
cd ReactNativeFastImageExampleLegacy
bun install
bundle install
bundle exec pod install --project-directory=ios

# Stop the main example's packager first; both use port 8081.
bun run start
bun run images
bun run ios
bun run android
```

Its `metro.config.js` resolves every import from the shared screens and the library source to this app's `node_modules`. The Gemfile and Podfile carry a few workarounds so React Native 0.73 still builds with current Ruby and Xcode. `bun install` also applies `patches/react-native@0.73.11.patch` (Bun's `patchedDependencies`), which backports [facebook/react-native#51988](https://github.com/facebook/react-native/pull/51988): `RCTView` only builds its recursive accessibility label for views that are accessibility elements. Without it, every accessibility snapshot on iOS walks the whole view tree, which made each Maestro step on this app take about twice as long as on the main example.

## Verifying changes

`scripts/verify.mts` checks the library and runs both example apps on iOS and Android. Run it with Node 24 (or 22.18+), which runs TypeScript directly:

1. Builds the library, runs its tests, and type-checks the example, the script and the image server.
2. Starts the image server. For each app, builds it for iOS and Android in parallel, starts its packager, and runs the Maestro flows on both platforms at once. A failed flow or a crash fails the run.

```bash
node scripts/verify.mts                      # everything
node scripts/verify.mts --app legacy --ios   # one app and platform
node scripts/verify.mts --ref main           # the library code from main, for a "before" run
node scripts/verify.mts --package            # the package as published (see below)
node scripts/verify.mts --background         # also the slow background flow (see below)
node scripts/verify.mts --record             # record the screen while the flows run (see below)
```

With `--package`, the script builds the library, packs it with `npm pack`, and installs the tarball into each app's `node_modules`. The apps then load `dist/` through the package's `main` field and autolink the native code from the installed package, so a file missing from `files` in `package.json`, or a broken build, fails the run. Switching between this and the usual mode reinstalls pods and regenerates Android autolinking, so the next run takes longer. Use it for changes to the build or to what gets published.

`--background` also runs `maestro/background.yaml` (tagged `background`), which sends the app to the background while images load and brings it back 20 s later, past SDWebImage's 15 s download timeout. It takes about a minute more per app on iOS, so it's skipped by default; run it for changes to how images load or to app lifecycle handling. The example apps register their app IDs as URL schemes, which the flow opens to bring the app back.

Only one run at a time can use the devices: the booted simulator, the emulator and the fixed ports (8081 for Metro, 8090 and 8091 for the image server). So the script takes a machine-wide lock, and a run from another checkout, worktree or Rift waits for the first one to finish (`--no-wait` fails instead; `--js-only` doesn't need the lock). The lock is a listening socket on port 8089, which the OS frees when the run exits, however it exits. Anything else that drives the simulator or emulator can run under the same lock with `node scripts/device-lock.mts <command>`.

The flows are [Maestro](https://maestro.dev) YAML, run with [maestro-runner](https://github.com/devicelab-dev/maestro-runner), which is faster than the Maestro CLI (about 40% less time here), can drive iOS and Android at the same time, and is installed by `bun install` as a dev dependency. Screenshots are saved in each run's report (`verify-output/…/<app>-<platform>/report/assets/`).

With `--record`, maestro-runner also records the screen while each flow runs (iOS simulators and Android emulators). The recording is saved in the report next to the screenshots, and a copy sized for a GitHub comment (at most 1080p, 30 fps, real time; needs [ffmpeg](https://ffmpeg.org)) is written to `recordings/<branch>/<app>-<platform>-<flow>.mp4`, named after the current branch, or the `--ref` for a "before" run. The folder is ignored by git; drag the files into a PR's description or a comment to show the fix running (GitHub plays mp4 files inline; the limit is 10 MB per file on a free plan).

Run `node scripts/verify.mts --help` for all options. The flows run on devices of their own, so screenshots and recordings don't show other apps: an iOS simulator named "RNFI iPhone", created on first use from the newest iPhone simulator's device type and runtime, and the first Android emulator whose name starts with `rnfi` (create one, e.g. `rnfi_api36_aosp`, with the image described next). Use an Android emulator with a plain AOSP system image (`system-images;android-36;default;arm64-v8a`, not Google APIs), at least 4 GB of RAM and hardware graphics (`hw.ramSize` and `hw.gpu.mode = host` in the AVD's `config.ini`; the script starts emulators with `-gpu host` and no window: macOS throttles the emulator while its window is hidden or behind the iOS Simulator, and the app stalls until the window is brought forward), and pick it with `ANDROID_AVD`. Google APIs images run Play services and other apps in the background; combined with the example's animated images they overload the emulator until system dialogs ("… isn't responding") cover the app and flows fail. ATD images are lighter still, but render a black screen, so screenshots are empty. The script also sets `hide_error_dialogs` on emulators. Builds and each app and platform's flows have time limits; raise them with `VERIFY_BUILD_TIMEOUT` or `VERIFY_FLOWS_TIMEOUT` (seconds) if one is hit. Logs, screenshots and crash reports go to `verify-output/`. It needs a free port 8081, an iOS simulator, an Android emulator (it starts one if none is running).

### Regression cases

`ReactNativeFastImageExample/src/RegressionExample.tsx` holds a case for each fixed bug that can be reproduced in the app (for example, removing an event handler after it fires). Each shows `<id>: OK` once its expected event arrives. Add a case there when fixing such a bug, in one of the `REGRESSION_GROUPS` (each group fits on one screen; put cases with timers of a second or two together so they overlap). The example screens' sections are groups too (`ExampleGroups.tsx`): each reports when its images have loaded, and the progress, auto-size and grid examples report what they check.

The script runs the groups through the app's **regression runner** (`RegressionRunner.tsx`) rather than through a Maestro flow. It connects to the image server's WebSocket relay (`/regression`) and launches the app; on launch, the app asks the server whether a controller is connected, and if so shows the runner instead of the tabs. The runner shows one group at a time and sends every case's status over the relay. The script waits until a group is all OK (30 s at most), takes a screenshot of it with `simctl` or `adb`, and asks for the next group. Nothing goes through the accessibility tree, so a group takes about as long as its slowest case. To run it by hand, start the image server (`bun run images`), connect a WebSocket client to `ws://localhost:8090/regression?role=controller&platform=<ios|android>`, then launch the app and send `{"type":"next"}` (or `{"type":"show","index":2}`) from the client. The messages are listed at the top of `RegressionRunner.tsx`.

**Screenshots** are compared with the references in `screenshots/<app>-<platform>/<group>.png` by [odiff](https://github.com/dmtrKovalenko/odiff) (the `odiff-bin` dev dependency; anti-aliasing is ignored); up to 0.1% of the pixels may differ. The references are committed, so a change to how something renders comes with its new references in the same PR (GitHub shows the image diff): run with `--update-screenshots`, look at the result, and commit it. A new group or case gets its reference seeded by the first run; look at it before committing it. A `--ref` "before" run never seeds, since it shows the library as it was. They're taken on the script's own devices (the "RNFI iPhone" simulator, the `rnfi` emulator), and the two apps have references of their own, since they lay the same screens out slightly differently. Areas that differ between runs (animated images, timings) are wrapped in `Masked` (`RunnerContext.tsx`) in the app, which reports them to leave out; a case can also ask for a screenshot at a moment that matters with `SnapshotContext` (the keep-previous cases do, while their second image loads). The iOS status bar is overridden to the same time and battery for every run (`simctl status_bar`); on Android it's hidden. The run's screenshots, `regression.log`, `results.json` and any `*-diff.png` are in `verify-output/…/<app>-<platform>/regression/`.

The **Regression** tab shows every case at once, for a look by hand, plus the cases that need a real touch or the app going to the background, which stay in flows.

### Maestro flows

- `maestro/touch.yaml` opens the **Regression** tab, taps the touchable and pointer-events cases and waits for their `OK`.
- `maestro/background.yaml` (with `--background`) starts the background cases, sends the app away for 20 s and checks them when it's back.

Select elements by testID (`id:`) or exact text where possible. On iOS, maestro-runner resolves those with a WebDriverAgent query, but a regex text selector makes it fetch and parse the whole page source on every poll: about 2.5 s per `scrollUntilVisible` step against about 1 s with `id:`. Every query through the accessibility tree costs 0.7 to 1 s on iOS (even a tap by coordinates is 0.6 s), which is why the regression cases don't go through Maestro.

To run a flow by hand against a running app:

```bash
bunx maestro-runner --platform ios test -e APP_ID=org.reactjs.native.example.ReactNativeFastImageExample maestro/touch.yaml
```

With Xcode 27, maestro-runner 1.1.27 needs `XCODE_XCCONFIG_FILE=scripts/maestro-runner-wda.xcconfig` for iOS (its bundled WebDriverAgent targets iOS 12); `verify.mts` sets this.

The app IDs for each app and platform are listed at the top of `maestro/touch.yaml`.

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
