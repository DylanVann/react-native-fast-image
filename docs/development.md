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

## The legacy architecture (FastImage 9)

FastImage is a New Architecture component (React Native 0.83 and later, since 10.0). FastImage 9, for apps on older React Native or the legacy architecture, is maintained on the `9.x` branch, which has its own example for React Native 0.73 with the legacy architecture (`ReactNativeFastImageExampleLegacy`). Fixes for 9.x are made there, from that branch.

## Testing on the oldest supported React Native

`ReactNativeFastImageExampleMinimum` is a React Native 0.83 app (React Native's template, with the main example's native setup: the scene delegate, the photo library module, the cache limit, edge to edge, and R8 and plain http to the image server in release builds). It runs the regression cases (`ReactNativeFastImageExample/src/RegressionExample.tsx`), but not the example screens, which need the main example's other dependencies. Raise it along with FastImage's minimum React Native version.

```bash
cd ReactNativeFastImageExampleMinimum
bun install
bundle install
bundle exec pod install --project-directory=ios

# Stop the other examples' packagers first; they all use port 8081.
bun run start
bun run images
bun run ios
bun run android
```

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

`app.config.js` uses the repo's `app.plugin.js` (the installed package's with `verify.mts --package`), and adds the app's `node_modules` to that module's lookup paths, since the plugin requires `expo/config-plugins` from where it is. The app's `.env` turns off the project fingerprint that debug builds embed (`EXPO_SKIP_FINGERPRINT_EMBED`): with the library linked from the repo root, it would hash the whole repo, ignored files included. `verify.mts` sets it for the Android build too, since it runs Gradle directly, without the Expo CLI that loads `.env`. It also turns off Expo's `tsconfigPaths`: `tsconfig.json`'s `paths` point `react` at its types for type checking, which Metro mustn't follow.

## Testing on tvOS

`ReactNativeFastImageExampleTV` runs the regression cases (`ReactNativeFastImageExample/src/RegressionExample.tsx`) on tvOS, with [React Native tvOS](https://github.com/react-native-tvos/react-native-tvos) (the `react-native-tvos` package, installed as `react-native`) and the New Architecture. It leaves out the cases that need a touch (the runner's `touch` group). Its iOS project is from React Native tvOS's app template, with the main example's scene delegate.

```bash
cd ReactNativeFastImageExampleTV
bun install
bundle install
bundle exec pod install --project-directory=ios

# Stop the other examples' packagers first; they all use port 8081.
bun run start
bun run images
bun run ios   # on the "Apple TV 4K (3rd generation)" simulator; add -- --simulator "<name>" for another
```

## Verifying changes

`scripts/verify.mts` checks the library and runs the main example app and the oldest supported React Native's (`ReactNativeFastImageExampleMinimum`) on iOS and Android, and the Expo and tvOS examples when asked for. Run it with Node 26, which runs TypeScript directly:

1. Builds the library, runs its tests, and type-checks the examples (the main one and the React Native 0.83 one, and the Expo or tvOS one when asked for), the script and the image server.
2. Starts the image server and builds every app for iOS and Android (the platforms in parallel), so no build runs while cases are timed. After the main example's Android build, runs the library's Android unit tests (below). Then for each app, starts its packager and runs the Maestro flows on both platforms at once. A failed flow or a crash fails the run.

```bash
node scripts/verify.mts                      # everything
node scripts/verify.mts --ios                # one platform
node scripts/verify.mts --ref main           # the library code from main, for a "before" run
node scripts/verify.mts --package            # the package as published (see below)
node scripts/verify.mts --release            # release builds, minified with R8 on Android (see below)
node scripts/verify.mts --app minimum        # only the React Native 0.83 example
node scripts/verify.mts --app expo           # the Expo example on iOS, Android and the web (see below)
node scripts/verify.mts --app tv             # the tvOS example (see below)
node scripts/verify.mts --background         # also the slow background flow (see below)
node scripts/verify.mts --record             # record the screen while the flows run (see below)
node scripts/verify.mts --shard 1/2          # the first half of each app's groups (see below)
```

With `--package`, the script builds the library, packs it with `npm pack`, and installs the tarball into each app's `node_modules`. The apps' Metro then loads the published source (`src/`, through the package's `react-native` field; Jest and Node use `dist/`, its `main`) and they autolink the native code from the installed package, so a file missing from `files` in `package.json`, or a broken build, fails the run. Switching between this and the usual mode reinstalls pods and regenerates Android autolinking, so the next run takes longer. Use it for changes to the build or to what gets published.

With `--release`, the apps are built in their Release configuration, with the JavaScript bundled in and no packager, and on Android minified with R8 (the example apps turn it on for release). Use it for changes that R8 could affect: the ProGuard rules, reflection, or classes that are only created by name. The example's image server uses plain HTTP, which the apps allow in release for the emulator's host address and localhost only.

`--app expo` runs the Expo example instead of the default ones (it's not in the default run): its JS typecheck, `expo prebuild` (again when `app.config.js` or `package.json` changed), `pod install` with the installed CocoaPods (the app has no Gemfile), the iOS and Android builds, and its smoke cases through the runner, compared with reference screenshots like the other apps. It also runs them on the web: Expo's dev server (which serves the native bundles) also serves the web version, which the script opens in the installed Chrome, headless (`CHROME_BIN` to use another), and its runner reports each case's status through the image server's relay as the apps do; there are no screenshots on the web. `--ios`, `--android` and `--web` narrow it to one platform.

`--app tv` runs the tvOS example instead (also not in the default run): its JS typecheck, `pod install`, the build for an Apple TV simulator ("RNFI Apple TV", created from the newest Apple TV simulator on first use; `TVOS_SIMULATOR` to use another), and the regression cases through the runner, compared with reference screenshots in `screenshots/tv-ios/`. tvOS is iOS to React Native (`Platform.OS` is `'ios'`), so the run's platform is `ios`.

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

`ReactNativeFastImageExample/src/RegressionExample.tsx` holds a case for each fixed bug that can be reproduced in the app (for example, removing an event handler after it fires). Each reports its status (`OK` once its expected event arrives). The Regression tab shows `<id>: OK` (`<id>: …` until then) and its description; the runner shows no text with the cases, so the screenshots have their images only, and a status that changes doesn't move the cases (masks and video samples measure where they are). It lists the statuses of cases that haven't passed in full below the group's cases. Add a case there when fixing such a bug, in one of the `REGRESSION_GROUPS` (each group fits on one screen; put cases with timers of a second or two together so they overlap). Each case has a `description` (`Description` in `RunnerContext.tsx`), for someone reviewing the screenshots who hasn't read the code: what it checks (and the bug it's for), its steps, and what its part of the screenshot shows once it has passed. Each group has one too (`GroupDescription`): what it checks as a whole, and the steps its cases share; only the example screens' groups, whose cases don't describe themselves, say what the screenshot shows. The Regression tab shows them (its Details switch shows the steps and what to see), and the runner sends them to the script, which writes them to `results.json`. The script fails a group whose cases go past the visible screen (split the group). The example screens' sections are groups too (`ExampleGroups.tsx`): each reports when its images have loaded, and the progress, auto-size and grid examples report what they check.

The script runs the groups through the app's **regression runner** (`RegressionRunner.tsx`) rather than through a Maestro flow. It connects to the image server's WebSocket relay (`/regression`) and launches the app; on launch, the app asks the server whether a controller is connected, and if so shows the runner instead of the tabs. The runner shows one group at a time and sends every case's status over the relay. The script waits until a group is all OK (20 s at most), takes a screenshot of it with `simctl` or `adb`, and asks for the next group. Nothing goes through the accessibility tree, so a group takes about as long as its slowest case. To run it by hand, start the image server (`bun run images`), connect a WebSocket client to `ws://localhost:8090/regression?role=controller&platform=<platform>` (`ios`, `android`, `tvos` for the tvOS example, or `web` for the Expo example's web version), then launch the app and send `{"type":"next"}` (or `{"type":"show","index":2}`) from the client. The messages are listed at the top of `RegressionRunner.tsx`.

**Screenshots** are compared by case: each case's area of its group's screenshot (the view its `CaseStatus` is in, so a case's images and its status share one view, with 6 dp of padding to catch what's drawn just past it; in the runner a case is only as wide as its images, so the crop is them) is cropped and compared with its reference, `screenshots/<app>-<platform>/<group>/<case>.png`, by [odiff](https://github.com/dmtrKovalenko/odiff) (the `odiff-bin` dev dependency; anti-aliasing is ignored); up to 0.1% of the case's pixels may differ, and its size must be the same. Layout snaps edges to whole pixels, and an edge that lands exactly on half a pixel can round either way from one run to the next (60 dp is 157.5 px at the emulator's 2.625×), so the run fails a case whose width or height is a whole number of dp that ends on half a pixel: at 2.625×, make case sizes (and gaps) multiples of 8 dp. A failure names the case, a change to one case doesn't fail the cases below it, and small changes are caught. A group without cases (the example screens, whose sections fill the screen's width: `wide` in `RegressionGroup`) is compared as a whole, with `screenshots/<app>-<platform>/<group>.png`. A reference nothing compares any more (a case renamed, moved or removed, a group removed) fails the run, which names it to delete; it checks the groups the run showed, and the folders of groups the app doesn't have. The references are committed, so a change to how something renders comes with its new references in the same PR (GitHub shows the image diff): run with `--update-screenshots`, look at the result, and commit it. A new group or case gets its reference seeded by the first run; look at it before committing it. A `--ref` "before" run never seeds, since it shows the library as it was, and neither does a group that failed (a case not OK, or a screenshot that couldn't be cropped to the safe area), which could show an error screen. The tvOS app runs the same cases, but only with `--app tv`: when a group's main or minimum reference changed on the branch and its tvOS one didn't, the summary says to run it. They're taken on the script's own devices (the "RNFI iPhone" and "RNFI Apple TV" simulators, the `rnfi` emulator), and each app has references of its own. Each screenshot is cropped to the safe area, so the status bar and the system's bars at the bottom aren't in it. Areas that differ between runs (animated images, timings) are wrapped in `Masked` (`RunnerContext.tsx`) in the app, which reports them to leave out. The iOS status bar is overridden to the same time and battery for every run (`simctl status_bar`); on Android it's hidden. The run's screenshots (each group's, and its cases' crops in a folder named after it), `regression.log`, `results.json` and any `*-diff.png` are in `verify-output/…/<app>-<platform>/regression/`.

**Reviewing screenshots**: `node scripts/regression-viewer.mts` serves a page (http://localhost:8095) with every group's references and descriptions, compared with the latest run where it has the group (`--references`: no run): each case's description next to its crop of the reference, of the run and of the diff, with the group's whole screenshot beside them (hovering over a case outlines its area), and the group's video samples; a group without cases as a whole, side by side or with a slider over the reference. It lists the groups to review first: failed, new (no reference, or one the run seeded) and differing; with nothing to review it opens on all of them. The groups the run didn't show (other apps and platforms, or groups left out) show their references, with descriptions from the newest run that has them, so every reference can be looked at; runs from before `results.json` had the comparisons are skipped when picking the latest. **Approve** copies a case's crop over its reference in `screenshots/` (**Approve all**, a group's), to commit; not a failed group's, or a `--ref` run's, which the script wouldn't seed either. `--pr <number>` downloads the screenshots of the PR's latest e2e run on GitHub Actions instead (with `gh`; check out the PR's branch first, so its references are the ones compared and replaced), and a folder argument shows any run, or unzipped artifacts.

The **Regression** tab shows every case at once, for a look by hand, plus the cases that send the app to the background, which stay in a flow. The cases that need a real touch are the runner's last group, `touch`: while it's shown, the script taps them with `maestro/touch.yaml`, and they report their `OK` to the runner like the others.

**Video samples** check how an area changes over time, which one screenshot can't reliably catch (e.g. an image fading in, or a source change that must never show a blank view). A case asks for one with `SampleContext` (`RunnerContext.tsx`): the area (from `measureView`), the longest it may take, the colors it should show in order (`expect`), and colors that mustn't appear (`palette`). The script records the screen (`simctl io recordVideo`, `adb shell screenrecord`; needs ffmpeg), the case makes its change once the recording has started and says when it's done (e.g. once an image has loaded), and each frame's color at the middle of the area is matched to the nearest listed color (perceptually, in CIE Lab, with some tolerance for video compression). A group's samples share one recording, so they run at the same time; each is checked in its own part of it, from the last frame before its change until it was done. The area is measured before the recording starts, so a case keeps it in place: its row shouldn't change height while it records. Repeats are collapsed, so how long each color lasts doesn't matter, only the order. The result comes back to the case as its status. The keep-previous cases use them: magenta, then cyan, never blank. Recordings are kept in `verify-output/…/regression/`.

A group that fails isn't run again: a flaky case fails the run, to be tracked and fixed rather than passed on a second try. A video sample whose recording couldn't show its change isn't checked, and the summary lists it: when the recording has no frame of the last color but the area shows it afterwards (a recorder that stopped). With `VERIFY_SPARSE_RECORDINGS=1`, for a recorder that captures a few frames a second (an emulator without a GPU), also when the first and last colors are more than 100 ms apart with nothing between them; it's off by default, since these recorders only add a frame when the screen changes, so the same gap is what an image that cut to the next instead of fading looks like.

`--shard i/n` runs the i-th of n ranges of each app's groups, to split a run between machines (the first range starts with `start`).

### On GitHub Actions

`.github/workflows/e2e.yml` runs the regression cases for pull requests (except changes to docs alone, for which its `e2e` job, the check `main` requires, passes without them), and when started by hand (from the Actions tab, or `gh workflow run e2e.yml --ref <branch>`): the main and minimum examples on the iOS simulator (the `xcode-27` runner: Xcode 27.1 and iOS 27.0, the references' versions) and the Android emulator (`ubuntu-24.04`: an AOSP API 36 x86_64 image with a Pixel 7's screen, rendering in software, `ANDROID_EMULATOR_GPU=swiftshader_indirect`). The same reference screenshots match there. Each app and platform is two jobs (`--shard 1/2` and `2/2`), each building the app; the groups are split so both halves take about as long, by each group's median time in the last 5 runs (`scripts/group-times.ts` keeps them in the R2 bucket, `VERIFY_GROUP_TIMES` passes them to `verify.mts`); a run takes about 10 minutes with its caches (30–35 without). The jobs cache what they can rebuild (the iOS simulator after its first boot, with the background services a run doesn't use turned off by [simslim](https://github.com/MobAI-App/simslim) (`.github/simslim.json`), the iOS apps' dependencies, Pods and gems, Xcode's compilation cache, Gradle's caches, the emulator image, Metro's transform cache, maestro-runner's WebDriverAgent build); they're kept in a Cloudflare R2 bucket (`react-native-fast-image-ci-cache`, through `runs-on/cache`, objects deleted after 30 days) and shared by all branches, or in GitHub's cache (its branch's and `main`'s) without the `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` secrets. Each job's `verify-output` is attached to the run.

### Android unit tests

`android/src/test` tests the shared downloads (`FastImageSharedDownloads`) the way Glide uses them: each request is a fetcher from the loader, started with a priority, cancelled, and cleaned up after it reads its stream, and the downloads are real requests to a small HTTP server in the tests (`TestServer`), which holds responses where a test says. So a test checks what the server was asked for, in what order, and what each request got, rather than how the downloads work inside; after each test, it checks the downloads hold nothing more (no memory, temporary file, or download waiting or running). They run on the JVM with [Robolectric](https://robolectric.org) (for Android's classes), in seconds, so they suit cases that depend on the order of events, which are slow to set up in the app. They don't show images, which the regression cases do; one (`FastImageGlideNetworkTest`) starts Glide with FastImage's modules and loads a plain `GlideUrl`, to check it goes through React Native's OkHttp client.

```bash
cd ReactNativeFastImageExample/android
./gradlew :react-native-fast-image:testDebugUnitTest
```

The results are in `android/build/reports/tests/testDebugUnitTest/`. The npm package doesn't include `android/src/test`, so apps don't get the tests or their dependencies.

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

The website in `website/` ([Starlight](https://starlight.astro.build)) shows the README as its main page and each file in `docs/` as a page (`benchmarks.md`, `comparisons.md` and `development.md` next to it in the sidebar, the others under Guides; `docs/issues/` as plain Markdown files, linked from the comparisons page), each named after its title. `bun run dev` in `website/` generates the pages and serves them; `bun run build` writes the site to `website/dist/` (`bun run build:docs` from the repo's root does the same). The generator runs [TypeDoc](https://typedoc.org), which needs TypeScript 6 (the library uses TypeScript 7, which has no JavaScript API yet), so `website/` has its own dependencies. It warns about links to headings that don't exist in the README or `docs/`. Cloudflare's CI (Workers Builds) builds and deploys the website when `main` changes.

## The `react-native` peer dependency

`package.json`'s `react-native` peer is `*`, and the README's Installation section says which React Native versions FastImage works with. A range such as `>=0.65.0` would stop npm from installing FastImage next to React Native tvOS (`react-native-tvos`, whose versions, e.g. `0.87.1-1`, are semver prereleases) or a release candidate: npm only accepts a prerelease for a peer of `*`, and fails with `ERESOLVE` otherwise (yarn, pnpm and bun only warn). Most React Native libraries, and the `create-react-native-library` and `create-expo-module` templates, use `*` for this reason. Keep the README's minimum up to date instead.

## Pull requests

`main` only takes a pull request that's up to date with it (rebased on its latest commit) and whose checks passed on that commit: `build` (`ci.yml`) and `e2e` (`e2e.yml`). It's squash-merged, so `main` gets the tree that was checked, and only the release runs there.

When `main` moves on, a pull request needs rebasing, and its checks run again. So that maintainers can do that (and small changes before merging), open it from a fork under your own account, with **Allow edits by maintainers** checked: GitHub doesn't offer it for forks owned by an organization. Otherwise you'll be asked to rebase it yourself.

## Releasing

Releases are automatic from `main`, with an approval step (fixes merged to the `9.x` branch are released the same way, as 9.x versions on the npm dist-tag `latest-9`):

1. A merge to `main` runs the `release` job (`.github/workflows/ci.yml`); the checks ran on the pull request. Commits with `[skip actions]` in the message don't run it, so they don't release on their own: use it for merges that shouldn't release (docs, chores, tests). Not `[skip ci]`, which also stops Cloudflare's CI from deploying the website.
2. The `release` job waits for a maintainer to approve it (it runs in the `release` GitHub environment, which has a required reviewer). Approve it from the workflow run's page: **Review deployments**. Only one release job runs at a time; merges while one is waiting release together.
3. [semantic-release](https://semantic-release.gitbook.io) (`release.config.mjs`) works out the version from the commit messages since the last release, updates `CHANGELOG.md` and `package.json`, publishes to npm with [trusted publishing](https://docs.npmjs.com/trusted-publishers) (no npm token; provenance is attached), pushes the release commit and tag (with a deploy key, the `release` environment's `RELEASE_DEPLOY_KEY` secret: the only push `main`'s ruleset lets through without the checks), and comments on the released issues and pull requests. Each entry credits the commit's author and co-authors (`Co-authored-by:` trailers), looked up on GitHub with the job's token.

npm only accepts trusted publishing for this package from `ci.yml` in the `release` environment. Don't edit `CHANGELOG.md` or the version in `package.json` by hand.
