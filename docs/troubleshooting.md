# Troubleshooting

## An image doesn't show

- Check `onError`: it's called with a message saying what went wrong, e.g. the HTTP status code.
- A photo library url (`ph://`) on iOS needs SDWebImagePhotosPlugin: see [photo library images](../README.md#photo-library-images-ios).
- An SVG image needs an SVG library in the app: see [SVG images](../README.md#svg-images).
- On Android, `defaultSource` doesn't show in debug builds: see [`defaultSource`](../README.md#defaultsource-number).
- If your Android app has its own Glide `AppGlideModule`, see [Android build settings](android-build-settings.md#if-your-app-has-its-own-appglidemodule).
- An image that changed on the server keeps showing the cached one until its url or `cacheKey` changes: see [when an image changes](how-is-caching-handled.md#when-an-image-changes).
- With Expo, FastImage needs a [development build](https://docs.expo.dev/develop/development-builds/introduction/): it isn't in Expo Go.

## Build problems

After installing or updating FastImage, or when a build fails for no clear reason, try:

- iOS: `cd ios && pod install` (`pod install --repo-update` if a pod's version isn't found), then Xcode's **Product › Clean Build Folder**, or delete Xcode's derived data (`~/Library/Developer/Xcode/DerivedData`).
- Android: `cd android && ./gradlew clean`.
- Expo: `npx expo prebuild --clean`, which makes the native projects again.
- Metro's cache: `npx react-native start --reset-cache`, or with Expo `npx expo start --clear`.
- Watchman: `watchman watch-del-all`.
- Dependencies: delete `node_modules` and install them again.
