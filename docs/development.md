# Development

The example app in `ReactNativeFastImageExample` runs against the library source in this repo, so changes to `src/`, `ios/`, and `android/` show up without publishing or linking anything.

- JS/TS changes in `src/` are picked up by Metro (fast refresh).
- Native changes in `ios/` or `android/` need the app to be rebuilt.

## Requirements

- Node 26 (`.node-version`, which [fnm](https://github.com/Schniz/fnm) picks with `fnm use`)
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

## Testing in an Expo app (iOS, Android and the web)

`ReactNativeFastImageExampleExpo` is an Expo app (from Expo's blank TypeScript template) that shows a few smoke cases: an image loads, a missing one fails, a bundled one loads, `preload` reports its results, `getCachePath` answers, and the cache limits set by FastImage's Expo config plugin (in `app.config.js`) are in effect. It shares the regression runner and the case components with the main example (`ReactNativeFastImageExample/src`, the cases in `SmokeExample.tsx`), and uses the library from the repo like the other apps. Its native projects (`ios/`, `android/`) aren't in the repo: `expo prebuild` makes them, with the config plugin applied.

```bash
cd ReactNativeFastImageExampleExpo
bun install
bun run images
bun run ios       # expo run:ios (prebuilds the first time)
bun run android   # expo run:android
bun run web       # the web version, with react-native-web
```

`app.config.js` uses the repo's `app.plugin.js` (the installed package's with `verify.mts --package`), and puts the app's `node_modules` on Node's module path for it, since the plugin requires `expo/config-plugins` from where it is. It also turns off Expo's `tsconfigPaths`: `tsconfig.json`'s `paths` point `react` at its types for type checking, which Metro mustn't follow.

## Verifying changes

`scripts/verify.mts` checks the library and runs both example apps on iOS and Android. Run it with Node 26, which runs TypeScript directly:

1. Builds the library, runs its tests, and type-checks the example, the script and the image server.
2. Starts the image server and builds every app for iOS and Android (the platforms in parallel), so no build runs while cases are timed. Then for each app, starts its packager and runs the Maestro flows on both platforms at once. A failed flow or a crash fails the run.

```bash
node scripts/verify.mts                      # everything
node scripts/verify.mts --app legacy --ios   # one app and platform
node scripts/verify.mts --ref main           # the library code from main, for a "before" run
node scripts/verify.mts --package            # the package as published (see below)
node scripts/verify.mts --release            # release builds, minified with R8 on Android (see below)
node scripts/verify.mts --app expo           # the Expo example on iOS, Android and the web (see below)
node scripts/verify.mts --background         # also the slow background flow (see below)
node scripts/verify.mts --record             # record the screen while the flows run (see below)
```

With `--package`, the script builds the library, packs it with `npm pack`, and installs the tarball into each app's `node_modules`. The apps then load `dist/` through the package's `main` field and autolink the native code from the installed package, so a file missing from `files` in `package.json`, or a broken build, fails the run. Switching between this and the usual mode reinstalls pods and regenerates Android autolinking, so the next run takes longer. Use it for changes to the build or to what gets published.

With `--release`, the apps are built in their Release configuration, with the JavaScript bundled in and no packager, and on Android minified with R8 (the example apps turn it on for release). Use it for changes that R8 could affect: the ProGuard rules, reflection, or classes that are only created by name. The example's image server uses plain HTTP, which the apps allow in release for the emulator's host address and localhost only.

`--app expo` runs the Expo example instead of the other two (it's not in the default run): its JS typecheck, `expo prebuild` (again when `app.config.js` or `package.json` changed), `pod install` with the installed CocoaPods (the app has no Gemfile), the iOS and Android builds, and its smoke cases through the runner, compared with reference screenshots like the other apps. It also runs them on the web: Expo's dev server (which serves the native bundles) also serves the web version, which the script opens in the installed Chrome, headless (`CHROME_BIN` to use another), and its runner reports each case's status through the image server's relay as the apps do; there are no screenshots on the web. `--ios`, `--android` and `--web` narrow it to one platform.

`--background` also runs `maestro/background.yaml` (tagged `background`), which sends the app to the background while images load and brings it back 20 s later, past SDWebImage's 15 s download timeout. It takes about a minute more per app on iOS, so it's skipped by default; run it for changes to how images load or to app lifecycle handling. The example apps register their app IDs as URL schemes, which the flow opens to bring the app back.

Android builds only the emulator's CPU architecture (`reactNativeArchitectures`), and iOS builds use Xcode's compilation cache in `~/Library/Caches/react-native-fast-image/compilation-cache` (shared by the apps and checkouts, emptied when it grows past 2 GB), so a clean or new checkout's build is quicker.

Run one `verify.mts` at a time, across checkouts: runs use the booted simulator, the emulator and fixed ports (8081 for Metro, 8090 and 8091 for the image server).

The flows are [Maestro](https://maestro.dev) YAML, run with [maestro-runner](https://github.com/devicelab-dev/maestro-runner), which is faster than the Maestro CLI (about 40% less time here), can drive iOS and Android at the same time, and is installed by `bun install` as a dev dependency. Screenshots are saved in each run's report (`verify-output/…/<app>-<platform>/report/assets/`).

With `--record`, maestro-runner also records the screen while each flow runs (iOS simulators and Android emulators). The recording is saved in the report next to the screenshots, and a copy sized for a GitHub comment (at most 1080p, 30 fps, real time; needs [ffmpeg](https://ffmpeg.org)) is written to `recordings/<branch>/<app>-<platform>-<flow>.mp4`, named after the current branch, or the `--ref` for a "before" run. The folder is ignored by git; drag the files into a PR's description or a comment to show the fix running (GitHub plays mp4 files inline; the limit is 10 MB per file on a free plan).

Run `node scripts/verify.mts --help` for all options. Logs, screenshots and crash reports go to `verify-output/`. Builds and each app and platform's flows have time limits; raise them with `VERIFY_BUILD_TIMEOUT` or `VERIFY_FLOWS_TIMEOUT` (seconds) if one is hit.

### Devices

The flows run on devices of their own, so screenshots and recordings don't show other apps:

- iOS: a simulator named "RNFI iPhone", created on first use from the newest iPhone simulator's device type and runtime.
- Android: the first emulator whose name starts with `rnfi` (pick another with `ANDROID_AVD`); the script starts it if none is running. Create one (e.g. `rnfi_api36_aosp`) with a plain AOSP system image (`system-images;android-36;default;arm64-v8a`), at least 4 GB of RAM and hardware graphics (`hw.ramSize` and `hw.gpu.mode = host` in the AVD's `config.ini`).

Google APIs images run Play services and other apps in the background; combined with the example's animated images they overload the emulator until system dialogs ("… isn't responding") cover the app and flows fail. ATD images are lighter still, but render a black screen, so screenshots are empty. The script starts emulators with `-gpu host` and no window (macOS throttles the emulator while its window is hidden or behind the iOS Simulator, and the app stalls until the window is brought forward), and sets `hide_error_dialogs` on them.

### Regression cases

`ReactNativeFastImageExample/src/RegressionExample.tsx` holds a case for each fixed bug that can be reproduced in the app (for example, removing an event handler after it fires). Each shows `<id>: OK` once its expected event arrives (`<id>: …` until then). The status line stays that short, so a long status (a failure) doesn't move the cases below it (masks and video samples measure where they are); the runner lists the statuses of cases that haven't passed in full below the group's cases. Add a case there when fixing such a bug, in one of the `REGRESSION_GROUPS` (each group fits on one screen; put cases with timers of a second or two together so they overlap). The script fails a group whose cases go past the visible screen (split the group). The example screens' sections are groups too (`ExampleGroups.tsx`): each reports when its images have loaded, and the progress, auto-size and grid examples report what they check.

The script runs the groups through the app's **regression runner** (`RegressionRunner.tsx`) rather than through a Maestro flow. It connects to the image server's WebSocket relay (`/regression`) and launches the app; on launch, the app asks the server whether a controller is connected, and if so shows the runner instead of the tabs. The runner shows one group at a time and sends every case's status over the relay. The script waits until a group is all OK (30 s at most), takes a screenshot of it with `simctl` or `adb`, and asks for the next group. Nothing goes through the accessibility tree, so a group takes about as long as its slowest case. To run it by hand, start the image server (`bun run images`), connect a WebSocket client to `ws://localhost:8090/regression?role=controller&platform=<ios|android>`, then launch the app and send `{"type":"next"}` (or `{"type":"show","index":2}`) from the client. The messages are listed at the top of `RegressionRunner.tsx`.

**Screenshots** are compared with the references in `screenshots/<app>-<platform>/<group>.png` by [odiff](https://github.com/dmtrKovalenko/odiff) (the `odiff-bin` dev dependency; anti-aliasing is ignored); up to 0.1% of the pixels may differ. The references are committed, so a change to how something renders comes with its new references in the same PR (GitHub shows the image diff): run with `--update-screenshots`, look at the result, and commit it. A new group or case gets its reference seeded by the first run; look at it before committing it. A `--ref` "before" run never seeds, since it shows the library as it was. They're taken on the script's own devices (the "RNFI iPhone" simulator, the `rnfi` emulator), and the two apps have references of their own, since they lay the same screens out slightly differently. Each screenshot is cropped to the safe area, so the status bar and the system's bars at the bottom aren't in it. Areas that differ between runs (animated images, timings) are wrapped in `Masked` (`RunnerContext.tsx`) in the app, which reports them to leave out. The iOS status bar is overridden to the same time and battery for every run (`simctl status_bar`); on Android it's hidden. The run's screenshots, `regression.log`, `results.json` and any `*-diff.png` are in `verify-output/…/<app>-<platform>/regression/`.

The **Regression** tab shows every case at once, for a look by hand, plus the cases that send the app to the background, which stay in a flow. The cases that need a real touch are the runner's last group, `touch`: while it's shown, the script taps them with `maestro/touch.yaml`, and they report their `OK` to the runner like the others.

**Video samples** check how an area changes over time, which one screenshot can't reliably catch (e.g. an image fading in, or a source change that must never show a blank view). A case asks for one with `SampleContext` (`RunnerContext.tsx`): the area (from `measureView`), the longest it may take, the colors it should show in order (`expect`), and colors that mustn't appear (`palette`). The script records the screen (`simctl io recordVideo`, `adb shell screenrecord`; needs ffmpeg), the case makes its change once the recording has started and says when it's done (e.g. once an image has loaded), and each frame's color at the middle of the area is matched to the nearest listed color (perceptually, in CIE Lab, with some tolerance for video compression). A group's samples share one recording, so they run at the same time; each is checked in its own part of it, from the last frame before its change until it was done. The area is measured before the recording starts, so a case keeps it in place: its row shouldn't change height while it records (the runner's summary line and each case's status are one line for this). Repeats are collapsed, so how long each color lasts doesn't matter, only the order. The result comes back to the case as its status. The keep-previous cases use them: magenta, then cyan, never blank. Recordings are kept in `verify-output/…/regression/`.

### Maestro flows

- `maestro/touch.yaml` taps the touchable and pointer-events cases while the runner shows them (run by the regression step, not with the flows; tagged `runner`).
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

## The README and the website

The README's props section (between its `api:props` markers) is generated from the doc comments in `src/index.tsx`, on `FastImageProps` and `Source`: edit the comments, not the README, then run `bun run generate` in `website/` (`bun install` there first). CI fails if the README is out of date (`bun run check`). The comments are Markdown, with these tags:

- `@default`: the default value.
- `@platform ios`, `@platform android`, `@platform web`: for a prop that only works on some platforms.
- `@example`: a code block shown after the description.

Notes for maintainers go in `//` comments instead: they aren't in editor hovers, the README, the website or the published types.

The website in `website/` ([Starlight](https://starlight.astro.build)) shows the README as its main page and each file in `docs/` as a page (`benchmarks.md` and `development.md` next to it in the sidebar, the others under Guides), each named after its title. `bun run dev` in `website/` generates the pages and serves them; `bun run build` writes the site to `website/dist/` (`bun run build:docs` from the repo's root does the same). The generator runs [TypeDoc](https://typedoc.org), which needs TypeScript 6 (the library uses TypeScript 7, which has no JavaScript API yet), so `website/` has its own dependencies. It warns about links to headings that don't exist in the README or `docs/`.

## Releasing

Releases are automatic from `main`, with an approval step:

1. A merge to `main` runs CI (`.github/workflows/ci.yml`). Commits with `[skip ci]` in the message don't run it, so they don't release on their own.
2. The `release` job waits for a maintainer to approve it (it runs in the `release` GitHub environment, which has a required reviewer). Approve it from the workflow run's page: **Review deployments**. Only one release job runs at a time; merges while one is waiting release together.
3. [semantic-release](https://semantic-release.gitbook.io) (`release.config.mjs`) works out the version from the commit messages since the last release, updates `CHANGELOG.md` and `package.json`, publishes to npm with [trusted publishing](https://docs.npmjs.com/trusted-publishers) (no npm token; provenance is attached), pushes the release commit and tag, and comments on the released issues and pull requests. Each entry credits the commit's author and co-authors (`Co-authored-by:` trailers), looked up on GitHub with the job's token.

npm only accepts trusted publishing for this package from `ci.yml` in the `release` environment. Don't edit `CHANGELOG.md` or the version in `package.json` by hand.
