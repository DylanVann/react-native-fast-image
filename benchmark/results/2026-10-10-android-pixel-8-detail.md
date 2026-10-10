# Android, Pixel 8, opening a photo while the grid loads, 2026-10-10

Firebase Test Lab (`model=shiba,version=35`, Android 15), `run-android.ts --firebase --paired --phones 4 --scenarios sizes,detail`: 4 phones, each running every library in turns (in the other order each iteration), 5 runs each. The benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release. FastImage 10 (FastImage (this checkout): the 10.0 stack's top), React Native Image (React Native 0.86.3), expo-image 57.0.5, Nitro Image 0.15.2, Turbo Image 1.24.3, each with its defaults and without fades. Images served on the phone with 40 ms latency and no bandwidth limit.

`detail`: the grid's 60 photos, and 100 ms later (113–198 ms, as the app's timer fired) the last of them, the one whose download the grid asked for last, at the screen's width over the grid, which goes on loading under it; with `priority="high"` for FastImage and expo-image (the others have no priority). Only that photo is timed: its first image is its last. `sizes` as in the reference run, with the image requests now in the main table.

Times in ms from the start of the run (the frame its clock starts in, as the app renders the subject's views), from screen recordings, timed by the clock the app draws in each frame: median / p90 over the runs (with 5 runs, p90 is the slowest). All visible images: over the runs that showed every one; the others are counted in the next columns. Frame window: how long before an image's first frame the last earlier one was drawn (median / max): the image showed within that time. Image requests: how many the image server got (median). Network: the median download rate of 4 large photos fetched with `fetch` (not through the subject) once the images have loaded. Images served on the phone (40 ms latency, unlimited Mbps).

| Platform | Subject                   | Scenario | Runs | First image | All visible images | Per image | Frame window | Load event after pixels | Images not shown (load errors) | Image requests | Network Mbps | Failures |
| -------- | ------------------------- | -------- | ---- | ----------- | ------------------ | --------- | ------------ | ----------------------- | ------------------------------ | -------------- | ------------ | -------- |
| android  | React Native Image        | detail   | 20   | 764 / 780   | 764 / 780          | 764 / 780 | 16 / 16      | 18                      |                                | 60             | 125          |          |
| android  | React Native Image        | sizes    | 20   | 196 / 216   | 332 / 364          | 248 / 296 | 16 / 20      | 18                      |                                | 16             | 121          |          |
| android  | FastImage (this checkout) | detail   | 20   | 380 / 432   | 380 / 432          | 380 / 432 | 16 / 16      | 19                      |                                | 60             | 128          |          |
| android  | FastImage (this checkout) | sizes    | 20   | 180 / 216   | 332 / 348          | 248 / 332 | 16 / 20      | 18                      |                                | 16             | 126          |          |
| android  | expo-image                | detail   | 20   | 532 / 816   | 532 / 816          | 532 / 816 | 16 / 20      | 16                      |                                | 61             | 132          |          |
| android  | expo-image                | sizes    | 20   | 196 / 216   | 496 / 532          | 348 / 480 | 16 / 20      | 17                      |                                | 32             | 128          |          |
| android  | Nitro Image               | detail   | 20   | 816 / 864   | 816 / 864          | 816 / 864 | 16 / 20      | –                       |                                | 61             | 92           |          |
| android  | Nitro Image               | sizes    | 20   | 216 / 248   | 532 / 564          | 380 / 496 | 16 / 20      | –                       |                                | 32             | 90           |          |
| android  | Turbo Image               | detail   | 20   | 816 / 880   | 816 / 880          | 816 / 880 | 16 / 20      | 16                      |                                | 61             | 119          |          |
| android  | Turbo Image               | sizes    | 20   | 232 / 264   | 532 / 580          | 380 / 496 | 16 / 20      | 16                      |                                | 32             | 120          |          |

Paired on each phone, against React Native Image (ms; negative is faster): median difference, and the middle half of the differences, for time to the first and to the last image; how many runs were faster; image requests (median, each subject):

| Subject                   | Scenario | Pairs | First               | All                 | Faster (all) | Requests                    |
| ------------------------- | -------- | ----- | ------------------- | ------------------- | ------------ | --------------------------- |
| FastImage (this checkout) | sizes    | 20    | -16 (-32 to 16)     | 0 (-48 to 16)       | 7 of 20      | 16 (React Native Image: 16) |
| FastImage (this checkout) | detail   | 20    | -384 (-400 to -352) | -384 (-400 to -352) | 19 of 20     | 60 (React Native Image: 60) |
| expo-image                | sizes    | 20    | 0 (-16 to 16)       | 164 (148 to 184)    | 0 of 20      | 32 (React Native Image: 16) |
| expo-image                | detail   | 20    | -232 (-336 to 16)   | -232 (-336 to 16)   | 13 of 20     | 61 (React Native Image: 60) |
| Nitro Image               | sizes    | 20    | 32 (16 to 36)       | 200 (180 to 200)    | 0 of 20      | 32 (React Native Image: 16) |
| Nitro Image               | detail   | 20    | 36 (0 to 100)       | 36 (0 to 100)       | 4 of 20      | 61 (React Native Image: 60) |
| Turbo Image               | sizes    | 20    | 32 (20 to 48)       | 184 (184 to 216)    | 0 of 20      | 32 (React Native Image: 16) |
| Turbo Image               | detail   | 20    | 48 (-116 to 84)     | 48 (-116 to 84)     | 6 of 20      | 61 (React Native Image: 60) |

- FastImage 10 showed the photo within 364–448 ms in every run: it moved the grid's download of it, still waiting to start, ahead of the others, and used it for both sizes (60 requests).
- expo-image downloaded it again (61 requests); in 9 of 20 runs it showed within 332–480 ms, in the others within 532–816 ms.
- React Native's `Image` used the grid's download (60 requests), Nitro Image and Turbo Image downloaded it again (61). With no priority, they mostly showed it at about the time the grid's last photos loaded (medians 764–816 ms).
