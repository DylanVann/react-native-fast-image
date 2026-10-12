# iOS, iPhone 15 Pro Max, 2026-10-12

The reference run (`run.ts --subjects fast-image-local,image,expo-image,nitro-image,turbo-image --scenarios grid,large,sizes,detail`, see ../README.md): the benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release, 5 runs per scenario, on an iPhone 15 Pro Max (iOS 27.0) over USB. FastImage 10 (FastImage (this checkout): the 10.0 stack's top), React Native Image (React Native 0.86.3), expo-image 57.0.5, Nitro Image 0.15.2, Turbo Image 1.24.3, each with its defaults and without fades. Images served on the phone by the XCUITest runner, with 40 ms latency and no bandwidth limit. The subjects ran one after another, in this order. Turbo Image's time-to-image runs were run again on their own (`--subjects turbo-image --metrics "" --no-build`): in the first run the runner's image server stopped answering during its fourth grid run, and every later run failed to load (Nuke's data loading error, and the network check failed too).

`detail`: the grid's 60 photos, and 100 ms later the last of them at the screen's width over the grid, which goes on loading under it; with `priority="high"` for FastImage and expo-image (the others have no priority). Only that photo is timed.

Times in ms from the start of the run (the frame its clock starts in, as the app renders the subject's views), from screen recordings, timed by the clock the app draws in each frame: median / p90 over the runs (with 5 runs, p90 is the slowest). All visible images: over the runs that showed every one; the others are counted in the next columns. Frame window: how long before an image's first frame the last earlier one was drawn (median / max): the image showed within that time. Image requests: how many the image server got (median). Network: the median download rate of 4 large photos fetched with `fetch` (not through the subject) once the images have loaded. iOS: iPhone 15 Pro Max (iOS 27.0). Images served on the phone (40 ms latency, unlimited Mbps).

| Platform | Subject                   | Scenario | Runs | First image | All visible images | Per image | Frame window | Load event after pixels | Images not shown (load errors) | Image requests | Network Mbps | Failures |
| -------- | ------------------------- | -------- | ---- | ----------- | ------------------ | --------- | ------------ | ----------------------- | ------------------------------ | -------------- | ------------ | -------- |
| ios      | React Native Image        | detail   | 5    | 780 / 800   | 780 / 800          | 780 / 800 | 16 / 20      | 11                      |                                | 61             | 195          |          |
| ios      | React Native Image        | grid     | 5    | 116 / 132   | 380 / 400          | 248 / 380 | 16 / 36      | 7                       |                                | 60             | 196          |          |
| ios      | React Native Image        | large    | 5    | 132 / 132   | 332 / 348          | 216 / 316 | 16 / 36      | 7                       |                                | 20             | 199          |          |
| ios      | React Native Image        | sizes    | 5    | 148 / 148   | 300 / 316          | 248 / 280 | 20 / 36      | 5                       |                                | 17             | 197          |          |
| ios      | FastImage (this checkout) | detail   | 5    | 580 / 600   | 580 / 600          | 580 / 600 | 16 / 20      | 6                       |                                | 60             | 192          |          |
| ios      | FastImage (this checkout) | grid     | 5    | 116 / 132   | 316 / 364          | 216 / 316 | 16 / 52      | 10                      |                                | 60             | 207          |          |
| ios      | FastImage (this checkout) | large    | 5    | 144 / 156   | 328 / 340          | 212 / 288 | 16 / 20      | 6                       |                                | 20             | 191          |          |
| ios      | FastImage (this checkout) | sizes    | 5    | 132 / 132   | 248 / 248          | 180 / 248 | 16 / 20      | 9                       |                                | 16             | 193          |          |
| ios      | expo-image                | detail   | 5    | 580 / 580   | 580 / 580          | 580 / 580 | 16 / 16      | 9                       |                                | 60             | 194          |          |
| ios      | expo-image                | grid     | 5    | 108 / 160   | 308 / 360          | 208 / 304 | 16 / 20      | 34                      |                                | 60             | 203          |          |
| ios      | expo-image                | large    | 5    | 152 / 188   | 560 / 592          | 508 / 536 | 348 / 384    | 23                      |                                | 20             | 196          |          |
| ios      | expo-image                | sizes    | 5    | 112 / 132   | 212 / 232          | 160 / 212 | 16 / 32      | 33                      |                                | 16             | 194          |          |
| ios      | Nitro Image               | detail   | 5    | 548 / 580   | 548 / 580          | 548 / 580 | 16 / 16      | –                       |                                | 60             | 196          |          |
| ios      | Nitro Image               | grid     | 5    | 116 / 144   | 316 / 332          | 216 / 316 | 16 / 32      | –                       |                                | 60             | 195          |          |
| ios      | Nitro Image               | large    | 5    | 132 / 132   | 300 / 316          | 200 / 264 | 16 / 20      | –                       |                                | 20             | 189          |          |
| ios      | Nitro Image               | sizes    | 5    | 132 / 132   | 216 / 232          | 164 / 216 | 16 / 16      | –                       |                                | 16             | 193          |          |
| ios      | Turbo Image               | detail   | 5    | 528 / 532   | 528 / 532          | 528 / 532 | 16 / 16      | 22                      |                                | 60             | 194          |          |
| ios      | Turbo Image               | grid     | 5    | 116 / 116   | 300 / 316          | 200 / 300 | 16 / 36      | 12                      |                                | 60             | 196          |          |
| ios      | Turbo Image               | large    | 5    | 180 / 180   | 532 / 564          | 364 / 516 | 32 / 84      | -7                      |                                | 20             | 203          |          |
| ios      | Turbo Image               | sizes    | 5    | 116 / 116   | 216 / 216          | 164 / 216 | 16 / 20      | 9                       |                                | 16             | 195          |          |

iOS XCTest metrics (median / p90 of the measurements):

| Subject                   | Test        | Metric                   | Median     | p90        |
| ------------------------- | ----------- | ------------------------ | ---------- | ---------- |
| expo-image                | LargeMemory | Absolute Memory Physical | 414026 kB  | 424807 kB  |
| expo-image                | LargeMemory | Memory Peak Physical     | 506104 kB  | 507447 kB  |
| expo-image                | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| expo-image                | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| expo-image                | Scroll      | Absolute Memory Physical | 66046 kB   | 72550 kB   |
| expo-image                | Scroll      | Memory Peak Physical     | 66521 kB   | 73025 kB   |
| expo-image                | Scroll      | Frame Rate               | 85 fps     | 86 fps     |
| React Native Image        | LargeMemory | Memory Peak Physical     | 65505 kB   | 67143 kB   |
| React Native Image        | LargeMemory | Absolute Memory Physical | 48384 kB   | 52676 kB   |
| React Native Image        | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| React Native Image        | Scroll      | Memory Peak Physical     | 67619 kB   | 73730 kB   |
| React Native Image        | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| React Native Image        | Scroll      | Frame Rate               | 85 fps     | 85 fps     |
| React Native Image        | Scroll      | Absolute Memory Physical | 67291 kB   | 73648 kB   |
| FastImage (this checkout) | LargeMemory | Absolute Memory Physical | 51562 kB   | 61557 kB   |
| FastImage (this checkout) | LargeMemory | Memory Peak Physical     | 71452 kB   | 79513 kB   |
| FastImage (this checkout) | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| FastImage (this checkout) | Scroll      | Memory Peak Physical     | 62474 kB   | 68307 kB   |
| FastImage (this checkout) | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| FastImage (this checkout) | Scroll      | Absolute Memory Physical | 62408 kB   | 68225 kB   |
| FastImage (this checkout) | Scroll      | Frame Rate               | 85 fps     | 86 fps     |
| Nitro Image               | LargeMemory | Absolute Memory Physical | 406718 kB  | 408275 kB  |
| Nitro Image               | LargeMemory | Memory Peak Physical     | 429230 kB  | 434899 kB  |
| Nitro Image               | Scroll      | Memory Peak Physical     | 63506 kB   | 69175 kB   |
| Nitro Image               | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| Nitro Image               | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| Nitro Image               | Scroll      | Absolute Memory Physical | 63408 kB   | 69175 kB   |
| Nitro Image               | Scroll      | Frame Rate               | 85 fps     | 86 fps     |
| Turbo Image               | LargeMemory | Memory Peak Physical     | 272222 kB  | 278301 kB  |
| Turbo Image               | LargeMemory | Absolute Memory Physical | 63753 kB   | 71600 kB   |
| Turbo Image               | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| Turbo Image               | Scroll      | Memory Peak Physical     | 57362 kB   | 63703 kB   |
| Turbo Image               | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| Turbo Image               | Scroll      | Absolute Memory Physical | 56723 kB   | 63605 kB   |
| Turbo Image               | Scroll      | Frame Rate               | 85 fps     | 86 fps     |
