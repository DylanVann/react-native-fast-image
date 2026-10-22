# Upgrading from 9.x

FastImage 10 is a native New Architecture component. Apart from the changes below, the API is the same as in 9.x. Apps that can't move to the New Architecture on React Native 0.83 or later can stay on FastImage 9 (`npm install react-native-fast-image@9`), which gets fixes from the `9.x` branch.

## Requirements

- React Native 0.83 or later, with the New Architecture (the legacy architecture isn't supported).
- Expo SDK 55 or later.
- iOS and tvOS 15.1 or later, with SDWebImage 5.21.5 or later. If `pod install` can't find a compatible SDWebImage (your `Podfile.lock` has an older one), update it with `cd ios && pod update SDWebImage`.
- Android 7.0 (API 24) or later. FastImage builds with `compileSdkVersion` and `targetSdkVersion` 36 by default, and uses Glide 5.0.7 (`glideVersion` 4.15 or later works too): see [Android build settings](android-build-settings.md).

## Changes

- **`resizeMode` is removed:** use [`objectFit`](../README.md#objectfit). `contain` and `cover` keep their names, `stretch` is `fill`, and `center` is `scale-down`. Tiling (`resizeMode="repeat"`) is no longer supported. A `resizeMode` prop or style is ignored, so the image shows with `objectFit`'s default, `cover`. `FastImage.resizeMode` is still there, deprecated, so code that reads it doesn't break.
- **`overlayColor` is removed from `ImageStyle`.** It had no effect.
- **`FastImage.priority` and `FastImage.cacheControl` are deprecated:** pass the strings instead (`priority: 'high'`, `cache: 'immutable'`). They still work, and will be removed in a later major version.
- **No children.** `FastImage` is a single native view and doesn't render children: use [`FastImageBackground`](../README.md#fastimagebackground) for content over an image. `FastImageBackground` is in 9.x too, so you can switch to it before upgrading.
- **The ref is the native view.** It has the same methods as before (`measure` and so on). Jest snapshots show one `FastImageView` element.
- **`fallback` is removed.** Images always load with FastImage's native views; use React Native's `Image` for images that need it.
- **On Android, images fade in by default** (300 ms); iOS doesn't change. To keep 9.x's behavior, turn it off for every image when the app starts: `FastImage.setDefaults({ transition: false })`. `transition={null}` now means the default, not no fade.
- **iOS events:** a handler added after its image loaded (e.g. `onLoad` given on a later render) isn't called for that load.
- **The native module** is the TurboModule `FastImageModule` (`NativeModules.FastImageView` is gone). This only matters to code that used it directly instead of FastImage's functions.
- **Android package:** FastImage's Android classes are in `com.fastimage` (was `com.dylanvann.fastimage`). Apps that use autolinking need no change. If your app adds `FastImageViewPackage` by hand or imports FastImage's classes, use the new name. FastImage ships its own ProGuard rules, so you can remove rules you added for it. `FastImageProgressListener` is removed.
- **Images your app loads with Glide** (a `GlideUrl`, from its own native code or another library) use React Native's OkHttp client on Android, with your app's interceptors and cookies: see [images your app loads with Glide](android-build-settings.md#images-your-app-loads-with-glide).
