# Benchmarks

How long images take to show, how much memory they use, and how smoothly a list of them scrolls, for FastImage and other React Native image components, measured the same way for each. These are the latest reference results: from 2026-10-02 for FastImage 8.28.0, and for many images loading at once on Android from 2026-10-10, with FastImage 10.

## How it's measured

- **The same app for every library.** An Expo app (SDK 57, React Native 0.86.3, New Architecture) is built in Release once per library, with only that library linked. Libraries: FastImage 8.28.0, React Native's `Image` (0.86.3), expo-image 57.0.5, Nitro Image 0.15.2 and Turbo Image 1.24.3, each with its defaults, except that fades are turned off (React Native's `Image` on Android and Turbo Image fade images in over 300 ms by default).
- **The same images and network.** A fixed set of photos is served by a small HTTP server on the phone itself, with 40 ms before each response and no bandwidth limit, so the times are the libraries' own work rather than the network's. Each library loads them over HTTP with its own networking, from a cold cache.
- **Time until images are on screen, from pixels.** The phone's screen is recorded while the app shows the images, and each image counts as shown in the first frame where it's visible. Load events (`onLoad`) aren't used for the times. Each run is timed from when the app starts rendering the images, so the times include each library's rendering.
- **Memory and scrolling** come from Apple's XCTest metrics on iOS and Android's Macrobenchmark.
- 5 runs per scenario. Times are the median and the slowest of the 5, in milliseconds.

Scenarios:

- **Grid:** 60 photos of 400 × 400 px in a grid, all mounted at once; the time until every one on screen (28 on the iPhone, 32 on the Pixel) has shown.
- **Large:** 20 photos of 4000 × 3000 px shown in small views; the time until all have shown, and the app's memory once they have.
- **Scroll:** 500 photos of 300 × 300 px in a list, scrolled through quickly.
- **Burst** (Android): the grid's 60 photos mounted at once, with and without each library's fade and a placeholder image; how much time the app spent drawing frames until they had all loaded.

## iOS

iPhone 15 Pro Max, iOS 27.

| Library            | Grid: all shown (ms) | Large: all shown (ms) | Large: memory |
| ------------------ | -------------------- | --------------------- | ------------- |
| FastImage          | 332 / 344            | 316 / 332             | 49 MB         |
| React Native Image | 392 / 400            | 332 / 344             | 46 MB         |
| expo-image         | 296 / 332            | 548 / 564             | 412 MB        |
| Nitro Image        | 328 / 332            | 308 / 332             | 408 MB        |
| Turbo Image        | 300 / 312            | 516 / 632             | 54 MB         |

- FastImage decodes images at the size they're shown (`downsample`, on by default since 8.28.0), which keeps the large photos' memory low.
- With expo-image, the phone drew no new frame for about 276 ms before the large photos appeared.
- Scrolling: no hitches for any library.
- Between two rounds of runs on this phone, every time moved by 50 ms or less.

## Android

Pixel 8, Android 15, on Firebase Test Lab.

| Library            | Grid: all shown (ms) | Large: all shown (ms) | Large: memory |
| ------------------ | -------------------- | --------------------- | ------------- |
| FastImage          | 748 / 832            | 448 / 480             | 89 MB         |
| React Native Image | 496 / 680            | 4 of 20 not shown     | 271 MB        |
| expo-image         | 564 / 780            | 464 / 480             | 104 MB        |
| Nitro Image        | 764 / 816            | 780 / 816             | 96 MB         |
| Turbo Image        | 580 / 596            | 1380 / 1416           | 97 MB         |

**Use these numbers only to see which libraries are in the same range.** Each library ran on a different Test Lab phone of the same model, and the phones differ: between two rounds of runs, times moved by up to 450 ms in both directions (FastImage's grid from 596 to 748 ms, Turbo Image's large photos from 932 to 1380 ms).

- React Native's `Image` decodes the large photos at full size and fails the last ones (Fresco's `Pool hard cap violation`). Memory is the app's anonymous resident memory.
- Scrolling: no frames over their deadline for any library.

## Many images loading at once (Android)

The grid's 60 photos mounted at once from a cold cache, on four Pixel 8s (Android 15, Firebase Test Lab), with FastImage 10, expo-image 57.0.5 and React Native's `Image` (0.86.3). Each phone ran every library in turns, two of them in the opposite order, 10 times each. Each library was run four ways: as it is (no fade), with its fade-in over 300 ms (FastImage's `transition`, expo-image's `transition={300}`, React Native's `fadeDuration`), with a gray placeholder image until each photo loads (`defaultSource`, expo-image's `placeholder`), and with both. Android's animations were on.

Time spent drawing frames, from when the photos mount until the run ends shortly after the last one loads, on the UI thread and the RenderThread over all frames (median of 40 runs, ms), and the most memory used:

| Library            | No fade | Fade | Placeholder | Fade over the placeholder | Memory     |
| ------------------ | ------- | ---- | ----------- | ------------------------- | ---------- |
| FastImage          | 398     | 551  | 466         | 615                       | 119–123 MB |
| expo-image         | 429     | 574  | 459         | 650                       | 125–130 MB |
| React Native Image | 512     | 633  | 557         | 680                       | 134–140 MB |

- The fade adds 153 ms for FastImage, 145 ms for expo-image and 121 ms for React Native's `Image`; over the placeholder 149, 191 (expo-image also fades the placeholder in) and 123 ms.
- Every library missed one or two frame deadlines per run, as the 60 views mounted; fades didn't add any.
- These are every frame's time: Macrobenchmark's frame timing only counts the frames Android's frame timeline shows presented, which left out a fifth to a third of expo-image's frames and almost none of the others'.

## Running it

The benchmark is in the repository's [`benchmark/`](https://github.com/DylanVann/react-native-fast-image/tree/main/benchmark) folder; its [README](https://github.com/DylanVann/react-native-fast-image/blob/main/benchmark/README.md) explains how to run it and how it works, and [`benchmark/results/`](https://github.com/DylanVann/react-native-fast-image/tree/main/benchmark/results) has the full results (first image, every image, frame timing, load events, and all the metrics).
