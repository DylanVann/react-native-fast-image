# Android, Pixel 8, fades, 2026-10-10

The burst test's runs while working on FastImage 10's fades, with FastImage 10, expo-image and React Native Image; the reference burst results, with all five libraries, are in `2026-10-10-android-pixel-8.md`.

Firebase Test Lab (`model=shiba,version=35`, Android 15), `--paired --phones 2 --tests burst --iterations 10`, twice, with the subjects in opposite orders (`--subjects` reversed), so the order's effect cancels out: four phones, each running every subject's variants (10 runs each). The benchmark app on Expo SDK 57 (React Native 0.86.3, New Architecture), Release. Subjects: FastImage 10 (the 10.0 stack's top), expo-image 57.0.5, React Native Image (React Native 0.86.3). Images served on the phone with 40 ms latency and no bandwidth limit. Android's animations on (the test turns them on; Test Lab's phones have them off).

The grid's 60 photos mounted at once from a cold cache, from the tap until the results were written. Frames drawn: the RenderThread's frames (median per run). Counted: the frames `FrameTimingMetric` counted (median per run). Frame CPU: `FrameTimingMetric`'s time on the UI thread and RenderThread per frame, over all runs. Late: frames that missed their deadline (median per run; the 60 views mounting take one or two). All frames: every frame's time on the UI thread and RenderThread, summed over a run (`uiThreadFramesSumMs` + `renderThreadFramesSumMs`, median). Memory: the most anonymous memory (RSS) during a run (median).

| Variant          | Subject            | Frames drawn | Counted | Frame CPU ms (p50 / p90) | Late | All frames ms | Memory MB |
| ---------------- | ------------------ | ------------ | ------- | ------------------------ | ---- | ------------- | --------- |
| plain            | FastImage 10       | 34           | 32      | 4.4 / 7.0                | 1    | 398           | 119.1     |
| plain            | expo-image         | 33           | 32      | 4.8 / 7.2                | 2    | 429           | 125.3     |
| plain            | React Native Image | 42           | 41      | 4.8 / 8.8                | 1    | 512           | 134.4     |
| fade             | FastImage 10       | 57           | 57      | 4.7 / 6.9                | 1    | 551           | 120.8     |
| fade             | expo-image         | 57           | 44      | 4.9 / 7.1                | 2    | 574           | 126.4     |
| fade             | React Native Image | 60           | 59      | 4.8 / 8.6                | 1    | 633           | 135.3     |
| placeholder      | FastImage 10       | 34           | 33      | 4.6 / 7.1                | 2    | 466           | 121.5     |
| placeholder      | expo-image         | 34           | 22      | 4.2 / 9.9                | 2    | 459           | 128.8     |
| placeholder      | React Native Image | 42           | 41      | 4.9 / 9.1                | 2    | 557           | 137.0     |
| fade+placeholder | FastImage 10       | 57           | 56      | 5.1 / 7.2                | 1.5  | 615           | 123.2     |
| fade+placeholder | expo-image         | 64           | 51      | 5.1 / 7.2                | 2    | 650           | 130.1     |
| fade+placeholder | React Native Image | 60           | 59      | 5.0 / 8.9                | 2    | 680           | 139.6     |

- `FrameTimingMetric` only counts frames that the frame timeline shows presented. It counted nearly all of FastImage's and React Native Image's frames, and left out a fifth to a third of expo-image's (13 of 57 with fades), so its totals favor expo-image; compare subjects with All frames.
- With fades, FastImage 10 took the least time over all frames on every phone, though over nothing by only 1–3 ms on two of them: 527–585 ms over nothing (expo-image 556–593, React Native Image 626–646) and 560–648 ms over the placeholder (643–680, 656–698).
- The fade's own cost (`fade` minus `plain`): FastImage 10 +153 ms, expo-image +145 ms, React Native Image +121 ms. Over the placeholder (`fade+placeholder` minus `placeholder`): +149, +191 (expo-image fades its placeholder in too) and +123 ms.
- FastImage 10 used the least memory, by about the same amount with and without fades.

## Earlier runs the same day

With `FrameTimingMetric`'s frame CPU only, before the All frames sums were added (it counts FastImage's frames, so FastImage's versions compare):

- Fading over `defaultSource` without copying the view into a bitmap (3 phones, one order): with fades over the placeholder, 16 MB less at the most (140.3 → 124.0 MB; 16.2–16.7 MB on each phone).
- Three ways of drawing FastImage 10's fade (4 phones, two orders; a temporary switch in a build of the stack's top), total frame CPU per run:

| Variant          | Two layers | Without layers (now) | Render nodes |
| ---------------- | ---------- | -------------------- | ------------ |
| plain            | 276 ms     | 277 ms               | 276 ms       |
| fade             | 446 ms     | 403 ms               | 436 ms       |
| fade+placeholder | 511 ms     | 441 ms               | 553 ms       |

Two layers: every frame, a layer for what the view showed and one for the image, added up. Without layers: over nothing, the image drawn with the fade's alpha; over the placeholder, the placeholder and then the image over it with the alpha, as the image is opaque and covers it (faster than two layers on every phone). Render nodes (Android 10+): the image and the placeholder recorded once, only their alpha changed each frame, in a group with a layer kept between frames (slower over the placeholder on every phone: the group's layer is still drawn every frame).
