# Android, Pixel 8, burst, 2026-10-10

Firebase Test Lab (`model=shiba,version=35`, Android 15), `--paired --phones 3 --tests burst --iterations 10`: three phones, each running every subject's variants (10 runs each). The benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release. Subjects: FastImage 10 (the 10.0 stack's top, b810bef), the same before its change to fades from `defaultSource` (f3fb38a; a temporary subject, not in `subjects.json`), expo-image 57.0.5, React Native Image (React Native 0.86.3). Images served on the phone with 40 ms latency and no bandwidth limit. The phones had Android's animations off (`animator_duration_scale` 0); the test turns them on.

The grid's 60 photos mounted at once from a cold cache, from the tap until the results were written. Frames: frames drawn (median per run). Frame CPU: time on the UI thread and RenderThread per frame, over all runs. Late: frames that missed their deadline (median per run; the 60 views mounting take one or two). Total: frame CPU summed over a run (median). Memory: the most anonymous memory (RSS) during a run (median).

| Variant          | Subject             | Frames | Frame CPU ms (p50 / p90 / p99) | Late | Total ms | Memory MB |
| ---------------- | ------------------- | ------ | ------------------------------ | ---- | -------- | --------- |
| plain            | FastImage 10        | 33     | 4.3 / 6.6 / 111.1              | 1    | 254      | 118.9     |
| plain            | FastImage 10 before | 33     | 4.5 / 7.3 / 135.7              | 1    | 289      | 119.2     |
| plain            | expo-image          | 32     | 4.8 / 7.5 / 158.8              | 2    | 312      | 125.3     |
| plain            | React Native Image  | 42     | 4.8 / 9.3 / 138.1              | 1    | 342      | 134.6     |
| fade             | FastImage 10        | 57     | 5.1 / 7.9 / 109.3              | 1    | 419      | 120.8     |
| fade             | FastImage 10 before | 57     | 5.1 / 7.6 / 121.9              | 1    | 424      | 120.8     |
| fade             | expo-image          | 44     | 5.0 / 7.3 / 155.6              | 2    | 386      | 126.4     |
| fade             | React Native Image  | 59     | 4.9 / 9.1 / 109.0              | 2    | 440      | 135.3     |
| placeholder      | FastImage 10        | 33     | 4.5 / 7.0 / 133.0              | 1    | 278      | 121.4     |
| placeholder      | FastImage 10 before | 32     | 4.5 / 7.0 / 132.5              | 2    | 278      | 121.5     |
| placeholder      | expo-image          | 22     | 4.3 / 10.0 / 185.0             | 2    | 278      | 128.9     |
| placeholder      | React Native Image  | 41     | 4.8 / 9.1 / 137.5              | 1    | 356      | 137.2     |
| fade+placeholder | FastImage 10        | 56     | 6.1 / 9.6 / 114.9              | 2    | 471      | 124.0     |
| fade+placeholder | FastImage 10 before | 55     | 6.5 / 10.5 / 113.5             | 4.5  | 497      | 140.3     |
| fade+placeholder | expo-image          | 52     | 5.1 / 7.4 / 148.0              | 2    | 436      | 130.3     |
| fade+placeholder | React Native Image  | 59     | 5.0 / 8.8 / 136.9              | 2    | 460      | 138.8     |

- Fading over `defaultSource` without copying the view into a bitmap: 16 MB less at the most (140.3 → 124.0 MB; 16.2–16.7 MB on each phone). Its frame CPU (497 → 471 ms) is within this test's spread: in `plain`, where both run the same code, they differ by 35 ms (the subjects run in the same order every time, so later ones can run on a warmer phone).
- Fades add frame CPU for every subject: FastImage +165 ms (`plain` to `fade`), expo-image +74 ms, React Native Image +98 ms. FastImage draws its fade in the view (a layer per fading view, each frame); expo-image animates its views' alpha. No subject misses more deadlines with fades.
- The first run of this test, with the phones' animations off, showed no fade frames for FastImage and expo-image (their fades follow Android's animation setting), and fade frames for React Native Image.

## Drawing the fade, 2026-10-10

The same test with three versions of FastImage 10's fade (a temporary switch in a build of the stack's top) and expo-image, on 4 phones: two with the apps in each order (`--subjects` reversed), so the order's effect cancels out. `--burst plain,fade,fade+placeholder`, 10 runs each.

| Variant          | Subject                      | Frames | Frame CPU ms (p50 / p90 / p99) | Late | Total ms | Memory MB |
| ---------------- | ---------------------------- | ------ | ------------------------------ | ---- | -------- | --------- |
| plain            | FastImage 10, two layers     | 32     | 4.5 / 6.9 / 131.4              | 1    | 276      | 121.4     |
| plain            | FastImage 10, without layers | 33     | 4.5 / 7.1 / 130.3              | 2    | 277      | 121.7     |
| plain            | FastImage 10, render nodes   | 32     | 4.4 / 7.1 / 132.1              | 1    | 276      | 121.5     |
| plain            | expo-image                   | 32     | 4.7 / 7.2 / 159.1              | 2    | 307      | 127.4     |
| fade             | FastImage 10, two layers     | 57     | 5.3 / 8.1 / 118.4              | 2    | 446      | 123.2     |
| fade             | FastImage 10, without layers | 57     | 4.7 / 7.2 / 120.9              | 1    | 403      | 122.8     |
| fade             | FastImage 10, render nodes   | 57     | 4.9 / 7.5 / 124.2              | 2    | 436      | 124.1     |
| fade             | expo-image                   | 44     | 5.0 / 7.3 / 147.6              | 2    | 380      | 129.0     |
| fade+placeholder | FastImage 10, two layers     | 56     | 6.2 / 9.8 / 137.5              | 2    | 511      | 125.7     |
| fade+placeholder | FastImage 10, without layers | 57     | 5.1 / 7.7 / 131.0              | 2    | 441      | 124.5     |
| fade+placeholder | FastImage 10, render nodes   | 56     | 7.3 / 11.5 / 131.0             | 2.5  | 553      | 127.6     |
| fade+placeholder | expo-image                   | 52     | 5.0 / 7.4 / 150.3              | 2    | 425      | 131.8     |

- Two layers: the fade above (every frame, a layer for what the view showed and one for the image, added up).
- Without layers, now in FastImage 10: over nothing, the image drawn with the fade's alpha; over the placeholder, the placeholder and then the image over it with the alpha, as the image is opaque and covers it (the photos here are). Faster than two layers on every phone: 390–412 ms over nothing (two layers: 429–478), 432–461 ms over the placeholder (477–527).
- Render nodes (Android 10+): the image and the placeholder recorded once, only their alpha changed each frame, in a group with a layer kept between frames. Slower over the placeholder on every phone (538–568 ms): the group's layer is still drawn every frame.
- With identical code in `plain`, the three FastImage versions are within 1 ms of each other here, where the single-order run above had a 35 ms difference.
