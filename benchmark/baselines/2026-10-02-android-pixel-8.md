# Android, Pixel 8, 2026-10-02

Firebase Test Lab (`model=shiba,version=35`, Android 15), with the images served on the phone (40 ms latency, 50 Mbps shared). The benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release, 5 runs per scenario: FastImage 8.27.4 with `downsample` on by default on iOS (#1218, a local build), React Native Image (React Native 0.86.3), expo-image 57.0.5, Nitro Image 0.15.2, Turbo Image 1.24.3 (Android unchanged since 8.27.0).

Times in ms from the images being mounted, from screen recordings (median / p90 over all runs). Network: the median download rate of 4 large photos fetched with `fetch` (not through the subject) just before the images mount and just after they load. Android: images served on the phone (40 ms latency, 50 Mbps).

| Platform | Subject            | Scenario | Runs | First image | All visible images | Per image   | Load event after pixels | Images not shown (load errors) | Network Mbps (before / after) | Failures |
| -------- | ------------------ | -------- | ---- | ----------- | ------------------ | ----------- | ----------------------- | ------------------------------ | ----------------------------- | -------- |
| android  | React Native Image | grid     | 5    | 265 / 283   | 648 / 667          | 449 / 599   | 30                      |                                | 40 / 42                       |          |
| android  | React Native Image | large    | 5    | 731 / 766   | – / –              | 1678 / 3558 | -52                     | 20 (15)                        | 40 / 42                       |          |
| android  | FastImage          | grid     | 5    | 148 / 152   | 548 / 698          | 332 / 465   | 187                     |                                | 40 / 42                       |          |
| android  | FastImage          | large    | 5    | 1381 / 1614 | 4659 / 4678        | 3162 / 4639 | 115                     |                                | 40 / 41                       |          |
| android  | expo-image         | grid     | 5    | 147 / 182   | 462 / 498          | 329 / 434   | 152                     |                                | 40 / 42                       |          |
| android  | expo-image         | large    | 5    | 1432 / 1682 | 4679 / 4715        | 2982 / 4665 | 102                     |                                | 40 / 42                       |          |
| android  | Nitro Image        | grid     | 5    | 184 / 200   | 751 / 766          | 450 / 714   | –                       |                                | 40 / 41                       |          |
| android  | Nitro Image        | large    | 5    | 1551 / 1966 | 4814 / 4817        | 2938 / 4746 | –                       |                                | 39 / 41                       |          |
| android  | Turbo Image        | grid     | 5    | 183 / 200   | 516 / 582          | 349 / 465   | 198                     |                                | 40 / 42                       |          |
| android  | Turbo Image        | large    | 5    | 1614 / 1863 | 4839 / 4954        | 2909 / 4771 | 98                      |                                | 40 / 42                       |          |

Android Macrobenchmark metrics (median, or p50 / p90 for sampled metrics):

| Subject            | Test        | Metric               | Value       |
| ------------------ | ----------- | -------------------- | ----------- |
| Nitro Image        | largeMemory | memoryHeapSizeLastKb | 20074       |
| Nitro Image        | largeMemory | memoryRssAnonLastKb  | 92328       |
| Nitro Image        | largeMemory | memoryRssFileLastKb  | 212920      |
| Nitro Image        | scroll      | frameCount           | 1036        |
| Nitro Image        | scroll      | frameDurationCpuMs   | 5.0 / 10.5  |
| Nitro Image        | scroll      | frameOverrunMs       | -8.1 / -2.9 |
| FastImage          | largeMemory | memoryHeapSizeLastKb | 40293       |
| FastImage          | largeMemory | memoryRssAnonLastKb  | 121308      |
| FastImage          | largeMemory | memoryRssFileLastKb  | 205128      |
| FastImage          | scroll      | frameCount           | 1047        |
| FastImage          | scroll      | frameDurationCpuMs   | 4.2 / 9.0   |
| FastImage          | scroll      | frameOverrunMs       | -9.0 / -4.9 |
| React Native Image | largeMemory | memoryHeapSizeLastKb | 22770       |
| React Native Image | largeMemory | memoryRssAnonLastKb  | 280356      |
| React Native Image | largeMemory | memoryRssFileLastKb  | 782172      |
| React Native Image | scroll      | frameCount           | 1063        |
| React Native Image | scroll      | frameDurationCpuMs   | 4.7 / 9.0   |
| React Native Image | scroll      | frameOverrunMs       | -8.6 / -4.8 |
| expo-image         | largeMemory | memoryHeapSizeLastKb | 43012       |
| expo-image         | largeMemory | memoryRssAnonLastKb  | 117896      |
| expo-image         | largeMemory | memoryRssFileLastKb  | 188404      |
| expo-image         | scroll      | frameCount           | 1060        |
| expo-image         | scroll      | frameDurationCpuMs   | 5.4 / 9.7   |
| expo-image         | scroll      | frameOverrunMs       | -8.5 / -4.3 |
| Turbo Image        | largeMemory | memoryHeapSizeLastKb | 18129       |
| Turbo Image        | largeMemory | memoryRssAnonLastKb  | 90792       |
| Turbo Image        | largeMemory | memoryRssFileLastKb  | 214232      |
| Turbo Image        | scroll      | frameCount           | 1054        |
| Turbo Image        | scroll      | frameDurationCpuMs   | 6.0 / 13.3  |
| Turbo Image        | scroll      | frameOverrunMs       | -7.4 / 0.3  |
