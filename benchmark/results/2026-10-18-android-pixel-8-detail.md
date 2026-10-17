# Android, Pixel 8, opening a photo while the grid loads, 2026-10-18

Firebase Test Lab (`model=shiba,version=35`, Android 15), `run-android.ts --firebase --paired --phones 4 --scenarios detail`: 4 phones, each running every library in turns (in the other order each iteration), 5 runs each. The benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release. FastImage 10.0 (FastImage (this checkout)), React Native Image (React Native 0.86.3), expo-image 57.0.5, Nitro Image 0.15.2, Turbo Image 1.24.3, each with its defaults and without fades. Images served on the phone with 40 ms latency and no bandwidth limit.

`detail` as in the reference runs of 2026-10-12 (the grid's 60 photos, and 100 ms later the last of them, the one whose download the grid asked for last, at the screen's width over the grid, which goes on loading under it), run again with `priority: 'high'` for Nitro Image too: its url source's `options.priority`, which the benchmark's adapter didn't set before. So FastImage, expo-image and Nitro Image ask for high priority; React Native Image and Turbo Image have none. Only that photo is timed: its first image is its last.

Nitro Image with `priority: 'high'` showed the photo at 832 ms, as without it (832 ms on 2026-10-12): on Android its priority picks the coroutine dispatcher the request runs on, and doesn't move the download ahead of the ones waiting. The runs, sorted (ms): FastImage 248–396 (all 20); expo-image 280, 348, 364, 380, 432, then 480–864; Nitro Image 496, 564, then 732–916; Turbo Image 296–680 in 11 runs, 816–896 in the others; React Native Image 732–832.

Times in ms from the start of the run (the frame its clock starts in, as the app renders the subject's views), from screen recordings, timed by the clock the app draws in each frame: median / p90 over the runs (with 5 runs, p90 is the slowest). All visible images: over the runs that showed every one; the others are counted in the next columns. Frame window: how long before an image's first frame the last earlier one was drawn (median / max): the image showed within that time. Image requests: how many the image server got (median). Network: the median download rate of 4 large photos fetched with `fetch` (not through the subject) once the images have loaded. Images served on the phone (40 ms latency, unlimited Mbps).

| Platform | Subject                   | Scenario | Runs | First image | All visible images | Per image | Frame window | Load event after pixels | Images not shown (load errors) | Image requests | Network Mbps | Failures |
| -------- | ------------------------- | -------- | ---- | ----------- | ------------------ | --------- | ------------ | ----------------------- | ------------------------------ | -------------- | ------------ | -------- |
| android  | React Native Image        | detail   | 20   | 764 / 816   | 764 / 816          | 764 / 816 | 16 / 20      | 17                      |                                | 60             | 122          |          |
| android  | FastImage (this checkout) | detail   | 20   | 280 / 332   | 280 / 332          | 280 / 332 | 16 / 20      | 18                      |                                | 60             | 121          |          |
| android  | expo-image                | detail   | 20   | 764 / 816   | 764 / 816          | 764 / 816 | 16 / 20      | 16                      |                                | 61             | 131          |          |
| android  | Nitro Image               | detail   | 20   | 832 / 880   | 832 / 880          | 832 / 880 | 16 / 20      | –                       |                                | 61             | 93           |          |
| android  | Turbo Image               | detail   | 20   | 632 / 864   | 632 / 864          | 632 / 864 | 16 / 20      | 15                      |                                | 61             | 113          |          |

Paired on each phone, against React Native Image (ms; negative is faster): median difference, and the middle half of the differences, for time to the first and to the last image; how many runs were faster; image requests (median, each subject):

| Subject                   | Scenario | Pairs | First               | All                 | Faster (all) | Requests                    |
| ------------------------- | -------- | ----- | ------------------- | ------------------- | ------------ | --------------------------- |
| FastImage (this checkout) | detail   | 20    | -468 (-500 to -452) | -468 (-500 to -452) | 20 of 20     | 60 (React Native Image: 60) |
| expo-image                | detail   | 20    | -36 (-332 to 20)    | -36 (-332 to 20)    | 10 of 20     | 61 (React Native Image: 60) |
| Nitro Image               | detail   | 20    | 48 (0 to 100)       | 48 (0 to 100)       | 4 of 20      | 61 (React Native Image: 60) |
| Turbo Image               | detail   | 20    | -116 (-264 to 84)   | -116 (-264 to 84)   | 12 of 20     | 61 (React Native Image: 60) |
