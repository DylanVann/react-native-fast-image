# iOS, iPhone 15 Pro Max, 2026-10-02

The benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release, 5 runs per scenario: FastImage 8.28.0, React Native Image (React Native 0.86.3), expo-image 57.0.5, Nitro Image 0.15.2, Turbo Image 1.24.3. Images served on the phone by the XCUITest runner, with 40 ms latency and no bandwidth limit; frames timed by the clock the app draws; no other benchmark app running. Between two rounds on this phone, every time moved by 50 ms or less.

Times in ms from the start of the run (the frame its clock starts in, as the app renders the subject's views), from screen recordings, timed by the clock the app draws in each frame: median / p90 over the runs (with 5 runs, p90 is the slowest). All visible images: over the runs that showed every one; the others are counted in the next columns. Frame window: how long before an image's first frame the last earlier one was drawn (median / max): the image showed within that time. Network: the median download rate of 4 large photos fetched with `fetch` (not through the subject) once the images have loaded. iOS: iPhone 15 Pro Max (iOS 27.0). Images served on the phone (40 ms latency, unlimited Mbps).

| Platform | Subject            | Scenario | Runs | First image | All visible images | Per image | Frame window | Load event after pixels | Images not shown (load errors) | Network Mbps | Failures |
| -------- | ------------------ | -------- | ---- | ----------- | ------------------ | --------- | ------------ | ----------------------- | ------------------------------ | ------------ | -------- |
| ios      | React Native Image | grid     | 5    | 116 / 132   | 392 / 400          | 244 / 364 | 16 / 36      | 6                       |                                | 197          |          |
| ios      | React Native Image | large    | 5    | 132 / 148   | 332 / 344          | 216 / 316 | 16 / 20      | 5                       |                                | 191          |          |
| ios      | FastImage          | grid     | 5    | 132 / 148   | 332 / 344          | 232 / 332 | 16 / 52      | 8                       |                                | 182          |          |
| ios      | FastImage          | large    | 5    | 148 / 148   | 316 / 332          | 216 / 280 | 16 / 20      | 7                       |                                | 181          |          |
| ios      | expo-image         | grid     | 5    | 108 / 132   | 296 / 332          | 208 / 292 | 16 / 20      | 33                      |                                | 198          |          |
| ios      | expo-image         | large    | 5    | 148 / 156   | 548 / 564          | 460 / 548 | 276 / 368    | 21                      |                                | 191          |          |
| ios      | Nitro Image        | grid     | 5    | 132 / 132   | 328 / 332          | 216 / 316 | 16 / 52      | –                       |                                | 189          |          |
| ios      | Nitro Image        | large    | 5    | 132 / 140   | 308 / 332          | 200 / 264 | 16 / 36      | –                       |                                | 185          |          |
| ios      | Turbo Image        | grid     | 5    | 116 / 128   | 300 / 312          | 200 / 300 | 16 / 20      | 8                       |                                | 197          |          |
| ios      | Turbo Image        | large    | 5    | 164 / 180   | 516 / 632          | 348 / 516 | 52 / 120     | -6                      |                                | 192          |          |

iOS XCTest metrics (median / p90 of the measurements):

| Subject            | Test        | Metric                   | Median     | p90        |
| ------------------ | ----------- | ------------------------ | ---------- | ---------- |
| expo-image         | LargeMemory | Absolute Memory Physical | 411880 kB  | 424725 kB  |
| expo-image         | LargeMemory | Memory Peak Physical     | 508234 kB  | 526338 kB  |
| expo-image         | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| expo-image         | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| expo-image         | Scroll      | Absolute Memory Physical | 66750 kB   | 74238 kB   |
| expo-image         | Scroll      | Memory Peak Physical     | 67307 kB   | 74729 kB   |
| expo-image         | Scroll      | Frame Rate               | 86 fps     | 86 fps     |
| FastImage          | LargeMemory | Absolute Memory Physical | 49350 kB   | 52300 kB   |
| FastImage          | LargeMemory | Memory Peak Physical     | 72141 kB   | 80464 kB   |
| FastImage          | Scroll      | Frame Rate               | 86 fps     | 86 fps     |
| FastImage          | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| FastImage          | Scroll      | Absolute Memory Physical | 67635 kB   | 75893 kB   |
| FastImage          | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| FastImage          | Scroll      | Memory Peak Physical     | 67651 kB   | 75958 kB   |
| React Native Image | LargeMemory | Memory Peak Physical     | 63605 kB   | 69093 kB   |
| React Native Image | LargeMemory | Absolute Memory Physical | 46287 kB   | 46549 kB   |
| React Native Image | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| React Native Image | Scroll      | Memory Peak Physical     | 67029 kB   | 73795 kB   |
| React Native Image | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| React Native Image | Scroll      | Frame Rate               | 85 fps     | 86 fps     |
| React Native Image | Scroll      | Absolute Memory Physical | 66931 kB   | 73533 kB   |
| Nitro Image        | LargeMemory | Absolute Memory Physical | 407783 kB  | 408930 kB  |
| Nitro Image        | LargeMemory | Memory Peak Physical     | 430098 kB  | 438143 kB  |
| Nitro Image        | Scroll      | Memory Peak Physical     | 64489 kB   | 70469 kB   |
| Nitro Image        | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| Nitro Image        | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| Nitro Image        | Scroll      | Absolute Memory Physical | 64440 kB   | 70404 kB   |
| Nitro Image        | Scroll      | Frame Rate               | 85 fps     | 86 fps     |
| Turbo Image        | LargeMemory | Memory Peak Physical     | 264145 kB  | 273533 kB  |
| Turbo Image        | LargeMemory | Absolute Memory Physical | 54201 kB   | 57822 kB   |
| Turbo Image        | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| Turbo Image        | Scroll      | Memory Peak Physical     | 57428 kB   | 65014 kB   |
| Turbo Image        | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| Turbo Image        | Scroll      | Absolute Memory Physical | 57411 kB   | 64997 kB   |
| Turbo Image        | Scroll      | Frame Rate               | 85 fps     | 86 fps     |
