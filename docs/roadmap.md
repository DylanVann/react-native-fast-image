# Roadmap / Ideas

## Add `onProgress` and `onComplete` to preload.

-   [Add onProgress and onComplete to preload.](https://github.com/DylanVann/react-native-fast-image/pull/268)
-   Blocked by: [Consider switching to a different iOS image loading library.](https://github.com/DylanVann/react-native-fast-image/issues/13)
-   Preload API should include returning the cache path of the images.
-   Something like `.preload(images: {uri, ...otherOptions}[]): Promise<[{path: string}]>`
-   Maybe something like: [Make it possible to obtain the cache path of an image.](https://github.com/DylanVann/react-native-fast-image/pull/351)

## Add `blurRadius` prop.

-   [Add blurRadius property.](https://github.com/DylanVann/react-native-fast-image/pull/157)
-   Blocked by: needing an Android implementation that works the same.

## Add more information to `onError` callback.

-   We need standardized errors across iOS and Android.
