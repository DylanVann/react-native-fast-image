# Benchmarks

How long images take to show, how much memory they use, and how smoothly a list of them scrolls, for Fast Image and other React Native image components, measured the same way for each. These are the latest reference results, from 2026-10-12.

These results are for Fast Image 10.0.0, measured from its code on the day it was released. Later versions may perform differently until the benchmarks are run again.

## How it's measured

- **The same app for every library.** An Expo app (SDK 57, React Native 0.86.3, New Architecture) is built in Release once per library, with only that library linked. Libraries: Fast Image, React Native's `Image` (0.86.3), Expo Image 57.0.5, Nitro Image 0.15.2 and Turbo Image 1.24.3, each with its defaults, except that fades are turned off (Fast Image and React Native's `Image` on Android, and Turbo Image, fade images in over 300 ms by default).
- **The same images and network.** A fixed set of photos is served by a small HTTP server on the phone itself, with 40 ms before each response and no bandwidth limit, so the times are the libraries' own work rather than the network's. Each library loads them over HTTP with its own networking, from a cold cache.
- **Time until images are on screen, from pixels.** The phone's screen is recorded while the app shows the images, and each image counts as shown in the first frame where it's visible. Load events (`onLoad`) aren't used for the times. Each run is timed from when the app starts rendering the images, so the times include each library's rendering.
- **Memory and scrolling** come from Apple's XCTest metrics on iOS and Android's Macrobenchmark.
- **iOS:** an iPhone 15 Pro Max (iOS 27), 5 runs per scenario, the libraries one after another.
- **Android:** Pixel 8s (Android 15) on Firebase Test Lab. For the times, four phones each ran every library in turns, in the other order each time, 5 times each (20 runs per library). Memory ran the same way on two phones, one in each order. Scrolling ran each library on its own phone.
- Times are the median and the 90th percentile, in milliseconds (on iOS, with 5 runs, the slowest).

Scenarios:

- **Grid:** 60 photos of 400 × 400 px in a grid, all mounted at once; the time until every one on screen (28 on the iPhone, 32 on the Pixel) has shown.
- **Large:** 20 photos of 4000 × 3000 px shown in small views; the time until all have shown, and the app's memory once they have.
- **Sizes:** 16 of the grid's photos at two sizes at once (4 and 8 columns), with the same urls; the time until all 32 have shown, and on Android how many requests the server got (16 when a library downloads each photo once for both sizes).
- **Detail:** the grid's photos, and 100 ms later the last of them (the one the grid asked for last) at the screen's width over the grid, which goes on loading, with high priority where the library has one; the time until it has shown.
- **Scroll:** 500 photos of 300 × 300 px in a list, scrolled through quickly.

## iOS

<!-- chart: Grid (ms), Large (ms), Sizes (ms), Large: memory -->

| Library            | Grid (ms) | Large (ms) | Sizes (ms) | Large: memory |
| ------------------ | --------: | ---------: | ---------: | ------------: |
| Fast Image         | 316 / 364 |  328 / 340 |  248 / 248 |         52 MB |
| React Native Image | 380 / 400 |  332 / 348 |  300 / 316 |         48 MB |
| Expo Image         | 308 / 360 |  560 / 592 |  212 / 232 |        414 MB |
| Nitro Image        | 316 / 332 |  300 / 316 |  216 / 232 |        407 MB |
| Turbo Image        | 300 / 316 |  532 / 564 |  216 / 216 |         64 MB |

- Fast Image decodes images at the size they're shown (`downsample`, on by default), which keeps the large photos' memory low.
- With Expo Image, the phone drew no new frame for about 350 ms before the large photos appeared.
- Scrolling: no hitches for any library.

[Fast Image in the scroll test on the iPhone, in real time: the app opens, its photos load, and the test scrolls quickly through the list of 500 photos.](assets/benchmark-scroll-ios.mp4)

## Android

<!-- chart: Grid (ms), Large (ms), Sizes (ms), Large: memory -->

| Library            | Grid (ms) |        Large (ms) | Sizes (ms) | Sizes: requests | Large: memory |
| ------------------ | --------: | ----------------: | ---------: | --------------: | ------------: |
| Fast Image         | 548 / 616 |         480 / 580 |  348 / 380 |              16 |         97 MB |
| React Native Image | 516 / 580 | 4 of 20 not shown |  348 / 364 |              16 |        269 MB |
| Expo Image         | 548 / 616 |         480 / 516 |  516 / 548 |              32 |        102 MB |
| Nitro Image        | 796 / 832 |        848 / 1080 |  564 / 632 |              32 |         92 MB |
| Turbo Image        | 648 / 796 |        864 / 1364 |  564 / 596 |              32 |         94 MB |

- Fast Image and React Native's `Image` download a photo shown at two sizes once; the others download it for each size, and showed both 168–232 ms later (medians). Expo Image didn't show one photo in one of its 20 runs (a load error).
- React Native's `Image` decodes the large photos at full size and fails the last ones (Fresco's `Pool hard cap violation`). Memory is the app's anonymous resident memory.
- Scrolling, frames past their deadline per pass through the list (median of 5): Fast Image 0.3%, React Native's `Image` 0.4%, Expo Image 1.1%, Nitro Image 1.2%, Turbo Image 7.3%.

## Opening a photo while others load

The grid's 60 photos start loading, and 100 ms later the last of them opens at the screen's width over the grid, as when a tap opens a photo, with high priority (Fast Image's `source.priority`, Expo Image's `priority`; React Native's `Image` and Turbo Image have no priority, and Nitro Image's `priority` option wasn't set in this run). The time until it showed, from the grid's start (median / p90, ms), and the image requests for all 61 images.

### Android

20 runs on 4 phones.

[Fast Image and Expo Image in one round on the same phone, each near its median time, at ¼ speed: the grid starts loading, and at 100 ms the photo opens over it.](assets/benchmark-detail-android.mp4)

<!-- chart: Time (ms) -->

| Library            | Time (ms) | Requests |
| ------------------ | --------: | -------: |
| Fast Image         | 280 / 316 |       60 |
| React Native Image | 764 / 780 |       60 |
| Expo Image         | 748 / 816 |       61 |
| Nitro Image        | 832 / 880 |       61 |
| Turbo Image        | 832 / 864 |       61 |

- Fast Image moves the grid's download of the photo, still waiting to start, ahead of the others, and uses it for both sizes. Downloads that haven't started wait in Fast Image's own queue, where priority applies, rather than in the HTTP client's.
- Expo Image downloads the photo again; in 6 of 20 runs it showed it within 248–416 ms, in the others within 532–832 ms.
- React Native's `Image` and Turbo Image have no priority, and Nitro Image ran without its `priority` option; they mostly showed it about when the grid's last photos loaded.

### iOS

5 runs.

<!-- chart: Time (ms) -->

| Library            | Time (ms) | Requests |
| ------------------ | --------: | -------: |
| Fast Image         | 580 / 600 |       60 |
| React Native Image | 780 / 800 |       61 |
| Expo Image         | 580 / 580 |       60 |
| Nitro Image        | 548 / 580 |       60 |
| Turbo Image        | 528 / 532 |       60 |

- Every library but React Native's `Image` showed the photo within 528–580 ms (medians), and used the grid's download of it.

## Running it

The benchmark is in the repository's [`benchmark/`](https://github.com/DylanVann/react-native-fast-image/tree/main/benchmark) folder; its [README](https://github.com/DylanVann/react-native-fast-image/blob/main/benchmark/README.md) explains how to run it and how it works, and lists the commands for these reference results. [`benchmark/results/`](https://github.com/DylanVann/react-native-fast-image/tree/main/benchmark/results) has the full results (first image, every image, frame timing, load events, and all the metrics).
