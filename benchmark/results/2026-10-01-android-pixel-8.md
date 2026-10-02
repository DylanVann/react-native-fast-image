# Android, Pixel 8, 2026-10-01

Firebase Test Lab (`model=shiba,version=35`, Android 15), with the images served on the phone (40 ms latency, 50 Mbps shared). The benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release, 5 runs per scenario: FastImage 8.27.0, React Native Image (React Native 0.86.3), expo-image 57.0.5, Nitro Image 0.15.2, Turbo Image 1.24.3.

Times in ms from the images being mounted, from screen recordings (median / p90 over all runs). Network: the median download rate of 4 large photos fetched with `fetch` (not through the subject) just before the images mount and just after they load. Android: images served on the phone (40 ms latency, 50 Mbps).

| Platform | Subject            | Scenario | Runs | First image | All visible images | Per image   | Load event after pixels | Images not shown (load errors) | Network Mbps (before / after) | Failures |
| -------- | ------------------ | -------- | ---- | ----------- | ------------------ | ----------- | ----------------------- | ------------------------------ | ----------------------------- | -------- |
| android  | React Native Image | grid     | 5    | 282 / 283   | 649 / 681          | 448 / 614   | 31                      |                                | 40 / 42                       |          |
| android  | React Native Image | large    | 5    | 750 / 781   | – / –              | 1429 / 3588 | -91                     | 20 (14)                        | 40 / 43                       |          |
| android  | FastImage          | grid     | 5    | 147 / 166   | 532 / 615          | 330 / 464   | 167                     |                                | 39 / 42                       |          |
| android  | FastImage          | large    | 5    | 1368 / 1634 | 4665 / 4697        | 3033 / 4633 | 102                     |                                | 40 / 41                       |          |
| android  | expo-image         | grid     | 5    | 146 / 151   | 480 / 498          | 330 / 449   | 164                     |                                | 40 / 41                       |          |
| android  | expo-image         | large    | 5    | 1633 / 1683 | 4678 / 4712        | 3081 / 4646 | 99                      |                                | 40 / 42                       |          |
| android  | Nitro Image        | grid     | 5    | 197 / 201   | 750 / 767          | 466 / 733   | –                       |                                | 40 / 42                       |          |
| android  | Nitro Image        | large    | 5    | 1533 / 1566 | 4797 / 4816        | 2984 / 4730 | –                       |                                | 40 / 42                       |          |
| android  | Turbo Image        | grid     | 5    | 183 / 218   | 533 / 599          | 348 / 482   | 198                     |                                | 40 / 42                       |          |
| android  | Turbo Image        | large    | 5    | 1662 / 1865 | 4792 / 4872        | 2895 / 4757 | 116                     |                                | 40 / 41                       |          |

Android Macrobenchmark metrics (median, or p50 / p90 for sampled metrics):

| Subject            | Test        | Metric               | Value       |
| ------------------ | ----------- | -------------------- | ----------- |
| Nitro Image        | largeMemory | memoryHeapSizeLastKb | 20242       |
| Nitro Image        | largeMemory | memoryRssAnonLastKb  | 93680       |
| Nitro Image        | largeMemory | memoryRssFileLastKb  | 214060      |
| Nitro Image        | scroll      | frameCount           | 1080        |
| Nitro Image        | scroll      | frameDurationCpuMs   | 4.3 / 9.4   |
| Nitro Image        | scroll      | frameOverrunMs       | -8.2 / -3.7 |
| FastImage          | largeMemory | memoryHeapSizeLastKb | 40417       |
| FastImage          | largeMemory | memoryRssAnonLastKb  | 120468      |
| FastImage          | largeMemory | memoryRssFileLastKb  | 205248      |
| FastImage          | scroll      | frameCount           | 1015        |
| FastImage          | scroll      | frameDurationCpuMs   | 4.1 / 8.3   |
| FastImage          | scroll      | frameOverrunMs       | -9.3 / -5.5 |
| React Native Image | largeMemory | memoryHeapSizeLastKb | 22738       |
| React Native Image | largeMemory | memoryRssAnonLastKb  | 281516      |
| React Native Image | largeMemory | memoryRssFileLastKb  | 793616      |
| React Native Image | scroll      | frameCount           | 1068        |
| React Native Image | scroll      | frameDurationCpuMs   | 4.7 / 9.5   |
| React Native Image | scroll      | frameOverrunMs       | -8.8 / -4.5 |
| expo-image         | largeMemory | memoryHeapSizeLastKb | 42640       |
| expo-image         | largeMemory | memoryRssAnonLastKb  | 122912      |
| expo-image         | largeMemory | memoryRssFileLastKb  | 191472      |
| expo-image         | scroll      | frameCount           | 1047        |
| expo-image         | scroll      | frameDurationCpuMs   | 5.6 / 9.7   |
| expo-image         | scroll      | frameOverrunMs       | -8.5 / -4.1 |
| Turbo Image        | largeMemory | memoryHeapSizeLastKb | 18121       |
| Turbo Image        | largeMemory | memoryRssAnonLastKb  | 88972       |
| Turbo Image        | largeMemory | memoryRssFileLastKb  | 210408      |
| Turbo Image        | scroll      | frameCount           | 1060        |
| Turbo Image        | scroll      | frameDurationCpuMs   | 5.8 / 12.4  |
| Turbo Image        | scroll      | frameOverrunMs       | -7.7 / -0.8 |
