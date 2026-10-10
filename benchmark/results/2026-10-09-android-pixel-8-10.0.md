# Android, Pixel 8, FastImage 10 and 9.2.2, 2026-10-09

Firebase Test Lab (`model=shiba,version=35`, Android 15), `--paired --phones 5 --scenarios grid,large,sizes`: five phones, each running FastImage 9.2.2 (FastImage 9) and FastImage 10 (this checkout: the 10.0 stack's top at ed457b9) in turns, 5 runs each per phone, both without fades. The benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release. Images served on the phone with 40 ms latency, with no bandwidth limit and with 50 Mbps.

Times in ms from the start of the run, from screen recordings: median / p90 over the runs. The paired tables: each run's difference from FastImage 9 on the same phone (negative is faster), the median and the middle half of the differences, how many runs were faster, and the image requests the phone's server got (median).

## No bandwidth limit

| Platform | Subject                   | Scenario | Runs | First image | All visible images | Per image | Frame window | Load event after pixels | Images not shown (load errors) | Network Mbps | Failures |
| -------- | ------------------------- | -------- | ---- | ----------- | ------------------ | --------- | ------------ | ----------------------- | ------------------------------ | ------------ | -------- |
| android  | FastImage 9               | grid     | 25   | 232 / 280   | 580 / 748          | 380 / 516 | 16 / 20      | 17                      |                                | 111          |          |
| android  | FastImage 9               | large    | 25   | 216 / 332   | 464 / 864          | 364 / 532 | 16 / 20      | 17                      |                                | 110          |          |
| android  | FastImage 9               | sizes    | 25   | 232 / 264   | 380 / 416          | 296 / 364 | 16 / 20      | 17                      |                                | 111          |          |
| android  | FastImage (this checkout) | grid     | 25   | 232 / 280   | 580 / 664          | 380 / 516 | 16 / 20      | 17                      |                                | 109          |          |
| android  | FastImage (this checkout) | large    | 25   | 232 / 332   | 480 / 848          | 380 / 516 | 16 / 20      | 17                      |                                | 114          |          |
| android  | FastImage (this checkout) | sizes    | 25   | 216 / 296   | 364 / 448          | 296 / 380 | 16 / 20      | 17                      |                                | 109          |          |

| Subject                   | Scenario | Pairs | First          | All             | Faster (all) | Requests             |
| ------------------------- | -------- | ----- | -------------- | --------------- | ------------ | -------------------- |
| FastImage (this checkout) | sizes    | 25    | 0 (-20 to 16)  | 0 (-16 to 16)   | 10 of 25     | 16 (FastImage 9: 16) |
| FastImage (this checkout) | large    | 25    | 0 (-16 to 20)  | 16 (-16 to 32)  | 9 of 25      | 20 (FastImage 9: 20) |
| FastImage (this checkout) | grid     | 25    | -16 (-32 to 0) | -16 (-84 to 20) | 14 of 25     | 60 (FastImage 9: 60) |

## 50 Mbps

| Platform | Subject                   | Scenario | Runs | First image | All visible images | Per image   | Frame window | Load event after pixels | Images not shown (load errors) | Network Mbps | Failures |
| -------- | ------------------------- | -------- | ---- | ----------- | ------------------ | ----------- | ------------ | ----------------------- | ------------------------------ | ------------ | -------- |
| android  | FastImage 9               | grid     | 25   | 232 / 280   | 596 / 680          | 416 / 548   | 16 / 20      | 17                      |                                | 39           |          |
| android  | FastImage 9               | large    | 25   | 1280 / 1396 | 4732 / 4780        | 2664 / 4616 | 16 / 20      | 16                      |                                | 38           |          |
| android  | FastImage 9               | sizes    | 25   | 232 / 248   | 396 / 416          | 332 / 396   | 16 / 20      | 17                      |                                | 39           |          |
| android  | FastImage (this checkout) | grid     | 25   | 232 / 264   | 596 / 796          | 396 / 548   | 16 / 20      | 17                      |                                | 38           |          |
| android  | FastImage (this checkout) | large    | 25   | 1264 / 1464 | 4732 / 4764        | 2664 / 4632 | 16 / 36      | 15                      |                                | 38           |          |
| android  | FastImage (this checkout) | sizes    | 25   | 216 / 248   | 380 / 416          | 316 / 380   | 16 / 20      | 17                      |                                | 39           |          |

| Subject                   | Scenario | Pairs | First          | All            | Faster (all) | Requests             |
| ------------------------- | -------- | ----- | -------------- | -------------- | ------------ | -------------------- |
| FastImage (this checkout) | sizes    | 25    | -16 (-32 to 0) | -16 (-32 to 0) | 13 of 25     | 16 (FastImage 9: 16) |
| FastImage (this checkout) | large    | 25    | 0 (-52 to 48)  | 0 (-20 to 0)   | 11 of 25     | 20 (FastImage 9: 20) |
| FastImage (this checkout) | grid     | 25    | 0 (-32 to 16)  | 0 (-32 to 84)  | 9 of 25      | 60 (FastImage 9: 60) |

- The two versions took the same time in every scenario: the middle half of the run-by-run differences includes 0.
- Both make one request per photo in `sizes` (16).
