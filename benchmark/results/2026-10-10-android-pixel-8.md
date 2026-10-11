# Android, Pixel 8, 2026-10-10

The reference runs (see ../README.md, Reference runs) on Firebase Test Lab (`model=shiba,version=35`, Android 15): the benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release. FastImage 10 (FastImage (this checkout): the 10.0 stack's top), React Native Image (React Native 0.86.3), expo-image 57.0.5, Nitro Image 0.15.2, Turbo Image 1.24.3, each with its defaults and without fades (but in the burst test's fade variants). Images served on the phone with 40 ms latency and no bandwidth limit.

- Time to image: 4 phones, each running every library in turns (in the other order each iteration), 5 runs each.
- Memory (the large photos) and the burst test: 2 phones each, every library on each, one phone in each order; 5 runs, and 10 for the burst test.
- Scrolling: each library on its own phone, 5 runs.

## Time to image

Times in ms from the start of the run (the frame its clock starts in, as the app renders the subject's views), from screen recordings, timed by the clock the app draws in each frame: median / p90 over the runs (with 5 runs, p90 is the slowest). All visible images: over the runs that showed every one; the others are counted in the next columns. Frame window: how long before an image's first frame the last earlier one was drawn (median / max): the image showed within that time. Network: the median download rate of 4 large photos fetched with `fetch` (not through the subject) once the images have loaded. Images served on the phone (40 ms latency, unlimited Mbps).

| Platform | Subject                   | Scenario | Runs | First image | All visible images | Per image | Frame window | Load event after pixels | Images not shown (load errors) | Network Mbps | Failures |
| -------- | ------------------------- | -------- | ---- | ----------- | ------------------ | --------- | ------------ | ----------------------- | ------------------------------ | ------------ | -------- |
| android  | React Native Image        | grid     | 20   | 216 / 232   | 516 / 564          | 348 / 480 | 16 / 20      | 18                      |                                | 107          |          |
| android  | React Native Image        | large    | 20   | 196 / 216   | – / –              | 296 / 416 | 16 / 100     | 18                      | 80 (80)                        | 113          |          |
| android  | React Native Image        | sizes    | 20   | 196 / 216   | 348 / 348          | 248 / 296 | 16 / 20      | 18                      |                                | 106          |          |
| android  | FastImage (this checkout) | grid     | 20   | 216 / 232   | 548 / 664          | 364 / 496 | 16 / 20      | 17                      |                                | 107          |          |
| android  | FastImage (this checkout) | large    | 20   | 216 / 232   | 464 / 496          | 348 / 448 | 16 / 20      | 17                      |                                | 112          |          |
| android  | FastImage (this checkout) | sizes    | 20   | 216 / 216   | 348 / 380          | 280 / 348 | 16 / 20      | 16                      |                                | 113          |          |
| android  | expo-image                | grid     | 20   | 216 / 232   | 548 / 580          | 380 / 516 | 16 / 20      | 17                      |                                | 106          |          |
| android  | expo-image                | large    | 20   | 232 / 264   | 464 / 496          | 348 / 464 | 16 / 20      | 17                      |                                | 114          |          |
| android  | expo-image                | sizes    | 20   | 216 / 248   | 516 / 548          | 380 / 496 | 16 / 20      | 17                      |                                | 104          |          |
| android  | Nitro Image               | grid     | 20   | 264 / 296   | 796 / 832          | 496 / 764 | 16 / 20      | –                       |                                | 79           |          |
| android  | Nitro Image               | large    | 20   | 332 / 364   | 848 / 932          | 580 / 816 | 16 / 20      | –                       |                                | 87           |          |
| android  | Nitro Image               | sizes    | 20   | 248 / 264   | 564 / 580          | 416 / 532 | 16 / 20      | –                       |                                | 84           |          |
| android  | Turbo Image               | grid     | 20   | 264 / 296   | 596 / 764          | 432 / 580 | 16 / 20      | 16                      |                                | 99           |          |
| android  | Turbo Image               | large    | 20   | 332 / 364   | 864 / 916          | 580 / 832 | 16 / 20      | 16                      |                                | 105          |          |
| android  | Turbo Image               | sizes    | 20   | 264 / 280   | 564 / 596          | 416 / 548 | 16 / 20      | 16                      |                                | 100          |          |

Paired on each phone, against React Native Image (ms; negative is faster): median difference, and the middle half of the differences, for time to the first and to the last image; how many runs were faster; image requests (median, each subject):

| Subject                   | Scenario | Pairs | First            | All              | Faster (all) | Requests                    |
| ------------------------- | -------- | ----- | ---------------- | ---------------- | ------------ | --------------------------- |
| FastImage (this checkout) | sizes    | 20    | 20 (-16 to 36)   | 16 (-16 to 32)   | 6 of 20      | 16 (React Native Image: 16) |
| FastImage (this checkout) | large    | 20    | 0 (-20 to 20)    | –                | –            | 20 (React Native Image: 20) |
| FastImage (this checkout) | grid     | 20    | 0 (-16 to 0)     | 16 (-16 to 36)   | 6 of 20      | 60 (React Native Image: 60) |
| expo-image                | sizes    | 20    | 20 (0 to 36)     | 184 (148 to 200) | 0 of 20      | 32 (React Native Image: 16) |
| expo-image                | large    | 20    | 32 (0 to 36)     | –                | –            | 20 (React Native Image: 20) |
| expo-image                | grid     | 20    | 0 (-16 to 20)    | 16 (0 to 32)     | 3 of 20      | 60 (React Native Image: 60) |
| Nitro Image               | sizes    | 20    | 52 (52 to 68)    | 216 (200 to 232) | 0 of 20      | 32 (React Native Image: 16) |
| Nitro Image               | large    | 20    | 132 (100 to 152) | –                | –            | 20 (React Native Image: 20) |
| Nitro Image               | grid     | 20    | 48 (16 to 68)    | 264 (220 to 300) | 1 of 20      | 60 (React Native Image: 60) |
| Turbo Image               | sizes    | 20    | 68 (48 to 84)    | 232 (216 to 232) | 0 of 20      | 32 (React Native Image: 16) |
| Turbo Image               | large    | 20    | 136 (100 to 148) | –                | –            | 20 (React Native Image: 20) |
| Turbo Image               | grid     | 20    | 48 (32 to 68)    | 80 (48 to 132)   | 1 of 20      | 60 (React Native Image: 60) |

## Memory

Android Macrobenchmark metrics over every run on the 2 phones (median, or p50 / p90 / p99 of every sample; allFramesMs: each run's UI thread and RenderThread frame time added up):

| Test                          | Metric               | Value  |
| ----------------------------- | -------------------- | ------ |
| largeMemory[expo-image]       | memoryHeapSizeLastKb | 16492  |
| largeMemory[expo-image]       | memoryRssAnonLastKb  | 101980 |
| largeMemory[expo-image]       | memoryRssFileLastKb  | 178328 |
| largeMemory[fast-image-local] | memoryHeapSizeLastKb | 17488  |
| largeMemory[fast-image-local] | memoryRssAnonLastKb  | 97376  |
| largeMemory[fast-image-local] | memoryRssFileLastKb  | 174804 |
| largeMemory[image]            | memoryHeapSizeLastKb | 9122   |
| largeMemory[image]            | memoryRssAnonLastKb  | 269280 |
| largeMemory[image]            | memoryRssFileLastKb  | 966232 |
| largeMemory[nitro-image]      | memoryHeapSizeLastKb | 22902  |
| largeMemory[nitro-image]      | memoryRssAnonLastKb  | 93100  |
| largeMemory[nitro-image]      | memoryRssFileLastKb  | 213756 |
| largeMemory[turbo-image]      | memoryHeapSizeLastKb | 22717  |
| largeMemory[turbo-image]      | memoryRssAnonLastKb  | 94688  |
| largeMemory[turbo-image]      | memoryRssFileLastKb  | 212028 |

## Scrolling

Android Macrobenchmark metrics (median, or p50 / p90 / p99 for sampled metrics):

| Subject                   | Test                     | Metric             | Value              |
| ------------------------- | ------------------------ | ------------------ | ------------------ |
| Nitro Image               | scroll[nitro-image]      | frameCount         | 1069               |
| Nitro Image               | scroll[nitro-image]      | frameDurationCpuMs | 4.8 / 9.8 / 25.5   |
| Nitro Image               | scroll[nitro-image]      | frameOverrunMs     | -7.9 / -2.4 / 13.0 |
| React Native Image        | scroll[image]            | frameCount         | 1108               |
| React Native Image        | scroll[image]            | frameDurationCpuMs | 4.6 / 8.5 / 12.2   |
| React Native Image        | scroll[image]            | frameOverrunMs     | -8.6 / -4.5 / -0.5 |
| expo-image                | scroll[expo-image]       | frameCount         | 1074               |
| expo-image                | scroll[expo-image]       | frameDurationCpuMs | 4.9 / 9.1 / 14.1   |
| expo-image                | scroll[expo-image]       | frameOverrunMs     | -8.5 / -4.3 / 0.8  |
| FastImage (this checkout) | scroll[fast-image-local] | frameCount         | 1088               |
| FastImage (this checkout) | scroll[fast-image-local] | frameDurationCpuMs | 4.7 / 8.3 / 12.7   |
| FastImage (this checkout) | scroll[fast-image-local] | frameOverrunMs     | -8.6 / -4.6 / -0.0 |
| Turbo Image               | scroll[turbo-image]      | frameCount         | 1032               |
| Turbo Image               | scroll[turbo-image]      | frameDurationCpuMs | 4.8 / 11.2 / 25.9  |
| Turbo Image               | scroll[turbo-image]      | frameOverrunMs     | -8.1 / -1.7 / 13.1 |

Frames past their deadline per scroll pass (median of the 5): FastImage 10 10 (0.9% of 1088), React Native Image 8 (0.7%), expo-image 16 (1.5%), Nitro Image 74 (6.9%), Turbo Image 108 (10.5%).

## Burst

Android Macrobenchmark metrics over every run on the 2 phones (median, or p50 / p90 / p99 of every sample; allFramesMs: each run's UI thread and RenderThread frame time added up):

| Test                                     | Metric                  | Value               |
| ---------------------------------------- | ----------------------- | ------------------- |
| burst[fade,expo-image]                   | allFramesMs             | 567                 |
| burst[fade,expo-image]                   | frameCount              | 44                  |
| burst[fade,expo-image]                   | memoryGpuMaxKb          | 39652               |
| burst[fade,expo-image]                   | memoryHeapSizeMaxKb     | 39106               |
| burst[fade,expo-image]                   | memoryRssAnonMaxKb      | 131056              |
| burst[fade,expo-image]                   | memoryRssFileMaxKb      | 205980              |
| burst[fade,expo-image]                   | renderThreadFramesCount | 57                  |
| burst[fade,expo-image]                   | renderThreadFramesSumMs | 186                 |
| burst[fade,expo-image]                   | uiThreadFramesCount     | 276                 |
| burst[fade,expo-image]                   | uiThreadFramesSumMs     | 390                 |
| burst[fade,expo-image]                   | frameDurationCpuMs      | 5.0 / 7.4 / 139.8   |
| burst[fade,expo-image]                   | frameOverrunMs          | -8.7 / -5.6 / 126.1 |
| burst[fade,fast-image-local]             | allFramesMs             | 560                 |
| burst[fade,fast-image-local]             | frameCount              | 57                  |
| burst[fade,fast-image-local]             | memoryGpuMaxKb          | 39652               |
| burst[fade,fast-image-local]             | memoryHeapSizeMaxKb     | 36692               |
| burst[fade,fast-image-local]             | memoryRssAnonMaxKb      | 125328              |
| burst[fade,fast-image-local]             | memoryRssFileMaxKb      | 205316              |
| burst[fade,fast-image-local]             | renderThreadFramesCount | 58                  |
| burst[fade,fast-image-local]             | renderThreadFramesSumMs | 205                 |
| burst[fade,fast-image-local]             | uiThreadFramesCount     | 255                 |
| burst[fade,fast-image-local]             | uiThreadFramesSumMs     | 343                 |
| burst[fade,fast-image-local]             | frameDurationCpuMs      | 4.6 / 7.0 / 121.1   |
| burst[fade,fast-image-local]             | frameOverrunMs          | -8.9 / -5.6 / 106.1 |
| burst[fade,image]                        | allFramesMs             | 638                 |
| burst[fade,image]                        | frameCount              | 59                  |
| burst[fade,image]                        | memoryGpuMaxKb          | 39652               |
| burst[fade,image]                        | memoryHeapSizeMaxKb     | 30533               |
| burst[fade,image]                        | memoryRssAnonMaxKb      | 140396              |
| burst[fade,image]                        | memoryRssFileMaxKb      | 244784              |
| burst[fade,image]                        | renderThreadFramesCount | 60                  |
| burst[fade,image]                        | renderThreadFramesSumMs | 237                 |
| burst[fade,image]                        | uiThreadFramesCount     | 282                 |
| burst[fade,image]                        | uiThreadFramesSumMs     | 389                 |
| burst[fade,image]                        | frameDurationCpuMs      | 5.0 / 9.1 / 107.1   |
| burst[fade,image]                        | frameOverrunMs          | -7.4 / -2.8 / 94.7  |
| burst[fade,nitro-image]                  | allFramesMs             | 505                 |
| burst[fade,nitro-image]                  | frameCount              | 24                  |
| burst[fade,nitro-image]                  | memoryGpuMaxKb          | 39652               |
| burst[fade,nitro-image]                  | memoryHeapSizeMaxKb     | 35206               |
| burst[fade,nitro-image]                  | memoryRssAnonMaxKb      | 105308              |
| burst[fade,nitro-image]                  | memoryRssFileMaxKb      | 162432              |
| burst[fade,nitro-image]                  | renderThreadFramesCount | 24                  |
| burst[fade,nitro-image]                  | renderThreadFramesSumMs | 92                  |
| burst[fade,nitro-image]                  | uiThreadFramesCount     | 411                 |
| burst[fade,nitro-image]                  | uiThreadFramesSumMs     | 416                 |
| burst[fade,nitro-image]                  | frameDurationCpuMs      | 4.2 / 7.5 / 157.3   |
| burst[fade,nitro-image]                  | frameOverrunMs          | -9.4 / -4.8 / 143.2 |
| burst[fade,turbo-image]                  | allFramesMs             | 537                 |
| burst[fade,turbo-image]                  | frameCount              | 55                  |
| burst[fade,turbo-image]                  | memoryGpuMaxKb          | 39652               |
| burst[fade,turbo-image]                  | memoryHeapSizeMaxKb     | 38420               |
| burst[fade,turbo-image]                  | memoryRssAnonMaxKb      | 111492              |
| burst[fade,turbo-image]                  | memoryRssFileMaxKb      | 160624              |
| burst[fade,turbo-image]                  | renderThreadFramesCount | 56                  |
| burst[fade,turbo-image]                  | renderThreadFramesSumMs | 200                 |
| burst[fade,turbo-image]                  | uiThreadFramesCount     | 272                 |
| burst[fade,turbo-image]                  | uiThreadFramesSumMs     | 342                 |
| burst[fade,turbo-image]                  | frameDurationCpuMs      | 4.5 / 6.8 / 91.7    |
| burst[fade,turbo-image]                  | frameOverrunMs          | -8.0 / -4.0 / 78.9  |
| burst[fade+placeholder,expo-image]       | allFramesMs             | 638                 |
| burst[fade+placeholder,expo-image]       | frameCount              | 51                  |
| burst[fade+placeholder,expo-image]       | memoryGpuMaxKb          | 39652               |
| burst[fade+placeholder,expo-image]       | memoryHeapSizeMaxKb     | 40635               |
| burst[fade+placeholder,expo-image]       | memoryRssAnonMaxKb      | 133588              |
| burst[fade+placeholder,expo-image]       | memoryRssFileMaxKb      | 205696              |
| burst[fade+placeholder,expo-image]       | renderThreadFramesCount | 65                  |
| burst[fade+placeholder,expo-image]       | renderThreadFramesSumMs | 209                 |
| burst[fade+placeholder,expo-image]       | uiThreadFramesCount     | 310                 |
| burst[fade+placeholder,expo-image]       | uiThreadFramesSumMs     | 421                 |
| burst[fade+placeholder,expo-image]       | frameDurationCpuMs      | 4.9 / 7.8 / 142.2   |
| burst[fade+placeholder,expo-image]       | frameOverrunMs          | -8.7 / -4.8 / 128.2 |
| burst[fade+placeholder,fast-image-local] | allFramesMs             | 573                 |
| burst[fade+placeholder,fast-image-local] | frameCount              | 56                  |
| burst[fade+placeholder,fast-image-local] | memoryGpuMaxKb          | 39652               |
| burst[fade+placeholder,fast-image-local] | memoryHeapSizeMaxKb     | 37880               |
| burst[fade+placeholder,fast-image-local] | memoryRssAnonMaxKb      | 126756              |
| burst[fade+placeholder,fast-image-local] | memoryRssFileMaxKb      | 205380              |
| burst[fade+placeholder,fast-image-local] | renderThreadFramesCount | 57                  |
| burst[fade+placeholder,fast-image-local] | renderThreadFramesSumMs | 206                 |
| burst[fade+placeholder,fast-image-local] | uiThreadFramesCount     | 313                 |
| burst[fade+placeholder,fast-image-local] | uiThreadFramesSumMs     | 353                 |
| burst[fade+placeholder,fast-image-local] | frameDurationCpuMs      | 4.8 / 6.9 / 105.0   |
| burst[fade+placeholder,fast-image-local] | frameOverrunMs          | -8.5 / -5.3 / 90.6  |
| burst[fade+placeholder,image]            | allFramesMs             | 681                 |
| burst[fade+placeholder,image]            | frameCount              | 59                  |
| burst[fade+placeholder,image]            | memoryGpuMaxKb          | 39652               |
| burst[fade+placeholder,image]            | memoryHeapSizeMaxKb     | 31429               |
| burst[fade+placeholder,image]            | memoryRssAnonMaxKb      | 143136              |
| burst[fade+placeholder,image]            | memoryRssFileMaxKb      | 244376              |
| burst[fade+placeholder,image]            | renderThreadFramesCount | 60                  |
| burst[fade+placeholder,image]            | renderThreadFramesSumMs | 242                 |
| burst[fade+placeholder,image]            | uiThreadFramesCount     | 313                 |
| burst[fade+placeholder,image]            | uiThreadFramesSumMs     | 420                 |
| burst[fade+placeholder,image]            | frameDurationCpuMs      | 5.1 / 9.4 / 128.6   |
| burst[fade+placeholder,image]            | frameOverrunMs          | -7.0 / -2.4 / 114.0 |
| burst[fade+placeholder,nitro-image]      | allFramesMs             | 518                 |
| burst[fade+placeholder,nitro-image]      | frameCount              | 24                  |
| burst[fade+placeholder,nitro-image]      | memoryGpuMaxKb          | 39652               |
| burst[fade+placeholder,nitro-image]      | memoryHeapSizeMaxKb     | 38262               |
| burst[fade+placeholder,nitro-image]      | memoryRssAnonMaxKb      | 109464              |
| burst[fade+placeholder,nitro-image]      | memoryRssFileMaxKb      | 163420              |
| burst[fade+placeholder,nitro-image]      | renderThreadFramesCount | 25                  |
| burst[fade+placeholder,nitro-image]      | renderThreadFramesSumMs | 94                  |
| burst[fade+placeholder,nitro-image]      | uiThreadFramesCount     | 449                 |
| burst[fade+placeholder,nitro-image]      | uiThreadFramesSumMs     | 414                 |
| burst[fade+placeholder,nitro-image]      | frameDurationCpuMs      | 4.4 / 8.1 / 149.6   |
| burst[fade+placeholder,nitro-image]      | frameOverrunMs          | -9.3 / -4.2 / 138.2 |
| burst[fade+placeholder,turbo-image]      | allFramesMs             | 576                 |
| burst[fade+placeholder,turbo-image]      | frameCount              | 55                  |
| burst[fade+placeholder,turbo-image]      | memoryGpuMaxKb          | 39652               |
| burst[fade+placeholder,turbo-image]      | memoryHeapSizeMaxKb     | 41576               |
| burst[fade+placeholder,turbo-image]      | memoryRssAnonMaxKb      | 114684              |
| burst[fade+placeholder,turbo-image]      | memoryRssFileMaxKb      | 160756              |
| burst[fade+placeholder,turbo-image]      | renderThreadFramesCount | 56                  |
| burst[fade+placeholder,turbo-image]      | renderThreadFramesSumMs | 205                 |
| burst[fade+placeholder,turbo-image]      | uiThreadFramesCount     | 313                 |
| burst[fade+placeholder,turbo-image]      | uiThreadFramesSumMs     | 366                 |
| burst[fade+placeholder,turbo-image]      | frameDurationCpuMs      | 4.5 / 6.2 / 108.6   |
| burst[fade+placeholder,turbo-image]      | frameOverrunMs          | -8.0 / -4.4 / 96.4  |
| burst[plain,expo-image]                  | allFramesMs             | 437                 |
| burst[plain,expo-image]                  | frameCount              | 32                  |
| burst[plain,expo-image]                  | memoryGpuMaxKb          | 39652               |
| burst[plain,expo-image]                  | memoryHeapSizeMaxKb     | 37754               |
| burst[plain,expo-image]                  | memoryRssAnonMaxKb      | 129648              |
| burst[plain,expo-image]                  | memoryRssFileMaxKb      | 205908              |
| burst[plain,expo-image]                  | renderThreadFramesCount | 33                  |
| burst[plain,expo-image]                  | renderThreadFramesSumMs | 128                 |
| burst[plain,expo-image]                  | uiThreadFramesCount     | 218                 |
| burst[plain,expo-image]                  | uiThreadFramesSumMs     | 306                 |
| burst[plain,expo-image]                  | frameDurationCpuMs      | 4.9 / 7.5 / 151.5   |
| burst[plain,expo-image]                  | frameOverrunMs          | -9.2 / -5.2 / 138.0 |
| burst[plain,fast-image-local]            | allFramesMs             | 404                 |
| burst[plain,fast-image-local]            | frameCount              | 34                  |
| burst[plain,fast-image-local]            | memoryGpuMaxKb          | 39652               |
| burst[plain,fast-image-local]            | memoryHeapSizeMaxKb     | 35660               |
| burst[plain,fast-image-local]            | memoryRssAnonMaxKb      | 123724              |
| burst[plain,fast-image-local]            | memoryRssFileMaxKb      | 204948              |
| burst[plain,fast-image-local]            | renderThreadFramesCount | 34                  |
| burst[plain,fast-image-local]            | renderThreadFramesSumMs | 124                 |
| burst[plain,fast-image-local]            | uiThreadFramesCount     | 193                 |
| burst[plain,fast-image-local]            | uiThreadFramesSumMs     | 272                 |
| burst[plain,fast-image-local]            | frameDurationCpuMs      | 4.4 / 6.5 / 124.3   |
| burst[plain,fast-image-local]            | frameOverrunMs          | -9.7 / -6.8 / 109.9 |
| burst[plain,image]                       | allFramesMs             | 497                 |
| burst[plain,image]                       | frameCount              | 42                  |
| burst[plain,image]                       | memoryGpuMaxKb          | 39652               |
| burst[plain,image]                       | memoryHeapSizeMaxKb     | 29657               |
| burst[plain,image]                       | memoryRssAnonMaxKb      | 139352              |
| burst[plain,image]                       | memoryRssFileMaxKb      | 245188              |
| burst[plain,image]                       | renderThreadFramesCount | 43                  |
| burst[plain,image]                       | renderThreadFramesSumMs | 174                 |
| burst[plain,image]                       | uiThreadFramesCount     | 207                 |
| burst[plain,image]                       | uiThreadFramesSumMs     | 317                 |
| burst[plain,image]                       | frameDurationCpuMs      | 4.8 / 8.8 / 113.1   |
| burst[plain,image]                       | frameOverrunMs          | -8.1 / -3.1 / 98.4  |
| burst[plain,nitro-image]                 | allFramesMs             | 491                 |
| burst[plain,nitro-image]                 | frameCount              | 24                  |
| burst[plain,nitro-image]                 | memoryGpuMaxKb          | 39652               |
| burst[plain,nitro-image]                 | memoryHeapSizeMaxKb     | 31771               |
| burst[plain,nitro-image]                 | memoryRssAnonMaxKb      | 102840              |
| burst[plain,nitro-image]                 | memoryRssFileMaxKb      | 165980              |
| burst[plain,nitro-image]                 | renderThreadFramesCount | 25                  |
| burst[plain,nitro-image]                 | renderThreadFramesSumMs | 97                  |
| burst[plain,nitro-image]                 | uiThreadFramesCount     | 348                 |
| burst[plain,nitro-image]                 | uiThreadFramesSumMs     | 397                 |
| burst[plain,nitro-image]                 | frameDurationCpuMs      | 4.3 / 7.6 / 159.6   |
| burst[plain,nitro-image]                 | frameOverrunMs          | -9.3 / -4.9 / 145.4 |
| burst[plain,turbo-image]                 | allFramesMs             | 378                 |
| burst[plain,turbo-image]                 | frameCount              | 23                  |
| burst[plain,turbo-image]                 | memoryGpuMaxKb          | 39652               |
| burst[plain,turbo-image]                 | memoryHeapSizeMaxKb     | 34808               |
| burst[plain,turbo-image]                 | memoryRssAnonMaxKb      | 108176              |
| burst[plain,turbo-image]                 | memoryRssFileMaxKb      | 163464              |
| burst[plain,turbo-image]                 | renderThreadFramesCount | 24                  |
| burst[plain,turbo-image]                 | renderThreadFramesSumMs | 99                  |
| burst[plain,turbo-image]                 | uiThreadFramesCount     | 206                 |
| burst[plain,turbo-image]                 | uiThreadFramesSumMs     | 274                 |
| burst[plain,turbo-image]                 | frameDurationCpuMs      | 4.6 / 7.4 / 123.0   |
| burst[plain,turbo-image]                 | frameOverrunMs          | -8.9 / -5.0 / 109.1 |

Nitro Image has no fade or placeholder, and sends no load events, so its burst runs last a fixed 3 s: its frame times aren't comparable. Turbo Image's placeholders aren't local images, so its `fade+placeholder` runs are `fade` runs.
