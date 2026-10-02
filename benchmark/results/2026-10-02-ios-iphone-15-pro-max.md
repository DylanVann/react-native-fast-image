# iOS, iPhone 15 Pro Max, 2026-10-02

The benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release, 5 runs per scenario: FastImage 8.27.4 with `downsample` on by default on iOS (#1218, a local build), React Native Image (React Native 0.86.3), expo-image 57.0.5, Nitro Image 0.15.2, Turbo Image 1.24.3. Images from the Cloudflare Worker (the first FastImage `large` run had a slow network, 114–146 Mbps against 233–315 for the others: its 1200 ms is the p90).

Times in ms from the images being mounted, from screen recordings (median / p90 over all runs). Network: the median download rate of 4 large photos fetched with `fetch` (not through the subject) just before the images mount and just after they load. iOS: iPhone 15 Pro Max (iOS 27.0).

| Platform | Subject            | Scenario | Runs | First image | All visible images | Per image | Load event after pixels | Images not shown (load errors) | Network Mbps (before / after) | Failures |
| -------- | ------------------ | -------- | ---- | ----------- | ------------------ | --------- | ----------------------- | ------------------------------ | ----------------------------- | -------- |
| ios      | React Native Image | grid     | 5    | 50 / 67     | 183 / 200          | 117 / 167 | 21                      |                                | 308 / 270                     |          |
| ios      | React Native Image | large    | 5    | 150 / 200   | 600 / 683          | 283 / 550 | 15                      |                                | 321 / 271                     |          |
| ios      | FastImage          | grid     | 5    | 67 / 67     | 200 / 217          | 133 / 167 | 40                      |                                | 366 / 242                     |          |
| ios      | FastImage          | large    | 5    | 183 / 333   | 600 / 1200         | 367 / 650 | 27                      |                                | 274 / 267                     |          |
| ios      | expo-image         | grid     | 5    | 67 / 83     | 200 / 200          | 133 / 183 | 53                      |                                | 327 / 271                     |          |
| ios      | expo-image         | large    | 5    | 200 / 283   | 567 / 650          | 383 / 567 | 109                     |                                | 284 / 256                     |          |
| ios      | Nitro Image        | grid     | 5    | 67 / 100    | 198 / 250          | 148 / 198 | –                       |                                | 287 / 246                     |          |
| ios      | Nitro Image        | large    | 5    | 167 / 183   | 650 / 783          | 350 / 650 | –                       |                                | 225 / 275                     |          |
| ios      | Turbo Image        | grid     | 5    | 33 / 50     | 133 / 167          | 100 / 133 | 39                      |                                | 293 / 213                     |          |
| ios      | Turbo Image        | large    | 5    | 200 / 217   | 667 / 683          | 367 / 617 | 35                      | 4 (0)                          | 235 / 260                     |          |

iOS XCTest metrics (median / p90 of the measurements):

| Subject            | Test        | Metric                   | Median     | p90        |
| ------------------ | ----------- | ------------------------ | ---------- | ---------- |
| expo-image         | LargeMemory | Absolute Memory Physical | 159812 kB  | 176556 kB  |
| expo-image         | LargeMemory | Memory Peak Physical     | 356665 kB  | 373213 kB  |
| expo-image         | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| expo-image         | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| expo-image         | Scroll      | Absolute Memory Physical | 64899 kB   | 75073 kB   |
| expo-image         | Scroll      | Memory Peak Physical     | 69863 kB   | 75860 kB   |
| expo-image         | Scroll      | Frame Rate               | 86 fps     | 87 fps     |
| FastImage          | LargeMemory | Absolute Memory Physical | 84953 kB   | 93571 kB   |
| FastImage          | LargeMemory | Memory Peak Physical     | 103041 kB  | 104647 kB  |
| FastImage          | Scroll      | Frame Rate               | 86 fps     | 86 fps     |
| FastImage          | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| FastImage          | Scroll      | Absolute Memory Physical | 74516 kB   | 74549 kB   |
| FastImage          | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| FastImage          | Scroll      | Memory Peak Physical     | 74598 kB   | 88213 kB   |
| React Native Image | LargeMemory | Memory Peak Physical     | 95603 kB   | 99666 kB   |
| React Native Image | LargeMemory | Absolute Memory Physical | 67439 kB   | 71436 kB   |
| React Native Image | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| React Native Image | Scroll      | Memory Peak Physical     | 75123 kB   | 85363 kB   |
| React Native Image | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| React Native Image | Scroll      | Frame Rate               | 86 fps     | 87 fps     |
| React Native Image | Scroll      | Absolute Memory Physical | 71567 kB   | 74516 kB   |
| Nitro Image        | LargeMemory | Absolute Memory Physical | 425363 kB  | 439290 kB  |
| Nitro Image        | LargeMemory | Memory Peak Physical     | 462997 kB  | 469436 kB  |
| Nitro Image        | Scroll      | Memory Peak Physical     | 77842 kB   | 85133 kB   |
| Nitro Image        | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| Nitro Image        | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| Nitro Image        | Scroll      | Absolute Memory Physical | 77793 kB   | 85018 kB   |
| Nitro Image        | Scroll      | Frame Rate               | 86 fps     | 87 fps     |
| Turbo Image        | LargeMemory | Memory Peak Physical     | 278956 kB  | 297929 kB  |
| Turbo Image        | LargeMemory | Absolute Memory Physical | 51645 kB   | 68979 kB   |
| Turbo Image        | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| Turbo Image        | Scroll      | Memory Peak Physical     | 65522 kB   | 79317 kB   |
| Turbo Image        | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| Turbo Image        | Scroll      | Absolute Memory Physical | 65341 kB   | 76925 kB   |
| Turbo Image        | Scroll      | Frame Rate               | 87 fps     | 87 fps     |
