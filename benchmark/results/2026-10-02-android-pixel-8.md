# Android, Pixel 8, 2026-10-02

Firebase Test Lab (`model=shiba,version=35`, Android 15). The benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release, 5 runs per scenario: FastImage 8.28.0, React Native Image (React Native 0.86.3), expo-image 57.0.5, Nitro Image 0.15.2, Turbo Image 1.24.3. Images served on the phone by the Macrobenchmark test, with 40 ms latency and no bandwidth limit; frames timed by the clock the app draws.

Times in ms from the images being mounted, from screen recordings, timed by the clock the app draws in each frame (median / p90 over all runs). Frame window: how long before an image's first frame the previous frame was drawn (median / max): the image showed within that time. Network: the median download rate of 4 large photos fetched with `fetch` (not through the subject) just before the images mount and just after they load. Images served on the phone (40 ms latency, unlimited Mbps).

| Platform | Subject            | Scenario | Runs | First image | All visible images | Per image | Frame window | Load event after pixels | Images not shown (load errors) | Network Mbps (before / after) | Failures |
| -------- | ------------------ | -------- | ---- | ----------- | ------------------ | --------- | ------------ | ----------------------- | ------------------------------ | ----------------------------- | -------- |
| android  | React Native Image | grid     | 5    | 364 / 396   | 680 / 732          | 532 / 648 | 16 / 20      | -145                    |                                | 121 / 140                     |          |
| android  | React Native Image | large    | 5    | 416 / 448   | – / –              | 532 / 616 | 32 / 64      | -143                    | 20 (20)                        | 122 / 170                     |          |
| android  | FastImage          | grid     | 5    | 248 / 296   | 596 / 632          | 416 / 548 | 16 / 20      | 17                      |                                | 130 / 117                     |          |
| android  | FastImage          | large    | 5    | 248 / 280   | 496 / 516          | 380 / 480 | 16 / 20      | 18                      |                                | 128 / 167                     |          |
| android  | expo-image         | grid     | 5    | 248 / 248   | 564 / 648          | 396 / 516 | 16 / 20      | 19                      |                                | 122 / 148                     |          |
| android  | expo-image         | large    | 5    | 248 / 280   | 496 / 532          | 380 / 480 | 16 / 20      | 20                      |                                | 130 / 153                     |          |
| android  | Nitro Image        | grid     | 5    | 296 / 332   | 832 / 864          | 532 / 780 | 16 / 20      | –                       |                                | 123 / 110                     |          |
| android  | Nitro Image        | large    | 5    | 380 / 396   | 880 / 916          | 616 / 832 | 16 / 20      | –                       |                                | 120 / 112                     |          |
| android  | Turbo Image        | grid     | 5    | 316 / 348   | 648 / 716          | 464 / 596 | 16 / 20      | 17                      |                                | 126 / 122                     |          |
| android  | Turbo Image        | large    | 5    | 364 / 416   | 932 / 996          | 616 / 864 | 16 / 20      | 17                      |                                | 122 / 118                     |          |

Android Macrobenchmark metrics (median, or p50 / p90 for sampled metrics):

| Subject            | Test        | Metric               | Value       |
| ------------------ | ----------- | -------------------- | ----------- |
| Nitro Image        | largeMemory | memoryHeapSizeLastKb | 30042       |
| Nitro Image        | largeMemory | memoryRssAnonLastKb  | 98428       |
| Nitro Image        | largeMemory | memoryRssFileLastKb  | 212360      |
| Nitro Image        | scroll      | frameCount           | 1083        |
| Nitro Image        | scroll      | frameDurationCpuMs   | 4.4 / 10.0  |
| Nitro Image        | scroll      | frameOverrunMs       | -8.2 / -3.4 |
| FastImage          | largeMemory | memoryHeapSizeLastKb | 12291       |
| FastImage          | largeMemory | memoryRssAnonLastKb  | 94848       |
| FastImage          | largeMemory | memoryRssFileLastKb  | 179984      |
| FastImage          | scroll      | frameCount           | 1057        |
| FastImage          | scroll      | frameDurationCpuMs   | 4.1 / 7.9   |
| FastImage          | scroll      | frameOverrunMs       | -9.5 / -6.0 |
| React Native Image | largeMemory | memoryHeapSizeLastKb | 12170       |
| React Native Image | largeMemory | memoryRssAnonLastKb  | 274512      |
| React Native Image | largeMemory | memoryRssFileLastKb  | 952560      |
| React Native Image | scroll      | frameCount           | 1097        |
| React Native Image | scroll      | frameDurationCpuMs   | 4.3 / 8.9   |
| React Native Image | scroll      | frameOverrunMs       | -8.8 / -4.8 |
| expo-image         | largeMemory | memoryHeapSizeLastKb | 19440       |
| expo-image         | largeMemory | memoryRssAnonLastKb  | 106544      |
| expo-image         | largeMemory | memoryRssFileLastKb  | 181364      |
| expo-image         | scroll      | frameCount           | 1068        |
| expo-image         | scroll      | frameDurationCpuMs   | 4.6 / 9.4   |
| expo-image         | scroll      | frameOverrunMs       | -8.8 / -4.6 |
| Turbo Image        | largeMemory | memoryHeapSizeLastKb | 24448       |
| Turbo Image        | largeMemory | memoryRssAnonLastKb  | 99752       |
| Turbo Image        | largeMemory | memoryRssFileLastKb  | 208848      |
| Turbo Image        | scroll      | frameCount           | 1054        |
| Turbo Image        | scroll      | frameDurationCpuMs   | 6.3 / 11.6  |
| Turbo Image        | scroll      | frameOverrunMs       | -7.3 / -1.7 |
