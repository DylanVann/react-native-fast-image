# Benchmarks

How long images take to show, how much memory they use, how smoothly a list of them scrolls, and how much drawing a screen of them costs, for FastImage 10 and other React Native image components, measured the same way for each. These are the latest reference results, from 2026-10-10.

## How it's measured

- **The same app for every library.** An Expo app (SDK 57, React Native 0.86.3, New Architecture) is built in Release once per library, with only that library linked. Libraries: FastImage 10, React Native's `Image` (0.86.3), expo-image 57.0.5, Nitro Image 0.15.2 and Turbo Image 1.24.3, each with its defaults, except that fades are turned off outside the burst test (FastImage 10 and React Native's `Image` on Android, and Turbo Image, fade images in over 300 ms by default).
- **The same images and network.** A fixed set of photos is served by a small HTTP server on the phone itself, with 40 ms before each response and no bandwidth limit, so the times are the libraries' own work rather than the network's. Each library loads them over HTTP with its own networking, from a cold cache.
- **Time until images are on screen, from pixels.** The phone's screen is recorded while the app shows the images, and each image counts as shown in the first frame where it's visible. Load events (`onLoad`) aren't used for the times. Each run is timed from when the app starts rendering the images, so the times include each library's rendering.
- **Memory, scrolling and drawing** come from Apple's XCTest metrics on iOS and Android's Macrobenchmark.
- **iOS:** an iPhone 15 Pro Max (iOS 27), 5 runs per scenario, the libraries one after another.
- **Android:** Pixel 8s (Android 15) on Firebase Test Lab. For the times, four phones each ran every library in turns, in the other order each time, 5 times each (20 runs per library). Memory and the burst test ran the same way on two phones each, one in each order. Scrolling ran each library on its own phone.
- Times are the median and the 90th percentile, in milliseconds (on iOS, with 5 runs, the slowest).

Scenarios:

- **Grid:** 60 photos of 400 × 400 px in a grid, all mounted at once; the time until every one on screen (28 on the iPhone, 32 on the Pixel) has shown.
- **Large:** 20 photos of 4000 × 3000 px shown in small views; the time until all have shown, and the app's memory once they have.
- **Sizes:** 16 of the grid's photos at two sizes at once (4 and 8 columns), with the same urls; the time until all 32 have shown, and on Android how many requests the server got (16 when a library downloads each photo once for both sizes).
- **Detail:** the grid's photos, and 100 ms later the last of them (the one the grid asked for last) at the screen's width over the grid, which goes on loading, with high priority where the library has one; the time until it has shown.
- **Scroll:** 500 photos of 300 × 300 px in a list, scrolled through quickly.
- **Burst** (Android): the grid's 60 photos mounted at once, with and without each library's fade and a placeholder image; how much time the app spent drawing frames until they had all loaded.

## iOS

| Library            | Grid (ms) | Large (ms) | Sizes (ms) | Large: memory |
| ------------------ | --------- | ---------- | ---------- | ------------- |
| FastImage 10       | 328 / 344 | 332 / 332  | 248 / 248  | 51 MB         |
| React Native Image | 400 / 416 | 348 / 348  | 316 / 332  | 47 MB         |
| expo-image         | 360 / 380 | 564 / 584  | 208 / 244  | 417 MB        |
| Nitro Image        | 316 / 360 | 300 / 312  | 216 / 232  | 407 MB        |
| Turbo Image        | 312 / 316 | 564 / 680  | 216 / 216  | 58 MB         |

- FastImage decodes images at the size they're shown (`downsample`, on by default), which keeps the large photos' memory low.
- With expo-image, the phone drew no new frame for about 270 ms before the large photos appeared.
- Scrolling: no hitches for any library.

## Android

| Library            | Grid (ms) | Large (ms)        | Sizes (ms) | Sizes: requests | Large: memory |
| ------------------ | --------- | ----------------- | ---------- | --------------- | ------------- |
| FastImage 10       | 548 / 664 | 464 / 496         | 348 / 380  | 16              | 97 MB         |
| React Native Image | 516 / 564 | 4 of 20 not shown | 348 / 348  | 16              | 269 MB        |
| expo-image         | 548 / 580 | 464 / 496         | 516 / 548  | 32              | 102 MB        |
| Nitro Image        | 796 / 832 | 848 / 932         | 564 / 580  | 32              | 93 MB         |
| Turbo Image        | 596 / 764 | 864 / 916         | 564 / 596  | 32              | 95 MB         |

- FastImage 10 and React Native's `Image` download a photo shown at two sizes once; the others download it for each size, and showed both 168–216 ms later (medians).
- React Native's `Image` decodes the large photos at full size and fails the last ones (Fresco's `Pool hard cap violation`). Memory is the app's anonymous resident memory.
- Scrolling, frames past their deadline per pass through the list (median of 5): FastImage 10 0.9%, React Native's `Image` 0.7%, expo-image 1.5%, Nitro Image 6.9%, Turbo Image 10.5%.

## Opening a photo while others load (Android)

The grid's 60 photos start loading, and 100 ms later the last of them opens at the screen's width over the grid, as when a tap opens a photo, with `priority="high"` (FastImage, expo-image; the others have no priority). The time until it showed, from the grid's start (median / p90 of 20 runs on 4 phones, ms), and the image requests for all 61 images.

| Library            | Time      | Requests |
| ------------------ | --------- | -------- |
| FastImage 10       | 380 / 432 | 60       |
| React Native Image | 764 / 780 | 60       |
| expo-image         | 532 / 816 | 61       |
| Nitro Image        | 816 / 864 | 61       |
| Turbo Image        | 816 / 880 | 61       |

- FastImage moves the grid's download of the photo, still waiting to start, ahead of the others, and uses it for both sizes.
- expo-image downloads the photo again; in 9 of 20 runs it showed it within 332–480 ms, in the others within 532–816 ms.
- React Native's `Image`, Nitro Image and Turbo Image have no priority, and mostly showed it about when the grid's last photos loaded.

## Many images loading at once (Android)

Time spent drawing frames, from when the photos mount until the run ends shortly after the last one loads, on the UI thread and the RenderThread over all frames (median of 20 runs, ms), and the most memory used. Each library was run as it is, with its fade-in over 300 ms (FastImage's `transition`, expo-image's `transition={300}`, `fadeDuration`), and with the fade over a gray placeholder image until each photo loads (`defaultSource`, expo-image's `placeholder`). Android's animations were on.

| Library            | No fade | Fade | Fade over the placeholder | Memory     |
| ------------------ | ------- | ---- | ------------------------- | ---------- |
| FastImage 10       | 404     | 560  | 573                       | 124–127 MB |
| React Native Image | 497     | 638  | 681                       | 139–143 MB |
| expo-image         | 437     | 567  | 638                       | 130–134 MB |
| Turbo Image        | 378     | 537  | –                         | 108–111 MB |

- Every library missed one or two frame deadlines per run, as the 60 views mounted, with or without fades.
- Turbo Image's placeholders aren't local images. Nitro Image has no fade or placeholder, and sends no load events, so its runs last a fixed time and aren't comparable here.
- These are every frame's time: Macrobenchmark's frame timing only counts the frames Android's frame timeline shows presented, which left out a fifth to a third of expo-image's frames and almost none of the others'.

## Running it

The benchmark is in the repository's [`benchmark/`](https://github.com/DylanVann/react-native-fast-image/tree/main/benchmark) folder; its [README](https://github.com/DylanVann/react-native-fast-image/blob/main/benchmark/README.md) explains how to run it and how it works, and lists the commands for these reference results. [`benchmark/results/`](https://github.com/DylanVann/react-native-fast-image/tree/main/benchmark/results) has the full results (first image, every image, frame timing, load events, and all the metrics).
