# Android, Pixel 8, 2026-10-02

Firebase Test Lab (`model=shiba,version=35`, Android 15). The benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release, 5 runs per scenario: FastImage 8.28.0, React Native Image (React Native 0.86.3), expo-image 57.0.5, Nitro Image 0.15.2, Turbo Image 1.24.3. Images served on the phone by the Macrobenchmark test, with 40 ms latency and no bandwidth limit; frames timed by the clock the app draws.

**Each subject ran on its own Test Lab phone, and the phones differ:** between two rounds, subjects' times moved by up to 450 ms, in both directions, which the benchmark's changes between them don't explain (FastImage grid 596 → 748 ms, Turbo Image large 932 → 1380 ms, Nitro Image grid 832 → 764 ms), and the network probe (the same for every subject) measured 87–144 Mbps depending on the phone. Compare subjects only by large differences; see Limits in ../README.md.

Times in ms from the start of the run (the frame its clock starts in, as the app renders the subject's views), from screen recordings, timed by the clock the app draws in each frame: median / p90 over the runs (with 5 runs, p90 is the slowest). All visible images: over the runs that showed every one; the others are counted in the next columns. Frame window: how long before an image's first frame the last earlier one was drawn (median / max): the image showed within that time. Network: the median download rate of 4 large photos fetched with `fetch` (not through the subject) once the images have loaded. Images served on the phone (40 ms latency, unlimited Mbps).

| Platform | Subject            | Scenario | Runs | First image | All visible images | Per image  | Frame window | Load event after pixels | Images not shown (load errors) | Network Mbps | Failures |
| -------- | ------------------ | -------- | ---- | ----------- | ------------------ | ---------- | ------------ | ----------------------- | ------------------------------ | ------------ | -------- |
| android  | React Native Image | grid     | 5    | 216 / 232   | 496 / 680          | 332 / 464  | 16 / 20      | 17                      |                                | 131          |          |
| android  | React Native Image | large    | 5    | 180 / 232   | – / –              | 296 / 416  | 16 / 36      | 17                      | 20 (20)                        | 139          |          |
| android  | FastImage          | grid     | 5    | 216 / 280   | 748 / 832          | 380 / 516  | 16 / 20      | 16                      |                                | 138          |          |
| android  | FastImage          | large    | 5    | 216 / 248   | 448 / 480          | 348 / 432  | 16 / 20      | 16                      |                                | 144          |          |
| android  | expo-image         | grid     | 5    | 232 / 248   | 564 / 780          | 396 / 516  | 16 / 20      | 17                      |                                | 130          |          |
| android  | expo-image         | large    | 5    | 232 / 248   | 464 / 480          | 348 / 448  | 16 / 20      | 16                      |                                | 142          |          |
| android  | Nitro Image        | grid     | 5    | 232 / 280   | 764 / 816          | 416 / 716  | 16 / 20      | –                       |                                | 87           |          |
| android  | Nitro Image        | large    | 5    | 280 / 316   | 780 / 816          | 516 / 748  | 16 / 20      | –                       |                                | 95           |          |
| android  | Turbo Image        | grid     | 5    | 280 / 280   | 580 / 596          | 416 / 548  | 16 / 20      | 16                      |                                | 118          |          |
| android  | Turbo Image        | large    | 5    | 416 / 464   | 1380 / 1416        | 832 / 1296 | 16 / 20      | 17                      |                                | 93           |          |

Android Macrobenchmark metrics (median, or p50 / p90 for sampled metrics):

| Subject            | Test        | Metric               | Value       |
| ------------------ | ----------- | -------------------- | ----------- |
| Nitro Image        | largeMemory | memoryHeapSizeLastKb | 22655       |
| Nitro Image        | largeMemory | memoryRssAnonLastKb  | 96252       |
| Nitro Image        | largeMemory | memoryRssFileLastKb  | 217956      |
| Nitro Image        | scroll      | frameCount           | 1065        |
| Nitro Image        | scroll      | frameDurationCpuMs   | 4.9 / 9.1   |
| Nitro Image        | scroll      | frameOverrunMs       | -7.7 / -3.2 |
| FastImage          | largeMemory | memoryHeapSizeLastKb | 9326        |
| FastImage          | largeMemory | memoryRssAnonLastKb  | 89408       |
| FastImage          | largeMemory | memoryRssFileLastKb  | 176464      |
| FastImage          | scroll      | frameCount           | 1088        |
| FastImage          | scroll      | frameDurationCpuMs   | 4.6 / 8.9   |
| FastImage          | scroll      | frameOverrunMs       | -8.6 / -4.1 |
| React Native Image | largeMemory | memoryHeapSizeLastKb | 8942        |
| React Native Image | largeMemory | memoryRssAnonLastKb  | 271448      |
| React Native Image | largeMemory | memoryRssFileLastKb  | 953564      |
| React Native Image | scroll      | frameCount           | 1086        |
| React Native Image | scroll      | frameDurationCpuMs   | 4.5 / 8.7   |
| React Native Image | scroll      | frameOverrunMs       | -8.6 / -4.3 |
| expo-image         | largeMemory | memoryHeapSizeLastKb | 17608       |
| expo-image         | largeMemory | memoryRssAnonLastKb  | 103616      |
| expo-image         | largeMemory | memoryRssFileLastKb  | 179188      |
| expo-image         | scroll      | frameCount           | 1067        |
| expo-image         | scroll      | frameDurationCpuMs   | 4.6 / 8.7   |
| expo-image         | scroll      | frameOverrunMs       | -8.8 / -4.6 |
| Turbo Image        | largeMemory | memoryHeapSizeLastKb | 22397       |
| Turbo Image        | largeMemory | memoryRssAnonLastKb  | 97436       |
| Turbo Image        | largeMemory | memoryRssFileLastKb  | 213356      |
| Turbo Image        | scroll      | frameCount           | 1033        |
| Turbo Image        | scroll      | frameDurationCpuMs   | 4.9 / 10.3  |
| Turbo Image        | scroll      | frameOverrunMs       | -7.5 / -2.0 |
