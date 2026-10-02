# iOS, iPhone 15 Pro Max, 2026-10-02

The benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release, 5 runs per scenario: FastImage 8.28.0, React Native Image (React Native 0.86.3), expo-image 57.0.5, Nitro Image 0.15.2, Turbo Image 1.24.3. Images served on the phone by the XCUITest runner, with 40 ms latency and no bandwidth limit; frames timed by the clock the app draws; no other benchmark app running.

Times in ms from the images being mounted, from screen recordings, timed by the clock the app draws in each frame (median / p90 over all runs). Frame window: how long before an image's first frame the previous frame was drawn (median / max): the image showed within that time. Network: the median download rate of 4 large photos fetched with `fetch` (not through the subject) just before the images mount and just after they load. iOS: iPhone 15 Pro Max (iOS 27.0). Images served on the phone (40 ms latency, unlimited Mbps).

| Platform | Subject            | Scenario | Runs | First image | All visible images | Per image | Frame window | Load event after pixels | Images not shown (load errors) | Network Mbps (before / after) | Failures |
| -------- | ------------------ | -------- | ---- | ----------- | ------------------ | --------- | ------------ | ----------------------- | ------------------------------ | ----------------------------- | -------- |
| ios      | React Native Image | grid     | 5    | 116 / 132   | 400 / 400          | 248 / 364 | 16 / 36      | 6                       |                                | 195 / 375                     |          |
| ios      | React Native Image | large    | 5    | 132 / 140   | 332 / 356          | 224 / 324 | 16 / 20      | 5                       |                                | 200 / 341                     |          |
| ios      | FastImage          | grid     | 5    | 148 / 156   | 348 / 356          | 248 / 348 | 16 / 20      | 5                       |                                | 203 / 352                     |          |
| ios      | FastImage          | large    | 5    | 164 / 172   | 348 / 356          | 232 / 316 | 16 / 20      | 8                       |                                | 201 / 354                     |          |
| ios      | expo-image         | grid     | 5    | 132 / 144   | 332 / 344          | 216 / 300 | 16 / 20      | 13                      |                                | 197 / 355                     |          |
| ios      | expo-image         | large    | 5    | 160 / 200   | 492 / 564          | 460 / 508 | 300 / 308    | 42                      |                                | 197 / 348                     |          |
| ios      | Nitro Image        | grid     | 5    | 148 / 156   | 332 / 340          | 232 / 332 | 16 / 20      | –                       |                                | 206 / 333                     |          |
| ios      | Nitro Image        | large    | 5    | 132 / 148   | 300 / 316          | 200 / 280 | 16 / 20      | –                       |                                | 196 / 354                     |          |
| ios      | Turbo Image        | grid     | 5    | 116 / 144   | 312 / 344          | 196 / 296 | 16 / 48      | 12                      |                                | 191 / 367                     |          |
| ios      | Turbo Image        | large    | 5    | 172 / 208   | 540 / 672          | 348 / 532 | 32 / 100     | 4                       |                                | 202 / 359                     |          |

iOS XCTest metrics (median / p90 of the measurements):

| Subject            | Test        | Metric                   | Median     | p90        |
| ------------------ | ----------- | ------------------------ | ---------- | ---------- |
| expo-image         | LargeMemory | Absolute Memory Physical | 408013 kB  | 420121 kB  |
| expo-image         | LargeMemory | Memory Peak Physical     | 509479 kB  | 524847 kB  |
| expo-image         | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| expo-image         | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| expo-image         | Scroll      | Absolute Memory Physical | 68110 kB   | 76040 kB   |
| expo-image         | Scroll      | Memory Peak Physical     | 68602 kB   | 76548 kB   |
| expo-image         | Scroll      | Frame Rate               | 85 fps     | 86 fps     |
| FastImage          | LargeMemory | Absolute Memory Physical | 51284 kB   | 52562 kB   |
| FastImage          | LargeMemory | Memory Peak Physical     | 75696 kB   | 81037 kB   |
| FastImage          | Scroll      | Frame Rate               | 86 fps     | 86 fps     |
| FastImage          | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| FastImage          | Scroll      | Absolute Memory Physical | 68012 kB   | 75073 kB   |
| FastImage          | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| FastImage          | Scroll      | Memory Peak Physical     | 68077 kB   | 75188 kB   |
| React Native Image | LargeMemory | Memory Peak Physical     | 69355 kB   | 71829 kB   |
| React Native Image | LargeMemory | Absolute Memory Physical | 46450 kB   | 48269 kB   |
| React Native Image | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| React Native Image | Scroll      | Memory Peak Physical     | 68602 kB   | 75237 kB   |
| React Native Image | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| React Native Image | Scroll      | Frame Rate               | 85 fps     | 85 fps     |
| React Native Image | Scroll      | Absolute Memory Physical | 68290 kB   | 74828 kB   |
| Nitro Image        | LargeMemory | Absolute Memory Physical | 407652 kB  | 409340 kB  |
| Nitro Image        | LargeMemory | Memory Peak Physical     | 436160 kB  | 436685 kB  |
| Nitro Image        | Scroll      | Memory Peak Physical     | 63523 kB   | 69290 kB   |
| Nitro Image        | Scroll      | Number of Hitches        | 0 hitches  | 0 hitches  |
| Nitro Image        | Scroll      | Hitch Time Ratio         | 0 ms per s | 0 ms per s |
| Nitro Image        | Scroll      | Absolute Memory Physical | 63441 kB   | 69257 kB   |
| Nitro Image        | Scroll      | Frame Rate               | 85 fps     | 86 fps     |
| Turbo Image        | LargeMemory | Memory Peak Physical     | 263031 kB  | 275368 kB  |
| Turbo Image        | LargeMemory | Absolute Memory Physical | 58198 kB   | 60476 kB   |
| Turbo Image        | Scroll      | Number of Hitches        | 0 hitches  | 1 hitches  |
| Turbo Image        | Scroll      | Memory Peak Physical     | 59164 kB   | 65964 kB   |
| Turbo Image        | Scroll      | Hitch Time Ratio         | 0 ms per s | 7 ms per s |
| Turbo Image        | Scroll      | Absolute Memory Physical | 59050 kB   | 65898 kB   |
| Turbo Image        | Scroll      | Frame Rate               | 86 fps     | 87 fps     |
