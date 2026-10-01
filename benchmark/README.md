# Benchmark

Measures how React Native image components load and show images, the same way for each, on a real iPhone: FastImage, React Native's `Image`, expo-image, Nitro Image and Turbo Image (`app/subjects.json`). Results are distributions over several runs, from the screen as the user sees it where possible.

## Running it

Needs a Mac with Xcode, an iPhone connected over USB (unlocked, Developer Mode on, and Settings → Developer → Enable UI Automation for the XCTest metrics), Bun, ffmpeg (`brew install ffmpeg`) and XcodeGen (`brew install xcodegen`). The first recording asks for camera access for the terminal (macOS treats the phone's screen as a camera).

```sh
cd benchmark/app && bun install && cd ../..
bun benchmark/scripts/run.ts                                  # every subject, 5 runs each
bun benchmark/scripts/run.ts --subjects fast-image,expo-image --scenarios grid --metrics scroll --iterations 3
```

Options: `--subjects` (from `app/subjects.json`), `--scenarios` (`grid`, `large`; timed from the screen), `--metrics` (`scroll`, `large-memory`; XCTest), `--iterations`, `--no-build` (the subjects' apps are already installed), `--keep-videos`.

### Android

Runs on a connected device or emulator (adb), or on Firebase Test Lab's physical devices, which need `gcloud` logged in (`gcloud auth login`) and the Firebase project (`react-native-fast-image` by default):

```sh
bun benchmark/scripts/run-android.ts --firebase                     # every subject, on a Pixel 8
bun benchmark/scripts/run-android.ts --firebase --device model=akita,version=35 --subjects fast-image
bun benchmark/scripts/run-android.ts --subjects fast-image --iterations 2   # adb device (an emulator only checks the setup)
```

Options: `--subjects`, `--scenarios`, `--tests` (`time-to-image`, `scroll`, `large-memory`), `--iterations`, `--no-build`, `--out`, `--device` (`gcloud firebase test android models list`), `--project`, `--latency` and `--mbps` (the on-phone image server's network, default 40 ms and 50 Mbps; 0 for none). It needs JDK 17, the Android SDK, and the images in `images/out` (`bun make-images.ts` in `images/`). It builds every subject first; on Test Lab the subjects then run at the same time, each on its own device.

Results go to `benchmark/results/<time>/`: a JSON file per run (the app's results, and when each image showed), the XCTest result bundles, and `summary.md`. The folders aren't committed (recordings and builds); summaries of reference runs are in `baselines/`, to compare later runs with.

## How it works

- **Images** (`images/`): on iOS, a Cloudflare Worker serves a fixed set of photos, each tinted to its own color, from Cloudflare's edge cache (`make-images.ts`, `worker.ts`). Every run's urls have their own `run` id, so no image comes from an earlier run's caches; before a run, the app requests every image once with another id, which warms the edge cache without warming the component's. Just before the images mount and again once they've loaded, the app times downloading 4 of the large photos with `fetch` (the same for every subject, not through it), so each run's network speed is reported next to its times. On Android the same images are served on the phone (below).
- **The app** (`app/`): an Expo app, built once per subject with only that library linked (`subjects.js`, `react-native.config.js`, `plugins/withSubject.js`), in Release. A subject is an adapter (`subjects/<id>.tsx`) that renders an image from a url and reports its load events. The scenario comes from launch arguments: it shows a marker bar, warms the edge cache, turns the marker green as it mounts the images, records each load event, and writes its results (and where each cell is on screen) to its Documents folder, which `run.ts` copies over USB.
- **Time to image**, from pixels (`capture/`, `scripts/analyze.ts`): the Mac records the phone's screen over USB (as QuickTime Player can) while a scenario runs. For each cell on screen, the image has shown in the first frame whose color is more than halfway from the gray placeholder to the cell's final color, timed from the first frame with the marker green and the cells still empty (the start of the run, rather than a snapshot of the previous run's screen that iOS can show while the app launches again). The gap between that and the image's load event is reported too (it includes about a frame of the marker's own drawing).
- **Android** (`android/macrobenchmark`, `scripts/run-android.ts`): a Macrobenchmark test APK, copied into the app's generated project by `app/plugins/withAndroidBenchmark.js` (which also makes the app profileable), drives the app as a separate package, as Firebase Test Lab runs it. Its time-to-image test starts `screenrecord` and launches the app on a scenario with a link (`rnfibench://run?scenario=…&run=…`); the app logs its results in chunks (a release app's files can't be read), and the recordings and results are analyzed on the Mac as on iOS. The images come from a small HTTP server the test runs on the phone (`ImageServer.kt`, at `127.0.0.1`, with the images in the test APK's assets), so each library still loads them over HTTP with its own networking, but every run and every phone has the same network: a fixed latency before each response and a bandwidth all the responses share, as on one real connection. Over the internet, Test Lab's phones measured from 10 to 77 Mbps, which swamped the differences between libraries. Scrolling uses `FrameTimingMetric` (flings, after a pass that loads the images), memory `MemoryUsageMetric`.
- **Scrolling and memory** (`ios/`): XCUITests (an Xcode project made by XcodeGen) launch the subject's app by bundle id and measure hitches while scrolling a 500-image list (`XCTOSSignpostMetric.scrollingAndDecelerationMetric`) and memory (`XCTMemoryMetric`).

## Scenarios

| Scenario | Images                                        | Measures                                        |
| -------- | --------------------------------------------- | ----------------------------------------------- |
| `grid`   | 60 photos (400 px) in a grid laid out at once | time to each image on screen, from a cold cache |
| `large`  | 20 photos (4000 × 3000) in small views        | time to each image; memory (`large-memory`)     |
| `scroll` | 500 photos (300 px) in a FlashList            | hitches and memory while scrolling (`scroll`)   |

Nitro Image's view sends no load events, so its scenarios end after a fixed time, about twice the longest any subject has taken on that platform (`fixedMs` in `app/src/Scenario.tsx`) and have no event gap. Turbo Image is run with `fadeDuration={0}`: it fades images in over 300 ms by default, and the others show them at once by default.
