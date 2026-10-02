# Benchmark

Measures how React Native image components load and show images, the same way for each, on real phones: FastImage, React Native's `Image`, expo-image, Nitro Image and Turbo Image (`app/subjects.json`). Results are distributions over several runs, from the screen as the user sees it where possible.

## Running it

Needs a Mac with Xcode, an iPhone connected over USB (unlocked, Developer Mode on, and Settings → Developer → Enable UI Automation), Bun, ffmpeg (`brew install ffmpeg`) and XcodeGen (`brew install xcodegen`), and your Apple team id in `BENCH_APPLE_TEAM_ID` (for signing the apps). The first recording asks for camera access for the terminal (macOS treats the phone's screen as a camera).

```sh
cd benchmark/app && bun install && cd ../images && bun install && bun make-images.ts && cd ../..
export BENCH_APPLE_TEAM_ID=<your team id>
bun benchmark/scripts/run.ts                                  # every subject, 5 runs each
bun benchmark/scripts/run.ts --subjects fast-image,expo-image --scenarios grid --metrics scroll --iterations 3
```

Options: `--subjects` (from `app/subjects.json`), `--scenarios` (`grid`, `large`; timed from the screen), `--metrics` (`scroll`, `large-memory`; XCTest), `--iterations`, `--latency` and `--mbps` (the on-phone image server's network: default 40 ms and no bandwidth limit, so the times are the libraries' own work; e.g. `--mbps 50` for a slow network), `--no-build` (the subjects' apps are already installed), `--keep-videos`, `--out` (a results folder to add to, e.g. after a failed subject).

### Android

Runs on a connected device or emulator (adb), or on Firebase Test Lab's physical devices, which need `gcloud` logged in (`gcloud auth login`) and the Firebase project (`react-native-fast-image` by default):

```sh
bun benchmark/scripts/run-android.ts --firebase                     # every subject, on a Pixel 8
bun benchmark/scripts/run-android.ts --firebase --device model=akita,version=35 --subjects fast-image
bun benchmark/scripts/run-android.ts --subjects fast-image --iterations 2   # adb device (an emulator only checks the setup)
```

Options: `--subjects`, `--scenarios`, `--tests` (`time-to-image`, `scroll`, `large-memory`), `--iterations`, `--no-build`, `--out`, `--device` (`gcloud firebase test android models list`), `--project`, `--latency` and `--mbps` (as on iOS). It needs JDK 17, the Android SDK, and the images in `images/out` (`bun make-images.ts` in `images/`). It builds every subject first (`--no-build` uses the APKs kept in `--out`'s `apks/`); on Test Lab the subjects then run at the same time, each on its own device, without Test Lab's own screen recording.

Results go to `benchmark/results/<time>/`: a JSON file per run (the app's results, and when each image showed), the XCTest result bundles, and `summary.md`. The folders aren't committed (recordings and builds); summaries of reference runs are, next to them (`results/<date>-<platform>-<device>.md`), to compare later runs with.

## How it works

- **Images** (`images/`): a fixed set of photos (`photos.json`), each tinted to its own color (`make-images.ts`), served on the phone by the tests: on iOS by the XCUITest runner (`ios/UITests/ImageServer.swift`), on Android by the Macrobenchmark test (`ImageServer.kt`), both at `127.0.0.1`. Each library still loads them over HTTP with its own networking, but every run and every phone has the same network: a fixed latency before each response, and optionally a bandwidth all the responses share, as on one real connection. Over the internet, phones measured from 10 to 366 Mbps, which swamped the differences between libraries; and with a 50 Mbps limit every library took about as long as the link did. Every run's urls have their own `run` id, so no image comes from an earlier run's caches. Once the images have loaded, the app times downloading 4 of the large photos with `fetch` (the same for every subject, not through it), so each run's network speed is reported next to its times. The server closes the connections of that download and of the app's request for the manifest, so no library starts a run with a connection open (on iOS, `fetch` shares React Native's `Image`'s).
- **The app** (`app/`): an Expo app, built once per subject with only that library linked (`subjects.js`, `react-native.config.js`, `plugins/withSubject.js`), in Release. A subject is an adapter (`subjects/<id>.tsx`) that renders an image from a url and reports its load events. The scenario comes from launch arguments: it shows a black marker bar, turns it green and starts the clock as it mounts the images, records each image's first load event, and writes its results (and where each cell is on screen) to its Documents folder, which `run.ts` copies over USB, then turns the marker blue. Before a subject's timed runs, one unmeasured run (a newly installed app's first launch is slower); before each run, every benchmark app is stopped, so none is in memory.
- **Time to image**, from pixels (`ios/capture/`, `scripts/analyze.ts`): the Mac records the phone's screen over USB (as QuickTime Player can) while a scenario runs. Next to the marker, the app draws a clock: the time since the run started, in binary, updated every frame by the native driver. Each frame is timed by its clock rather than by the file's timestamps, because the phone's frames can reach the Mac late, and the late ones are stamped as if no time had passed. The recording stops once the frame with the marker blue (the run's end) has arrived, and one recorder process records every run (a new one right after the last often didn't find the phone). Times start in the frame the clock starts in, as the app renders the subject's views, so they include each library's rendering. For each cell on screen, the image has shown in the first frame whose color is more than halfway from the gray placeholder to the cell's final color. Each image's frame window is reported too: how long before that frame the last earlier one was drawn, so the image showed within that time (about 17 ms when no frame is missing, more when the phone didn't draw a frame or one didn't reach the Mac; the clock moves in 1/60 s steps on Android). Runs aren't repeated: one whose analysis fails counts as a failure and keeps its recording. The gap between an image's frame and its load event is reported too, as a check on the libraries' events.
- **Android** (`android/macrobenchmark`, `scripts/run-android.ts`): a Macrobenchmark test APK, copied into the app's generated project by `app/plugins/withAndroidBenchmark.js` (which also makes the app profileable), drives the app as a separate package, as Firebase Test Lab runs it. Its time-to-image test starts `screenrecord` and launches the app on a scenario with a link (`rnfibench://run?scenario=…&run=…`); the app logs its results in chunks (a release app's files can't be read), and the recordings and results are analyzed on the Mac as on iOS. The app is compiled as the Macrobenchmark tests leave it (`speed-profile`), whichever test runs first. The images are in the test APK's assets. Scrolling uses `FrameTimingMetric` (flings, after a pass that loads the images), memory `MemoryUsageMetric`.
- **The iOS runner** (`ios/`): XCUITests (an Xcode project made by XcodeGen, with the images in the test bundle). `testServe` only serves the images while `run.ts` launches the app for the timed runs; the others launch the subject's app by bundle id and measure hitches while scrolling a 500-image list (`XCTOSSignpostMetric.scrollingAndDecelerationMetric`) and memory (`XCTMemoryMetric`).

## Scenarios

| Scenario | Images                                        | Measures                                        |
| -------- | --------------------------------------------- | ----------------------------------------------- |
| `grid`   | 60 photos (400 px) in a grid laid out at once | time to each image on screen, from a cold cache |
| `large`  | 20 photos (4000 × 3000) in small views        | time to each image; memory (`large-memory`)     |
| `scroll` | 500 photos (300 px) in a FlashList            | hitches and memory while scrolling (`scroll`)   |

Nitro Image's view sends no load events, so its scenarios end after a fixed time, long enough for every subject at no bandwidth limit and at `--mbps 50` (`fixedMs` in `app/src/Scenario.tsx`), and have no event gap. Turbo Image and React Native's `Image` are run with `fadeDuration={0}`: they fade remote images in over 300 ms by default (React Native's `Image` on Android only), and the others show them at once.

## Limits

- On Test Lab each subject runs on its own phone, so differences between the phones (and their temperature) count as differences between the subjects. The device isn't recorded per run.
- On iOS the subjects run one after another in the same order, each after the previous one's XCTest metrics, so later subjects can run on a warmer phone.
- The phone's screen recording and the app's clock cost every subject the same, but they do cost something.
