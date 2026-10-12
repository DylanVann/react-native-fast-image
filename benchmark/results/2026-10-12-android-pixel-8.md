# Android, Pixel 8, 2026-10-12

The reference runs (see ../README.md, Reference runs) on Firebase Test Lab (`model=shiba,version=35`, Android 15): the benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release. FastImage 10 (FastImage (this checkout): the 10.0 stack's top, on 9.3.4), React Native Image (React Native 0.86.3), expo-image 57.0.5, Nitro Image 0.15.2, Turbo Image 1.24.3, each with its defaults and without fades (but in the burst test's fade variants). Images served on the phone with 40 ms latency and no bandwidth limit.

- Time to image: 4 phones, each running every library in turns (in the other order each iteration), 5 runs each.
- Memory (the large photos) and the burst test: 2 phones each, every library on each, one phone in each order; 5 runs, and 10 for the burst test.
- Scrolling: each library on its own phone, 5 runs.

## Time to image

`detail`: the grid's 60 photos, and 100 ms later the last of them, the one whose download the grid asked for last, at the screen's width over the grid, which goes on loading under it; with `priority="high"` for FastImage and expo-image (the others have no priority). Only that photo is timed: its first image is its last.

Times in ms from the start of the run (the frame its clock starts in, as the app renders the subject's views), from screen recordings, timed by the clock the app draws in each frame: median / p90 over the runs (with 5 runs, p90 is the slowest). All visible images: over the runs that showed every one; the others are counted in the next columns. Frame window: how long before an image's first frame the last earlier one was drawn (median / max): the image showed within that time. Image requests: how many the image server got (median). Network: the median download rate of 4 large photos fetched with `fetch` (not through the subject) once the images have loaded. Images served on the phone (40 ms latency, unlimited Mbps).

| Platform | Subject                   | Scenario | Runs | First image | All visible images  | Per image | Frame window | Load event after pixels | Images not shown (load errors) | Image requests | Network Mbps | Failures |
| -------- | ------------------------- | -------- | ---- | ----------- | ------------------- | --------- | ------------ | ----------------------- | ------------------------------ | -------------- | ------------ | -------- |
| android  | React Native Image        | detail   | 20   | 764 / 780   | 764 / 780           | 764 / 780 | 16 / 20      | 17                      |                                | 60             | 126          |          |
| android  | React Native Image        | grid     | 20   | 216 / 248   | 516 / 580           | 364 / 496 | 16 / 20      | 17                      |                                | 60             | 125          |          |
| android  | React Native Image        | large    | 20   | 216 / 296   | – / –               | 316 / 464 | 16 / 84      | 19                      | 80 (80)                        | 20             | 125          |          |
| android  | React Native Image        | sizes    | 20   | 196 / 216   | 348 / 364           | 248 / 316 | 16 / 20      | 18                      |                                | 16             | 122          |          |
| android  | FastImage (this checkout) | detail   | 20   | 280 / 316   | 280 / 316           | 280 / 316 | 16 / 20      | 17                      |                                | 60             | 125          |          |
| android  | FastImage (this checkout) | grid     | 20   | 216 / 232   | 548 / 616           | 348 / 480 | 16 / 20      | 17                      |                                | 60             | 124          |          |
| android  | FastImage (this checkout) | large    | 20   | 216 / 248   | 480 / 580           | 364 / 464 | 16 / 20      | 17                      |                                | 20             | 125          |          |
| android  | FastImage (this checkout) | sizes    | 20   | 196 / 232   | 348 / 380           | 264 / 332 | 16 / 20      | 17                      |                                | 16             | 126          |          |
| android  | expo-image                | detail   | 20   | 748 / 816   | 748 / 816           | 748 / 816 | 16 / 20      | 17                      |                                | 61             | 132          |          |
| android  | expo-image                | grid     | 20   | 232 / 248   | 548 / 616           | 396 / 516 | 16 / 20      | 16                      |                                | 60             | 130          |          |
| android  | expo-image                | large    | 20   | 232 / 280   | 480 / 516           | 364 / 480 | 16 / 20      | 17                      |                                | 20             | 130          |          |
| android  | expo-image                | sizes    | 20   | 196 / 232   | 516 / 548 (19 runs) | 364 / 480 | 16 / 20      | 17                      | 1 (1)                          | 32             | 125          |          |
| android  | Nitro Image               | detail   | 20   | 832 / 880   | 832 / 880           | 832 / 880 | 16 / 16      | –                       |                                | 61             | 94           |          |
| android  | Nitro Image               | grid     | 20   | 264 / 296   | 796 / 832           | 480 / 748 | 16 / 20      | –                       |                                | 60             | 91           |          |
| android  | Nitro Image               | large    | 20   | 348 / 380   | 848 / 1080          | 616 / 880 | 16 / 36      | –                       |                                | 20             | 105          |          |
| android  | Nitro Image               | sizes    | 20   | 264 / 316   | 564 / 632           | 432 / 548 | 16 / 20      | –                       |                                | 32             | 91           |          |
| android  | Turbo Image               | detail   | 20   | 832 / 864   | 832 / 864           | 832 / 864 | 16 / 20      | 13                      |                                | 61             | 116          |          |
| android  | Turbo Image               | grid     | 20   | 264 / 296   | 648 / 796           | 432 / 580 | 16 / 20      | 16                      |                                | 60             | 123          |          |
| android  | Turbo Image               | large    | 20   | 348 / 480   | 864 / 1364          | 616 / 896 | 16 / 20      | 16                      |                                | 20             | 107          |          |
| android  | Turbo Image               | sizes    | 20   | 248 / 296   | 564 / 596           | 432 / 548 | 16 / 20      | 17                      |                                | 32             | 119          |          |

Paired on each phone, against React Native Image (ms; negative is faster): median difference, and the middle half of the differences, for time to the first and to the last image; how many runs were faster; image requests (median, each subject):

| Subject                   | Scenario | Pairs | First               | All                 | Faster (all) | Requests                    |
| ------------------------- | -------- | ----- | ------------------- | ------------------- | ------------ | --------------------------- |
| FastImage (this checkout) | sizes    | 20    | 0 (-16 to 16)       | 0 (-16 to 16)       | 5 of 20      | 16 (React Native Image: 16) |
| FastImage (this checkout) | detail   | 20    | -468 (-500 to -452) | -468 (-500 to -452) | 18 of 20     | 60 (React Native Image: 60) |
| FastImage (this checkout) | large    | 20    | 0 (-20 to 20)       | –                   | –            | 20 (React Native Image: 20) |
| FastImage (this checkout) | grid     | 20    | -16 (-20 to 16)     | 16 (-16 to 64)      | 6 of 20      | 60 (React Native Image: 60) |
| expo-image                | sizes    | 20    | 0 (-20 to 32)       | 168 (148 to 200)    | 0 of 19      | 32 (React Native Image: 16) |
| expo-image                | detail   | 20    | -16 (-384 to 32)    | -16 (-384 to 32)    | 11 of 20     | 61 (React Native Image: 60) |
| expo-image                | large    | 20    | 16 (0 to 48)        | –                   | –            | 20 (React Native Image: 20) |
| expo-image                | grid     | 20    | 0 (-16 to 20)       | 0 (-20 to 36)       | 7 of 20      | 60 (React Native Image: 60) |
| Nitro Image               | sizes    | 20    | 52 (32 to 84)       | 216 (184 to 248)    | 0 of 20      | 32 (React Native Image: 16) |
| Nitro Image               | detail   | 20    | 68 (-200 to 100)    | 68 (-200 to 100)    | 7 of 20      | 61 (React Native Image: 60) |
| Nitro Image               | large    | 20    | 132 (100 to 148)    | –                   | –            | 20 (React Native Image: 20) |
| Nitro Image               | grid     | 20    | 48 (16 to 64)       | 264 (180 to 300)    | 0 of 20      | 60 (React Native Image: 60) |
| Turbo Image               | sizes    | 20    | 68 (32 to 84)       | 232 (200 to 232)    | 0 of 20      | 32 (React Native Image: 16) |
| Turbo Image               | detail   | 20    | 84 (36 to 84)       | 84 (36 to 84)       | 2 of 20      | 61 (React Native Image: 60) |
| Turbo Image               | large    | 20    | 132 (100 to 148)    | –                   | –            | 20 (React Native Image: 20) |
| Turbo Image               | grid     | 20    | 48 (16 to 64)       | 132 (80 to 164)     | 0 of 20      | 60 (React Native Image: 60) |

expo-image's `detail` times: 6 of the 20 runs within 248–416 ms, the others within 532–832 ms.

## Memory

Android Macrobenchmark metrics over every run on the 2 phones (median, or p50 / p90 / p99 of every sample):

| Test                          | Metric               | Value  |
| ----------------------------- | -------------------- | ------ |
| largeMemory[expo-image]       | memoryHeapSizeLastKb | 16596  |
| largeMemory[expo-image]       | memoryRssAnonLastKb  | 101780 |
| largeMemory[expo-image]       | memoryRssFileLastKb  | 175712 |
| largeMemory[fast-image-local] | memoryHeapSizeLastKb | 17140  |
| largeMemory[fast-image-local] | memoryRssAnonLastKb  | 96504  |
| largeMemory[fast-image-local] | memoryRssFileLastKb  | 174532 |
| largeMemory[image]            | memoryHeapSizeLastKb | 9258   |
| largeMemory[image]            | memoryRssAnonLastKb  | 268760 |
| largeMemory[image]            | memoryRssFileLastKb  | 954156 |
| largeMemory[nitro-image]      | memoryHeapSizeLastKb | 23010  |
| largeMemory[nitro-image]      | memoryRssAnonLastKb  | 92368  |
| largeMemory[nitro-image]      | memoryRssFileLastKb  | 212924 |
| largeMemory[turbo-image]      | memoryHeapSizeLastKb | 22921  |
| largeMemory[turbo-image]      | memoryRssAnonLastKb  | 94176  |
| largeMemory[turbo-image]      | memoryRssFileLastKb  | 211488 |

## Scrolling

Android Macrobenchmark metrics (median, or p50 / p90 / p99 for sampled metrics):

| Subject                   | Test                     | Metric             | Value              |
| ------------------------- | ------------------------ | ------------------ | ------------------ |
| Nitro Image               | scroll[nitro-image]      | frameCount         | 1086               |
| Nitro Image               | scroll[nitro-image]      | frameDurationCpuMs | 4.6 / 9.1 / 21.9   |
| Nitro Image               | scroll[nitro-image]      | frameOverrunMs     | -8.0 / -3.3 / 8.9  |
| React Native Image        | scroll[image]            | frameCount         | 1079               |
| React Native Image        | scroll[image]            | frameDurationCpuMs | 4.5 / 8.3 / 11.7   |
| React Native Image        | scroll[image]            | frameOverrunMs     | -8.6 / -4.7 / -0.9 |
| expo-image                | scroll[expo-image]       | frameCount         | 1091               |
| expo-image                | scroll[expo-image]       | frameDurationCpuMs | 5.0 / 9.1 / 14.0   |
| expo-image                | scroll[expo-image]       | frameOverrunMs     | -8.3 / -4.1 / 0.3  |
| FastImage (this checkout) | scroll[fast-image-local] | frameCount         | 1024               |
| FastImage (this checkout) | scroll[fast-image-local] | frameDurationCpuMs | 4.6 / 7.5 / 11.2   |
| FastImage (this checkout) | scroll[fast-image-local] | frameOverrunMs     | -8.7 / -5.7 / -1.4 |
| Turbo Image               | scroll[turbo-image]      | frameCount         | 1061               |
| Turbo Image               | scroll[turbo-image]      | frameDurationCpuMs | 5.3 / 11.1 / 24.7  |
| Turbo Image               | scroll[turbo-image]      | frameOverrunMs     | -7.3 / -1.1 / 12.4 |

Frames past their deadline per scroll pass (median of the 5): FastImage 10 3 (0.3% of 1024), React Native Image 4 (0.4% of 1079), expo-image 12 (1.1% of 1091), Nitro Image 13 (1.2% of 1086), Turbo Image 77 (7.3% of 1061).

## Burst

Android Macrobenchmark metrics over every run on the 2 phones (median, or p50 / p90 / p99 of every sample; allFramesMs: each run's UI thread and RenderThread frame time added up):

| Test                                     | Metric                  | Value               |
| ---------------------------------------- | ----------------------- | ------------------- |
| burst[fade,expo-image]                   | allFramesMs             | 558                 |
| burst[fade,expo-image]                   | frameCount              | 44                  |
| burst[fade,expo-image]                   | memoryGpuMaxKb          | 39652               |
| burst[fade,expo-image]                   | memoryHeapSizeMaxKb     | 39206               |
| burst[fade,expo-image]                   | memoryRssAnonMaxKb      | 130180              |
| burst[fade,expo-image]                   | memoryRssFileMaxKb      | 206904              |
| burst[fade,expo-image]                   | renderThreadFramesCount | 58                  |
| burst[fade,expo-image]                   | renderThreadFramesSumMs | 186                 |
| burst[fade,expo-image]                   | uiThreadFramesCount     | 291                 |
| burst[fade,expo-image]                   | uiThreadFramesSumMs     | 375                 |
| burst[fade,expo-image]                   | frameDurationCpuMs      | 4.8 / 7.1 / 140.0   |
| burst[fade,expo-image]                   | frameOverrunMs          | -9.0 / -5.9 / 126.2 |
| burst[fade,fast-image-local]             | allFramesMs             | 560                 |
| burst[fade,fast-image-local]             | frameCount              | 58                  |
| burst[fade,fast-image-local]             | memoryGpuMaxKb          | 39652               |
| burst[fade,fast-image-local]             | memoryHeapSizeMaxKb     | 36868               |
| burst[fade,fast-image-local]             | memoryRssAnonMaxKb      | 124040              |
| burst[fade,fast-image-local]             | memoryRssFileMaxKb      | 205292              |
| burst[fade,fast-image-local]             | renderThreadFramesCount | 58                  |
| burst[fade,fast-image-local]             | renderThreadFramesSumMs | 212                 |
| burst[fade,fast-image-local]             | uiThreadFramesCount     | 283                 |
| burst[fade,fast-image-local]             | uiThreadFramesSumMs     | 345                 |
| burst[fade,fast-image-local]             | frameDurationCpuMs      | 4.7 / 7.2 / 110.8   |
| burst[fade,fast-image-local]             | frameOverrunMs          | -8.6 / -5.4 / 96.6  |
| burst[fade,image]                        | allFramesMs             | 624                 |
| burst[fade,image]                        | frameCount              | 59                  |
| burst[fade,image]                        | memoryGpuMaxKb          | 39652               |
| burst[fade,image]                        | memoryHeapSizeMaxKb     | 30553               |
| burst[fade,image]                        | memoryRssAnonMaxKb      | 139152              |
| burst[fade,image]                        | memoryRssFileMaxKb      | 244492              |
| burst[fade,image]                        | renderThreadFramesCount | 60                  |
| burst[fade,image]                        | renderThreadFramesSumMs | 226                 |
| burst[fade,image]                        | uiThreadFramesCount     | 293                 |
| burst[fade,image]                        | uiThreadFramesSumMs     | 391                 |
| burst[fade,image]                        | frameDurationCpuMs      | 4.8 / 8.8 / 114.1   |
| burst[fade,image]                        | frameOverrunMs          | -7.6 / -3.2 / 99.1  |
| burst[fade,nitro-image]                  | allFramesMs             | 489                 |
| burst[fade,nitro-image]                  | frameCount              | 24                  |
| burst[fade,nitro-image]                  | memoryGpuMaxKb          | 39652               |
| burst[fade,nitro-image]                  | memoryHeapSizeMaxKb     | 35282               |
| burst[fade,nitro-image]                  | memoryRssAnonMaxKb      | 104156              |
| burst[fade,nitro-image]                  | memoryRssFileMaxKb      | 163264              |
| burst[fade,nitro-image]                  | renderThreadFramesCount | 24                  |
| burst[fade,nitro-image]                  | renderThreadFramesSumMs | 94                  |
| burst[fade,nitro-image]                  | uiThreadFramesCount     | 401                 |
| burst[fade,nitro-image]                  | uiThreadFramesSumMs     | 398                 |
| burst[fade,nitro-image]                  | frameDurationCpuMs      | 4.4 / 7.6 / 161.8   |
| burst[fade,nitro-image]                  | frameOverrunMs          | -9.3 / -5.0 / 147.8 |
| burst[fade,turbo-image]                  | allFramesMs             | 563                 |
| burst[fade,turbo-image]                  | frameCount              | 55                  |
| burst[fade,turbo-image]                  | memoryGpuMaxKb          | 39652               |
| burst[fade,turbo-image]                  | memoryHeapSizeMaxKb     | 38364               |
| burst[fade,turbo-image]                  | memoryRssAnonMaxKb      | 110220              |
| burst[fade,turbo-image]                  | memoryRssFileMaxKb      | 160768              |
| burst[fade,turbo-image]                  | renderThreadFramesCount | 56                  |
| burst[fade,turbo-image]                  | renderThreadFramesSumMs | 215                 |
| burst[fade,turbo-image]                  | uiThreadFramesCount     | 276                 |
| burst[fade,turbo-image]                  | uiThreadFramesSumMs     | 343                 |
| burst[fade,turbo-image]                  | frameDurationCpuMs      | 4.7 / 7.5 / 84.2    |
| burst[fade,turbo-image]                  | frameOverrunMs          | -7.9 / -2.8 / 70.2  |
| burst[fade+placeholder,expo-image]       | allFramesMs             | 622                 |
| burst[fade+placeholder,expo-image]       | frameCount              | 52                  |
| burst[fade+placeholder,expo-image]       | memoryGpuMaxKb          | 39652               |
| burst[fade+placeholder,expo-image]       | memoryHeapSizeMaxKb     | 40783               |
| burst[fade+placeholder,expo-image]       | memoryRssAnonMaxKb      | 133176              |
| burst[fade+placeholder,expo-image]       | memoryRssFileMaxKb      | 205820              |
| burst[fade+placeholder,expo-image]       | renderThreadFramesCount | 65                  |
| burst[fade+placeholder,expo-image]       | renderThreadFramesSumMs | 217                 |
| burst[fade+placeholder,expo-image]       | uiThreadFramesCount     | 311                 |
| burst[fade+placeholder,expo-image]       | uiThreadFramesSumMs     | 400                 |
| burst[fade+placeholder,expo-image]       | frameDurationCpuMs      | 5.0 / 7.4 / 137.1   |
| burst[fade+placeholder,expo-image]       | frameOverrunMs          | -8.7 / -5.0 / 125.1 |
| burst[fade+placeholder,fast-image-local] | allFramesMs             | 581                 |
| burst[fade+placeholder,fast-image-local] | frameCount              | 57                  |
| burst[fade+placeholder,fast-image-local] | memoryGpuMaxKb          | 39652               |
| burst[fade+placeholder,fast-image-local] | memoryHeapSizeMaxKb     | 38108               |
| burst[fade+placeholder,fast-image-local] | memoryRssAnonMaxKb      | 125584              |
| burst[fade+placeholder,fast-image-local] | memoryRssFileMaxKb      | 205512              |
| burst[fade+placeholder,fast-image-local] | renderThreadFramesCount | 58                  |
| burst[fade+placeholder,fast-image-local] | renderThreadFramesSumMs | 218                 |
| burst[fade+placeholder,fast-image-local] | uiThreadFramesCount     | 309                 |
| burst[fade+placeholder,fast-image-local] | uiThreadFramesSumMs     | 355                 |
| burst[fade+placeholder,fast-image-local] | frameDurationCpuMs      | 5.0 / 7.3 / 116.7   |
| burst[fade+placeholder,fast-image-local] | frameOverrunMs          | -8.3 / -5.2 / 101.1 |
| burst[fade+placeholder,image]            | allFramesMs             | 672                 |
| burst[fade+placeholder,image]            | frameCount              | 59                  |
| burst[fade+placeholder,image]            | memoryGpuMaxKb          | 39652               |
| burst[fade+placeholder,image]            | memoryHeapSizeMaxKb     | 31541               |
| burst[fade+placeholder,image]            | memoryRssAnonMaxKb      | 140412              |
| burst[fade+placeholder,image]            | memoryRssFileMaxKb      | 243692              |
| burst[fade+placeholder,image]            | renderThreadFramesCount | 60                  |
| burst[fade+placeholder,image]            | renderThreadFramesSumMs | 240                 |
| burst[fade+placeholder,image]            | uiThreadFramesCount     | 313                 |
| burst[fade+placeholder,image]            | uiThreadFramesSumMs     | 424                 |
| burst[fade+placeholder,image]            | frameDurationCpuMs      | 5.1 / 9.4 / 134.1   |
| burst[fade+placeholder,image]            | frameOverrunMs          | -7.1 / -2.3 / 120.4 |
| burst[fade+placeholder,nitro-image]      | allFramesMs             | 506                 |
| burst[fade+placeholder,nitro-image]      | frameCount              | 24                  |
| burst[fade+placeholder,nitro-image]      | memoryGpuMaxKb          | 39652               |
| burst[fade+placeholder,nitro-image]      | memoryHeapSizeMaxKb     | 38439               |
| burst[fade+placeholder,nitro-image]      | memoryRssAnonMaxKb      | 107824              |
| burst[fade+placeholder,nitro-image]      | memoryRssFileMaxKb      | 162372              |
| burst[fade+placeholder,nitro-image]      | renderThreadFramesCount | 25                  |
| burst[fade+placeholder,nitro-image]      | renderThreadFramesSumMs | 95                  |
| burst[fade+placeholder,nitro-image]      | uiThreadFramesCount     | 436                 |
| burst[fade+placeholder,nitro-image]      | uiThreadFramesSumMs     | 410                 |
| burst[fade+placeholder,nitro-image]      | frameDurationCpuMs      | 4.3 / 7.9 / 152.2   |
| burst[fade+placeholder,nitro-image]      | frameOverrunMs          | -9.4 / -4.6 / 140.0 |
| burst[fade+placeholder,turbo-image]      | allFramesMs             | 557                 |
| burst[fade+placeholder,turbo-image]      | frameCount              | 55                  |
| burst[fade+placeholder,turbo-image]      | memoryGpuMaxKb          | 39652               |
| burst[fade+placeholder,turbo-image]      | memoryHeapSizeMaxKb     | 41528               |
| burst[fade+placeholder,turbo-image]      | memoryRssAnonMaxKb      | 113448              |
| burst[fade+placeholder,turbo-image]      | memoryRssFileMaxKb      | 160120              |
| burst[fade+placeholder,turbo-image]      | renderThreadFramesCount | 56                  |
| burst[fade+placeholder,turbo-image]      | renderThreadFramesSumMs | 205                 |
| burst[fade+placeholder,turbo-image]      | uiThreadFramesCount     | 313                 |
| burst[fade+placeholder,turbo-image]      | uiThreadFramesSumMs     | 349                 |
| burst[fade+placeholder,turbo-image]      | frameDurationCpuMs      | 4.4 / 6.2 / 88.7    |
| burst[fade+placeholder,turbo-image]      | frameOverrunMs          | -8.2 / -4.5 / 76.1  |
| burst[plain,expo-image]                  | allFramesMs             | 446                 |
| burst[plain,expo-image]                  | frameCount              | 32                  |
| burst[plain,expo-image]                  | memoryGpuMaxKb          | 39652               |
| burst[plain,expo-image]                  | memoryHeapSizeMaxKb     | 37830               |
| burst[plain,expo-image]                  | memoryRssAnonMaxKb      | 129100              |
| burst[plain,expo-image]                  | memoryRssFileMaxKb      | 205988              |
| burst[plain,expo-image]                  | renderThreadFramesCount | 33                  |
| burst[plain,expo-image]                  | renderThreadFramesSumMs | 127                 |
| burst[plain,expo-image]                  | uiThreadFramesCount     | 229                 |
| burst[plain,expo-image]                  | uiThreadFramesSumMs     | 323                 |
| burst[plain,expo-image]                  | frameDurationCpuMs      | 4.6 / 7.1 / 149.2   |
| burst[plain,expo-image]                  | frameOverrunMs          | -9.5 / -6.1 / 135.8 |
| burst[plain,fast-image-local]            | allFramesMs             | 390                 |
| burst[plain,fast-image-local]            | frameCount              | 34                  |
| burst[plain,fast-image-local]            | memoryGpuMaxKb          | 39652               |
| burst[plain,fast-image-local]            | memoryHeapSizeMaxKb     | 35504               |
| burst[plain,fast-image-local]            | memoryRssAnonMaxKb      | 122724              |
| burst[plain,fast-image-local]            | memoryRssFileMaxKb      | 206440              |
| burst[plain,fast-image-local]            | renderThreadFramesCount | 35                  |
| burst[plain,fast-image-local]            | renderThreadFramesSumMs | 129                 |
| burst[plain,fast-image-local]            | uiThreadFramesCount     | 230                 |
| burst[plain,fast-image-local]            | uiThreadFramesSumMs     | 266                 |
| burst[plain,fast-image-local]            | frameDurationCpuMs      | 4.3 / 6.8 / 117.8   |
| burst[plain,fast-image-local]            | frameOverrunMs          | -9.7 / -6.7 / 103.3 |
| burst[plain,image]                       | allFramesMs             | 513                 |
| burst[plain,image]                       | frameCount              | 41                  |
| burst[plain,image]                       | memoryGpuMaxKb          | 39652               |
| burst[plain,image]                       | memoryHeapSizeMaxKb     | 29585               |
| burst[plain,image]                       | memoryRssAnonMaxKb      | 138712              |
| burst[plain,image]                       | memoryRssFileMaxKb      | 244616              |
| burst[plain,image]                       | renderThreadFramesCount | 42                  |
| burst[plain,image]                       | renderThreadFramesSumMs | 179                 |
| burst[plain,image]                       | uiThreadFramesCount     | 240                 |
| burst[plain,image]                       | uiThreadFramesSumMs     | 345                 |
| burst[plain,image]                       | frameDurationCpuMs      | 5.0 / 9.1 / 124.2   |
| burst[plain,image]                       | frameOverrunMs          | -7.9 / -3.2 / 108.5 |
| burst[plain,nitro-image]                 | allFramesMs             | 483                 |
| burst[plain,nitro-image]                 | frameCount              | 23                  |
| burst[plain,nitro-image]                 | memoryGpuMaxKb          | 39652               |
| burst[plain,nitro-image]                 | memoryHeapSizeMaxKb     | 31699               |
| burst[plain,nitro-image]                 | memoryRssAnonMaxKb      | 101500              |
| burst[plain,nitro-image]                 | memoryRssFileMaxKb      | 163608              |
| burst[plain,nitro-image]                 | renderThreadFramesCount | 24                  |
| burst[plain,nitro-image]                 | renderThreadFramesSumMs | 94                  |
| burst[plain,nitro-image]                 | uiThreadFramesCount     | 355                 |
| burst[plain,nitro-image]                 | uiThreadFramesSumMs     | 388                 |
| burst[plain,nitro-image]                 | frameDurationCpuMs      | 4.4 / 8.0 / 171.5   |
| burst[plain,nitro-image]                 | frameOverrunMs          | -9.2 / -5.1 / 158.0 |
| burst[plain,turbo-image]                 | allFramesMs             | 386                 |
| burst[plain,turbo-image]                 | frameCount              | 23                  |
| burst[plain,turbo-image]                 | memoryGpuMaxKb          | 39652               |
| burst[plain,turbo-image]                 | memoryHeapSizeMaxKb     | 34888               |
| burst[plain,turbo-image]                 | memoryRssAnonMaxKb      | 106464              |
| burst[plain,turbo-image]                 | memoryRssFileMaxKb      | 161668              |
| burst[plain,turbo-image]                 | renderThreadFramesCount | 24                  |
| burst[plain,turbo-image]                 | renderThreadFramesSumMs | 96                  |
| burst[plain,turbo-image]                 | uiThreadFramesCount     | 210                 |
| burst[plain,turbo-image]                 | uiThreadFramesSumMs     | 291                 |
| burst[plain,turbo-image]                 | frameDurationCpuMs      | 4.4 / 8.0 / 128.9   |
| burst[plain,turbo-image]                 | frameOverrunMs          | -9.3 / -3.9 / 113.0 |

Nitro Image has no fade or placeholder, and sends no load events, so its burst runs last a fixed 3 s: its frame times aren't comparable. Turbo Image's placeholders aren't local images, so its `fade+placeholder` runs are `fade` runs.
