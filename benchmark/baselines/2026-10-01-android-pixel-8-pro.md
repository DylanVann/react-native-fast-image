# Android, Pixel 8 Pro, 2026-10-01

Firebase Test Lab (`model=husky,version=35`, Android 15). The benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release, 5 runs per scenario: FastImage 8.27.0, React Native Image (React Native 0.86.3), expo-image 57.0.5, Nitro Image 0.15.2, Turbo Image 1.24.3.

Times in ms from the images being mounted, from screen recordings (median / p90 over all runs).

| Platform | Subject            | Scenario | Runs | First image | All visible images | Per image    | Load event after pixels | Images not shown (load errors) | Failures |
| -------- | ------------------ | -------- | ---- | ----------- | ------------------ | ------------ | ----------------------- | ------------------------------ | -------- |
| android  | React Native Image | grid     | 5    | 375 / 387   | 917 / 1065         | 608 / 859    | 34                      |                                |          |
| android  | React Native Image | large    | 5    | 1267 / 1623 | – / –              | 2359 / 5313  | -37                     | 20 (14)                        |          |
| android  | FastImage          | grid     | 5    | 281 / 355   | 1241 / 1578        | 745 / 1112   | 189                     |                                |          |
| android  | FastImage          | large    | 5    | 4963 / 7535 | 13053 / 17345      | 8911 / 16177 | 121                     |                                |          |
| android  | expo-image         | grid     | 5    | 217 / 261   | 724 / 842          | 441 / 672    | 210                     |                                |          |
| android  | expo-image         | large    | 5    | 2088 / 3712 | 7921 / 8217        | 5242 / 8078  | 137                     |                                |          |
| android  | Nitro Image        | grid     | 5    | 289 / 376   | 1341 / 1595        | 766 / 1320   | –                       |                                |          |
| android  | Nitro Image        | large    | 5    | 2308 / 2761 | 6907 / 8197        | 4255 / 7528  | –                       |                                |          |
| android  | Turbo Image        | grid     | 5    | 251 / 277   | 850 / 1196         | 534 / 837    | 221                     |                                |          |
| android  | Turbo Image        | large    | 5    | 4247 / 4494 | 10398 / 12125      | 6873 / 10731 | 132                     |                                |          |

Android Macrobenchmark metrics (median, or p50 / p90 for sampled metrics):

| Subject            | Test        | Metric               | Value        |
| ------------------ | ----------- | -------------------- | ------------ |
| Nitro Image        | largeMemory | memoryHeapSizeLastKb | 34838        |
| Nitro Image        | largeMemory | memoryRssAnonLastKb  | 115432       |
| Nitro Image        | largeMemory | memoryRssFileLastKb  | 228336       |
| Nitro Image        | scroll      | frameCount           | 1814         |
| Nitro Image        | scroll      | frameDurationCpuMs   | 3.8 / 7.3    |
| Nitro Image        | scroll      | frameOverrunMs       | -10.7 / -6.3 |
| FastImage          | largeMemory | memoryHeapSizeLastKb | 75827        |
| FastImage          | largeMemory | memoryRssAnonLastKb  | 159288       |
| FastImage          | largeMemory | memoryRssFileLastKb  | 206212       |
| FastImage          | scroll      | frameCount           | 2027         |
| FastImage          | scroll      | frameDurationCpuMs   | 3.7 / 6.7    |
| FastImage          | scroll      | frameOverrunMs       | -11.4 / -6.7 |
| React Native Image | largeMemory | memoryHeapSizeLastKb | 79484        |
| React Native Image | largeMemory | memoryRssAnonLastKb  | 341952       |
| React Native Image | largeMemory | memoryRssFileLastKb  | 584084       |
| React Native Image | scroll      | frameCount           | 2016         |
| React Native Image | scroll      | frameDurationCpuMs   | 3.6 / 6.5    |
| React Native Image | scroll      | frameOverrunMs       | -11.4 / -6.8 |
| expo-image         | largeMemory | memoryHeapSizeLastKb | 89456        |
| expo-image         | largeMemory | memoryRssAnonLastKb  | 169204       |
| expo-image         | largeMemory | memoryRssFileLastKb  | 203528       |
| expo-image         | scroll      | frameCount           | 2016         |
| expo-image         | scroll      | frameDurationCpuMs   | 4.0 / 7.8    |
| expo-image         | scroll      | frameOverrunMs       | -10.9 / -6.5 |
| Turbo Image        | largeMemory | memoryHeapSizeLastKb | 34337        |
| Turbo Image        | largeMemory | memoryRssAnonLastKb  | 114932       |
| Turbo Image        | largeMemory | memoryRssFileLastKb  | 223804       |
| Turbo Image        | scroll      | frameCount           | 1932         |
| Turbo Image        | scroll      | frameDurationCpuMs   | 4.0 / 7.7    |
| Turbo Image        | scroll      | frameOverrunMs       | -10.4 / -6.0 |
