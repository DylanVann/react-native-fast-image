# iOS, iPhone 15 Pro Max, 2026-10-01

The benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release, 5 runs per scenario: FastImage 8.27.0, React Native Image (React Native 0.86.3), expo-image 57.0.5, Nitro Image 0.15.2, Turbo Image 1.24.3.

Times in ms from the images being mounted, from screen recordings (median / p90 over all runs). iOS: iPhone 15 Pro Max (iOS 27.0).

| Platform | Subject            | Scenario | Runs | First image | All visible images | Per image | Load event after pixels | Images not shown (load errors) | Failures |
| -------- | ------------------ | -------- | ---- | ----------- | ------------------ | --------- | ----------------------- | ------------------------------ | -------- |
| ios      | React Native Image | grid     | 5    | 67 / 67     | 200 / 250          | 133 / 200 | 23                      |                                |          |
| ios      | React Native Image | large    | 5    | 167 / 183   | 615 / 784          | 283 / 582 | 13                      |                                |          |
| ios      | FastImage          | grid     | 5    | 50 / 67     | 183 / 217          | 117 / 183 | 24                      |                                |          |
| ios      | FastImage          | large    | 5    | 183 / 217   | 617 / 683          | 317 / 583 | 16                      |                                |          |
| ios      | expo-image         | grid     | 5    | 67 / 67     | 200 / 250          | 133 / 183 | 58                      |                                |          |
| ios      | expo-image         | large    | 5    | 183 / 233   | 583 / 617          | 367 / 533 | 153                     |                                |          |
| ios      | Nitro Image        | grid     | 5    | 67 / 83     | 233 / 283          | 150 / 217 | –                       |                                |          |
| ios      | Nitro Image        | large    | 5    | 167 / 200   | 600 / 800          | 333 / 583 | –                       |                                |          |
| ios      | Turbo Image        | grid     | 5    | 50 / 67     | 167 / 217          | 117 / 167 | 41                      |                                |          |
| ios      | Turbo Image        | large    | 5    | 183 / 217   | 650 / 783          | 350 / 633 | 28                      |                                |          |

iOS XCTest metrics (median / p90 of the measurements):

| Subject            | Test        | Metric                   | Median     | p90        |
| ------------------ | ----------- | ------------------------ | ---------- | ---------- |
| expo-image         | LargeMemory | Absolute Memory Physical | 113445 kB  | 130353 kB  |
| expo-image         | LargeMemory | Memory Peak Physical     | 333646 kB  | 373459 kB  |
| expo-image         | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| expo-image         | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| expo-image         | Scroll      | Absolute Memory Physical | 69421 kB   | 73877 kB   |
| expo-image         | Scroll      | Memory Peak Physical     | 70322 kB   | 83134 kB   |
| expo-image         | Scroll      | Frame Rate               | 86 fps     | 86 fps     |
| FastImage          | LargeMemory | Absolute Memory Physical | 440224 kB  | 450267 kB  |
| FastImage          | LargeMemory | Memory Peak Physical     | 466471 kB  | 468666 kB  |
| FastImage          | Scroll      | Frame Rate               | 85 fps     | 86 fps     |
| FastImage          | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| FastImage          | Scroll      | Absolute Memory Physical | 69486 kB   | 82610 kB   |
| FastImage          | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| FastImage          | Scroll      | Memory Peak Physical     | 78268 kB   | 86149 kB   |
| React Native Image | LargeMemory | Memory Peak Physical     | 95291 kB   | 97651 kB   |
| React Native Image | LargeMemory | Absolute Memory Physical | 64571 kB   | 74647 kB   |
| React Native Image | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| React Native Image | Scroll      | Memory Peak Physical     | 58050 kB   | 74484 kB   |
| React Native Image | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| React Native Image | Scroll      | Frame Rate               | 85 fps     | 87 fps     |
| React Native Image | Scroll      | Absolute Memory Physical | 56576 kB   | 65636 kB   |
| Nitro Image        | LargeMemory | Absolute Memory Physical | 419318 kB  | 419563 kB  |
| Nitro Image        | LargeMemory | Memory Peak Physical     | 466258 kB  | 476285 kB  |
| Nitro Image        | Scroll      | Memory Peak Physical     | 99436 kB   | 109889 kB  |
| Nitro Image        | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| Nitro Image        | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| Nitro Image        | Scroll      | Absolute Memory Physical | 92850 kB   | 105646 kB  |
| Nitro Image        | Scroll      | Frame Rate               | 86 fps     | 86 fps     |
| Turbo Image        | LargeMemory | Memory Peak Physical     | 288148 kB  | 305367 kB  |
| Turbo Image        | LargeMemory | Absolute Memory Physical | 69864 kB   | 72649 kB   |
| Turbo Image        | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| Turbo Image        | Scroll      | Memory Peak Physical     | 61032 kB   | 68864 kB   |
| Turbo Image        | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| Turbo Image        | Scroll      | Absolute Memory Physical | 56494 kB   | 65227 kB   |
| Turbo Image        | Scroll      | Frame Rate               | 85 fps     | 86 fps     |
