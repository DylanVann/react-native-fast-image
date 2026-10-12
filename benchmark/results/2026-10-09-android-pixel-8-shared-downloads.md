# Android, Pixel 8, shared downloads, 2026-10-09

Firebase Test Lab (`model=shiba,version=35`, Android 15), `--paired --phones 5 --scenarios grid,large,sizes`: five phones, each running FastImage 9.1.0 (FastImage 9) and the change released in 9.2.0 (this checkout, at 127a8f3: an image's sizes share one download) in turns, 5 runs each per phone. The benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release. Images served on the phone with 40 ms latency, with no bandwidth limit and with 50 Mbps. The change's last fixes, after this run, keep a download in memory when its temporary file can't be written and keep a reblurred image's progress; neither changes how downloads are shared.

`sizes`: 16 of the grid's photos at two sizes at once (4 and 8 columns), with the same urls.

Times in ms from the start of the run, from screen recordings: median / p90 over the runs. The paired tables: each run's difference from FastImage 9 on the same phone (negative is faster), the median and the middle half of the differences, how many runs were faster, and the image requests the phone's server got (median).

## No bandwidth limit

| Platform | Subject                   | Scenario | Runs | First image | All visible images | Per image | Frame window | Load event after pixels | Images not shown (load errors) | Network Mbps | Failures |
| -------- | ------------------------- | -------- | ---- | ----------- | ------------------ | --------- | ------------ | ----------------------- | ------------------------------ | ------------ | -------- |
| android  | FastImage 9               | grid     | 25   | 232 / 264   | 580 / 696          | 396 / 532 | 16 / 20      | 16                      |                                | 113          |          |
| android  | FastImage 9               | large    | 25   | 232 / 264   | 448 / 496          | 364 / 448 | 16 / 20      | 16                      |                                | 109          |          |
| android  | FastImage 9               | sizes    | 25   | 216 / 248   | 532 / 564          | 380 / 496 | 16 / 20      | 16                      |                                | 105          |          |
| android  | FastImage (this checkout) | grid     | 25   | 232 / 264   | 564 / 716          | 380 / 516 | 16 / 20      | 16                      |                                | 111          |          |
| android  | FastImage (this checkout) | large    | 25   | 216 / 248   | 480 / 496          | 364 / 464 | 16 / 20      | 16                      |                                | 112          |          |
| android  | FastImage (this checkout) | sizes    | 25   | 216 / 248   | 364 / 396          | 280 / 348 | 16 / 20      | 16                      |                                | 110          |          |

| Subject                   | Scenario | Pairs | First           | All                 | Faster (all) | Requests             |
| ------------------------- | -------- | ----- | --------------- | ------------------- | ------------ | -------------------- |
| FastImage (this checkout) | sizes    | 25    | 0 (-32 to 16)   | -168 (-184 to -136) | 25 of 25     | 16 (FastImage 9: 32) |
| FastImage (this checkout) | large    | 25    | -16 (-20 to 16) | 16 (-16 to 48)      | 9 of 25      | 20 (FastImage 9: 20) |
| FastImage (this checkout) | grid     | 25    | 0 (-16 to 16)   | -32 (-68 to 20)     | 15 of 25     | 60 (FastImage 9: 60) |

## 50 Mbps

| Platform | Subject                   | Scenario | Runs | First image | All visible images | Per image   | Frame window | Load event after pixels | Images not shown (load errors) | Network Mbps | Failures |
| -------- | ------------------------- | -------- | ---- | ----------- | ------------------ | ----------- | ------------ | ----------------------- | ------------------------------ | ------------ | -------- |
| android  | FastImage 9               | grid     | 25   | 232 / 248   | 596 / 716          | 416 / 548   | 16 / 20      | 17                      |                                | 39           |          |
| android  | FastImage 9               | large    | 25   | 1464 / 1732 | 4732 / 4764        | 3196 / 4696 | 16 / 36      | 16                      |                                | 38           |          |
| android  | FastImage 9               | sizes    | 25   | 216 / 264   | 564 / 596          | 396 / 532   | 16 / 20      | 17                      |                                | 39           |          |
| android  | FastImage (this checkout) | grid     | 25   | 248 / 264   | 596 / 664          | 416 / 548   | 16 / 20      | 17                      |                                | 39           |          |
| android  | FastImage (this checkout) | large    | 25   | 1296 / 1448 | 4732 / 4780        | 2664 / 4632 | 16 / 36      | 15                      |                                | 38           |          |
| android  | FastImage (this checkout) | sizes    | 25   | 216 / 248   | 396 / 432          | 316 / 380   | 16 / 20      | 17                      |                                | 39           |          |

| Subject                   | Scenario | Pairs | First               | All                 | Faster (all) | Requests             |
| ------------------------- | -------- | ----- | ------------------- | ------------------- | ------------ | -------------------- |
| FastImage (this checkout) | sizes    | 25    | 0 (-20 to 16)       | -168 (-200 to -136) | 25 of 25     | 16 (FastImage 9: 32) |
| FastImage (this checkout) | large    | 25    | -200 (-352 to -116) | 16 (-16 to 32)      | 9 of 25      | 20 (FastImage 9: 20) |
| FastImage (this checkout) | grid     | 25    | 16 (-16 to 32)      | 20 (-80 to 80)      | 12 of 25     | 60 (FastImage 9: 60) |

- `sizes`: 16 requests with the shared downloads, 32 before, and every image on screen 168 ms sooner (median), in all 25 pairs at both network settings.
- `grid` and `large`: the middle half of the differences includes 0, except the first of the large photos at 50 Mbps (200 ms sooner).
