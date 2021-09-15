# Possible Features

These are major features people are interested in.

-   [ ] Fine grained cache control.
    -   [ ] Check cache for image, get path.
    -   [ ] Remove specific image from cache.
    -   [ ] Preload / add image to cache.
-   [ ] Tint
    -   Needs to work well and look the same across platforms.
-   [ ] Blur
    -   Needs to work well and look the **SAME** across platforms.
-   [ ] Fix rounded corner AA issue.
    -   Needs to work per corner, across platforms (should not affect iOS).
-   Probably after Blur and Tint we don't need to worry about arbitrary filters, can be done using other libs.
-   [ ] React Native Web support.
    -   Want to at least support all styling features.
    -   Stuff like fine grained cache control and preloading can probably no-op, at least as a first pass.
