# iOS, iPhone 15 Pro Max, 2026-10-10

The reference run (`run.ts --subjects fast-image-local,image,expo-image,nitro-image,turbo-image --scenarios grid,large,sizes`, see ../README.md): the benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release, 5 runs per scenario, on an iPhone 15 Pro Max (iOS 27.0) over USB. FastImage 10 (FastImage (this checkout): the 10.0 stack's top), React Native Image (React Native 0.86.3), expo-image 57.0.5, Nitro Image 0.15.2, Turbo Image 1.24.3, each with its defaults and without fades. Images served on the phone by the XCUITest runner, with 40 ms latency and no bandwidth limit. The subjects ran one after another, in this order.

Times in ms from the start of the run (the frame its clock starts in, as the app renders the subject's views), from screen recordings, timed by the clock the app draws in each frame: median / p90 over the runs (with 5 runs, p90 is the slowest). All visible images: over the runs that showed every one; the others are counted in the next columns. Frame window: how long before an image's first frame the last earlier one was drawn (median / max): the image showed within that time. Network: the median download rate of 4 large photos fetched with `fetch` (not through the subject) once the images have loaded. iOS: iPhone 15 Pro Max (iOS 27.0). Images served on the phone (40 ms latency, unlimited Mbps).

| Platform | Subject                   | Scenario | Runs | First image | All visible images | Per image | Frame window | Load event after pixels | Images not shown (load errors) | Network Mbps | Failures |
| -------- | ------------------------- | -------- | ---- | ----------- | ------------------ | --------- | ------------ | ----------------------- | ------------------------------ | ------------ | -------- |
| ios      | React Native Image        | grid     | 5    | 116 / 136   | 400 / 416          | 236 / 368 | 16 / 20      | 10                      |                                | 204          |          |
| ios      | React Native Image        | large    | 5    | 132 / 148   | 348 / 348          | 216 / 316 | 16 / 20      | 8                       |                                | 195          |          |
| ios      | React Native Image        | sizes    | 5    | 132 / 144   | 316 / 332          | 248 / 280 | 16 / 20      | 7                       |                                | 193          |          |
| ios      | FastImage (this checkout) | grid     | 5    | 112 / 144   | 328 / 344          | 212 / 328 | 16 / 52      | 12                      |                                | 190          |          |
| ios      | FastImage (this checkout) | large    | 5    | 148 / 148   | 332 / 332          | 216 / 280 | 16 / 32      | 8                       |                                | 186          |          |
| ios      | FastImage (this checkout) | sizes    | 5    | 116 / 132   | 248 / 248          | 180 / 232 | 16 / 20      | 9                       |                                | 190          |          |
| ios      | expo-image                | grid     | 5    | 160 / 180   | 360 / 380          | 260 / 348 | 20 / 52      | 7                       |                                | 199          |          |
| ios      | expo-image                | large    | 5    | 152 / 164   | 564 / 584          | 444 / 564 | 272 / 376    | 19                      |                                | 199          |          |
| ios      | expo-image                | sizes    | 5    | 116 / 144   | 208 / 244          | 160 / 212 | 16 / 36      | 36                      |                                | 190          |          |
| ios      | Nitro Image               | grid     | 5    | 132 / 144   | 316 / 360          | 216 / 316 | 16 / 52      | –                       |                                | 205          |          |
| ios      | Nitro Image               | large    | 5    | 132 / 132   | 300 / 312          | 200 / 264 | 16 / 32      | –                       |                                | 185          |          |
| ios      | Nitro Image               | sizes    | 5    | 132 / 132   | 216 / 232          | 164 / 216 | 16 / 16      | –                       |                                | 185          |          |
| ios      | Turbo Image               | grid     | 5    | 116 / 132   | 312 / 316          | 216 / 300 | 16 / 20      | 6                       |                                | 185          |          |
| ios      | Turbo Image               | large    | 5    | 188 / 216   | 564 / 680          | 380 / 564 | 48 / 132     | -10                     |                                | 188          |          |
| ios      | Turbo Image               | sizes    | 5    | 116 / 132   | 216 / 216          | 148 / 216 | 16 / 20      | 15                      |                                | 187          |          |

iOS XCTest metrics (median / p90 of the measurements):

| Subject                   | Test        | Metric                   | Median     | p90        |
| ------------------------- | ----------- | ------------------------ | ---------- | ---------- |
| expo-image                | LargeMemory | Absolute Memory Physical | 417041 kB  | 426428 kB  |
| expo-image                | LargeMemory | Memory Peak Physical     | 505891 kB  | 508480 kB  |
| expo-image                | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| expo-image                | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| expo-image                | Scroll      | Absolute Memory Physical | 69388 kB   | 77023 kB   |
| expo-image                | Scroll      | Memory Peak Physical     | 69929 kB   | 77498 kB   |
| expo-image                | Scroll      | Frame Rate               | 85 fps     | 86 fps     |
| React Native Image        | LargeMemory | Memory Peak Physical     | 64866 kB   | 68897 kB   |
| React Native Image        | LargeMemory | Absolute Memory Physical | 46565 kB   | 47450 kB   |
| React Native Image        | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| React Native Image        | Scroll      | Memory Peak Physical     | 67094 kB   | 74008 kB   |
| React Native Image        | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| React Native Image        | Scroll      | Frame Rate               | 86 fps     | 87 fps     |
| React Native Image        | Scroll      | Absolute Memory Physical | 67094 kB   | 73648 kB   |
| FastImage (this checkout) | LargeMemory | Absolute Memory Physical | 50759 kB   | 60787 kB   |
| FastImage (this checkout) | LargeMemory | Memory Peak Physical     | 73238 kB   | 78956 kB   |
| FastImage (this checkout) | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| FastImage (this checkout) | Scroll      | Memory Peak Physical     | 63736 kB   | 69716 kB   |
| FastImage (this checkout) | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| FastImage (this checkout) | Scroll      | Absolute Memory Physical | 63686 kB   | 69683 kB   |
| FastImage (this checkout) | Scroll      | Frame Rate               | 86 fps     | 86 fps     |
| Nitro Image               | LargeMemory | Absolute Memory Physical | 407341 kB  | 408242 kB  |
| Nitro Image               | LargeMemory | Memory Peak Physical     | 430131 kB  | 432753 kB  |
| Nitro Image               | Scroll      | Memory Peak Physical     | 64375 kB   | 70945 kB   |
| Nitro Image               | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| Nitro Image               | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| Nitro Image               | Scroll      | Absolute Memory Physical | 64309 kB   | 70732 kB   |
| Nitro Image               | Scroll      | Frame Rate               | 85 fps     | 86 fps     |
| Turbo Image               | LargeMemory | Memory Peak Physical     | 258705 kB  | 274762 kB  |
| Turbo Image               | LargeMemory | Absolute Memory Physical | 57559 kB   | 75303 kB   |
| Turbo Image               | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| Turbo Image               | Scroll      | Memory Peak Physical     | 56428 kB   | 63359 kB   |
| Turbo Image               | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| Turbo Image               | Scroll      | Absolute Memory Physical | 56346 kB   | 63310 kB   |
| Turbo Image               | Scroll      | Frame Rate               | 85 fps     | 87 fps     |
